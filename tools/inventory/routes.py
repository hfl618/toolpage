import os
import qrcode
import qrcode.image.svg
import io
import json
import pandas as pd
import requests
import zipfile
from datetime import datetime
from io import BytesIO
from flask import Blueprint, render_template, request, redirect, url_for, jsonify, send_file
from tools.database import d1
from .r2_utils import upload_to_r2, delete_from_r2

curr_dir = os.path.dirname(os.path.abspath(__file__))
export_dir = os.path.join(curr_dir, 'static', 'exports')
inventory_bp = Blueprint('inventory', __name__, template_folder='templates', static_folder='static')

SYSTEM_FIELDS = [
    ('category', '品类'), ('name', '品名'), ('model', '型号'),
    ('package', '封装'), ('quantity', '数量'), ('unit', '单位'),
    ('price', '单价'), ('supplier', '供应商'), ('channel', '渠道'),
    ('location', '位置'), ('buy_time', '时间'), ('remark', '备注')
]

# ... (COLUMN_KEYWORDS and smart_match)

# ---------------- 导出功能模块 ----------------

@inventory_bp.route('/get_export_files')
def get_export_files():
    """获取所有历史导出文件"""
    files = []
    if os.path.exists(export_dir):
        for f in os.listdir(export_dir):
            if f.endswith(('.xlsx', '.csv', '.zip')):
                fp = os.path.join(export_dir, f)
                files.append({
                    'name': f,
                    'time': datetime.fromtimestamp(os.path.getmtime(fp)).strftime('%Y-%m-%d %H:%M'),
                    'size': f"{os.path.getsize(fp)/1024:.1f} KB"
                })
    files.sort(key=lambda x: x['time'], reverse=True)
    return jsonify({'files': files[:20]})

@inventory_bp.route('/backup')
def backup():
    """全系统数据一键备份"""
    try:
        # 1. 抓取所有数据
        res = d1.execute("SELECT * FROM components")
        items = res.get('results', []) if res else []
        if not items: return jsonify(success=False, error="数据库无数据")

        # 2. 转换为 JSON
        data_json = json.dumps(items, ensure_ascii=False, indent=2)
        
        # 3. 打包为 ZIP
        output = BytesIO()
        with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as zf:
            zf.writestr('inventory_backup.json', data_json)
            # 添加备份说明
            readme = f"Meta Inventory Backup\nTime: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\nCount: {len(items)}"
            zf.writestr('README.txt', readme)
        
        output.seek(0)
        filename = f"Inventory_Backup_{datetime.now().strftime('%Y%m%d_%H%M')}.zip"
        return send_file(output, mimetype='application/zip', as_attachment=True, download_name=filename)
    except Exception as e:
        return jsonify(success=False, error=str(e))

@inventory_bp.route('/restore', methods=['POST'])
def restore():
    """全系统数据一键还原"""
    try:
        file = request.files.get('backup_zip')
        if not file: return jsonify(success=False, error="未检测到文件")
        
        # 1. 解压读取 JSON
        with zipfile.ZipFile(file, 'r') as zf:
            if 'inventory_backup.json' not in zf.namelist():
                return jsonify(success=False, error="无效的备份包：未找到数据文件")
            
            data_json = zf.read('inventory_backup.json').decode('utf-8')
            items = json.loads(data_json)
        
        if not items: return jsonify(success=False, error="备份包中无有效数据")

        # 2. 批量写入 (INSERT OR REPLACE)
        # 这种方式会根据 ID 覆盖已有记录，保留 ID 的连续性
        count = 0
        for item in items:
            # 过滤掉不存在于当前表结构的字段（如果以后有变动）
            # 这里我们假定结构一致，直接提取 keys
            keys = [k for k in item.keys() if k != 'created_at'] # 忽略自动生成的列
            placeholders = ', '.join(['?'] * len(keys))
            sql = f"INSERT OR REPLACE INTO components ({', '.join(keys)}) VALUES ({placeholders})"
            d1.execute(sql, [item[k] for k in keys])
            count += 1
            
        return jsonify(success=True, count=count)
    except Exception as e:
        return jsonify(success=False, error=str(e))


# ... (rest of the file)

COLUMN_KEYWORDS = {
    'category': ['品类', '分类', 'class', 'category','分类','类别'],
    'name': ['品名', '名称', 'name', 'item'],
    'model': ['型号', '规格', 'model', 'part'],
    'package': ['封装', 'package', 'pkg'],
    'quantity': ['数量', 'qty', 'count', 'pcs'],
    'unit': ['单位', 'unit'],
    'location': ['位置', '库位', 'location', 'bin'],
    'supplier': ['供应商', '厂家', 'supplier', 'vendor'],
    'channel': ['渠道', '来源', 'channel'],
    'price': ['单价', '价格', 'price', 'cost'],
    'buy_time': ['时间', '日期', 'date'],
    'remark': ['备注', '说明', 'remark']
}

def smart_match(cols):
    mapping = {}
    for col in cols:
        col_lower = str(col).lower().strip()
        mapping[col] = ''
        for field, keywords in COLUMN_KEYWORDS.items():
            if any(kw.lower() in col_lower for kw in keywords):
                mapping[col] = field; break
    return mapping

def generate_qr(id, name, model):
    """Generate QR code as SVG and upload to R2 (No Pillow required)"""
    try:
        qr_data = json.dumps({"id": id, "name": name, "model": model}, ensure_ascii=False)
        factory = qrcode.image.svg.SvgImage
        img = qrcode.make(qr_data, image_factory=factory)
        img_byte_arr = io.BytesIO()
        img.save(img_byte_arr)
        img_byte_arr.seek(0)
        qr_url = upload_to_r2(img_byte_arr, "qrcodes", prefix=f"qr_{id}")
        if qr_url:
            d1.execute("UPDATE components SET qrcode_path = ? WHERE id = ?", [qr_url, id])
            return qr_url
    except Exception as e:
        print(f"QR Gen Error: {e}")
    return ""

@inventory_bp.route('/')
def index():
    args = request.args
    q = args.get('q', '').strip()
    filters = {k: args.get(k, '') for k in ['category', 'name', 'model', 'package', 'location', 'supplier', 'channel', 'buy_time']}
    sql = "SELECT * FROM components WHERE 1=1"
    params = []
    if q:
        sql += " AND (model LIKE ? OR category LIKE ? OR name LIKE ? OR remark LIKE ?)"
        search = f"%{q}%"; params.extend([search]*4)
    for k, v in filters.items():
        if v: sql += f" AND {k} LIKE ?"; params.append(f"%{v}%")
    sql += " ORDER BY created_at DESC"
    res = d1.execute(sql, params)
    items = res.get('results', []) if res else []
    for item in items:
        try: item['price'] = float(str(item.get('price', '0')).replace('¥','').replace(',','').strip() or 0.0)
        except: item['price'] = 0.0
        try: item['quantity'] = int(float(str(item.get('quantity', '0')).replace(',','').strip() or 0))
        except: item['quantity'] = 0
    cats = d1.execute("SELECT DISTINCT category FROM components WHERE category != ''")
    locs = d1.execute("SELECT DISTINCT location FROM components WHERE location != ''")
    return render_template('inventory.html', items=items, categories=[r['category'] for r in cats.get('results', [])] if cats else [], locations=[r['location'] for r in locs.get('results', [])] if locs else [], q=q, filters=filters, system_fields=SYSTEM_FIELDS)

@inventory_bp.route('/add', methods=['POST'])
def add():
    d = request.form
    f = request.files
    img_url = upload_to_r2(f.get('img_file'), 'images') if f.get('img_file') else ''
    doc_url = upload_to_r2(f.get('doc_file'), 'docs', prefix='doc') if f.get('doc_file') else ''
    cols = ['img_path', 'doc_path', 'category', 'name', 'model', 'package', 'quantity', 'unit', 'location', 'supplier', 'channel', 'price', 'buy_time', 'remark', 'creator']
    sql = f"INSERT INTO components ({','.join(cols)}) VALUES ({','.join(['?']*len(cols))})"
    try: p = float(str(d.get('price', '0')).replace('¥','').replace(',','').strip() or 0.0)
    except: p = 0.0
    vals = [img_url, doc_url, d.get('category','未分类'), d.get('name','未命名'), d.get('model',''), d.get('package','N/A'), int(float(d.get('quantity',0) or 0)), d.get('unit','个'), d.get('location','未定义'), d.get('supplier','未知'), d.get('channel','未知'), p, d.get('buy_time',''), d.get('remark',''), '管理员']
    d1.execute(sql, vals)
    res = d1.execute("SELECT id FROM components ORDER BY id DESC LIMIT 1")
    if res and res.get('results'):
        new_id = res['results'][0]['id']
        generate_qr(new_id, d.get('name',''), d.get('model',''))
    return redirect(url_for('inventory.index'))

@inventory_bp.route('/get/<int:id>')
def get_one(id):
    res = d1.execute("SELECT * FROM components WHERE id = ?", [id])
    if res and res.get('results'): return jsonify(success=True, data=res['results'][0])
    return jsonify(success=False)

@inventory_bp.route('/update/<int:id>', methods=['POST'])
def update(id):
    d = request.form
    f = request.files
    curr_res = d1.execute("SELECT name, model, img_path, doc_path, qrcode_path FROM components WHERE id = ?", [id])
    curr = curr_res['results'][0] if curr_res and curr_res.get('results') else {}
    updates = {
        'category': d.get('category'), 'name': d.get('name'), 'model': d.get('model'),
        'package': d.get('package'), 'quantity': int(float(d.get('quantity', 0))),
        'unit': d.get('unit'), 'location': d.get('location'), 'supplier': d.get('supplier'),
        'channel': d.get('channel'), 'buy_time': d.get('buy_time'), 'remark': d.get('remark')
    }
    try: updates['price'] = float(str(d.get('price', '0')).replace('¥','').replace(',','').strip() or 0.0)
    except: updates['price'] = 0.0
    if f.get('img_file'):
        if curr.get('img_path'): delete_from_r2(curr['img_path'])
        updates['img_path'] = upload_to_r2(f['img_file'], 'images')
    if f.get('doc_file'):
        if curr.get('doc_path'): delete_from_r2(curr['doc_path'])
        updates['doc_path'] = upload_to_r2(f['doc_file'], 'docs', prefix='doc')
    set_sql = ", ".join([f"{c}=?" for c in updates.keys()])
    d1.execute(f"UPDATE components SET {set_sql} WHERE id=?", list(updates.values()) + [id])
    if not curr.get('qrcode_path') or d.get('name') != curr.get('name') or d.get('model') != curr.get('model'):
        if curr.get('qrcode_path'): delete_from_r2(curr['qrcode_path'])
        generate_qr(id, d.get('name'), d.get('model'))
    return redirect(url_for('inventory.index'))

@inventory_bp.route('/delete_file/<int:id>/<field>')
def delete_file(id, field):
    if field not in ['img_path', 'doc_path']: return jsonify(success=False, error="Invalid field")
    res = d1.execute(f"SELECT {field} FROM components WHERE id=?", [id])
    if res and res.get('results'):
        url = res['results'][0].get(field)
        if url:
            delete_from_r2(url)
            d1.execute(f"UPDATE components SET {field} = '' WHERE id=?", [id])
            return jsonify(success=True)
    return jsonify(success=False, error="File not found")

@inventory_bp.route('/regenerate_qr/<int:id>')
def regenerate_qr_api(id):
    res = d1.execute("SELECT name, model, qrcode_path FROM components WHERE id=?", [id])
    if res and res.get('results'):
        item = res['results'][0]
        if item.get('qrcode_path'): delete_from_r2(item['qrcode_path'])
        new_url = generate_qr(id, item.get('name'), item.get('model'))
        if new_url: return jsonify(success=True, qrcode_path=new_url)
    return jsonify(success=False, error="Failed to regenerate QR")

@inventory_bp.route('/delete/<int:id>')
def delete(id):
    res = d1.execute("SELECT img_path, doc_path, qrcode_path FROM components WHERE id=?", [id])
    if res and res.get('results'):
        item = res['results'][0]
        for key in ['img_path', 'doc_path', 'qrcode_path']:
            if item.get(key): delete_from_r2(item[key])
    d1.execute("DELETE FROM components WHERE id=?", [id])
    return redirect(url_for('inventory.index'))

@inventory_bp.route('/batch_delete', methods=['POST'])
def batch_delete():
    ids = request.form.getlist('ids[]')
    if ids:
        for i in ids:
            res = d1.execute("SELECT img_path, doc_path, qrcode_path FROM components WHERE id=?", [i])
            if res and res.get('results'):
                item = res['results'][0]
                for key in ['img_path', 'doc_path', 'qrcode_path']:
                    if item.get(key): delete_from_r2(item[key])
        d1.execute(f"DELETE FROM components WHERE id IN ({','.join(['?']*len(ids))})", ids)
    return jsonify(success=True)

@inventory_bp.route('/batch_update', methods=['POST'])
def batch_update():
    data = request.json
    ids, updates = data.get('ids', []), data.get('updates', {})
    if not ids or not updates: return jsonify(success=False, error="未检测到修改内容")
    allowed_fields = ['category', 'name', 'package', 'unit', 'location', 'supplier', 'channel', 'price', 'buy_time', 'remark']
    set_clauses, values = [], []
    for field, val in updates.items():
        if field in allowed_fields:
            set_clauses.append(f"{field} = ?")
            if field == 'price':
                try: val = float(val)
                except: val = 0.0
            values.append(val)
    if not set_clauses: return jsonify(success=False, error="无可修改的字段")
    sql = f"UPDATE components SET {', '.join(set_clauses)} WHERE id IN ({','.join(['?']*len(ids))})"
    try:
        d1.execute(sql, values + ids)
        return jsonify(success=True)
    except Exception as e: return jsonify(success=False, error=str(e))

@inventory_bp.route('/import/parse', methods=['POST'])
def import_parse():
    mode = request.form.get('mode')
    try:
        if mode == 'file': df = pd.read_excel(request.files.get('file'), engine='openpyxl').fillna('')
        else: df = pd.DataFrame([r.split('\t') for r in request.form.get('text','').strip().split('\n')]).fillna(''); df.columns=df.iloc[0]; df=df[1:]
        cols = df.columns.tolist()
        return jsonify(success=True, columns=cols, total_rows=len(df), preview=df.head(3).values.tolist(), mapping=smart_match(cols), raw_data=df.to_dict(orient='records'))
    except Exception as e: return jsonify(success=False, error=str(e))

@inventory_bp.route('/import/verify', methods=['POST'])
def import_verify():
    data = request.json
    mapping, raw = data.get('mapping'), data.get('raw_data')
    standardized = []
    fields_to_check = ['category', 'name', 'model', 'package', 'quantity', 'location', 'price', 'unit', 'supplier', 'channel']
    for row in raw:
        item = {f: '' for f in fields_to_check}
        for col, field in mapping.items():
            if field in fields_to_check and col in row: 
                val = row.get(col, '')
                item[field] = str(val).strip() if val is not None else ''
        try: item['quantity'] = int(float(str(item.get('quantity',0)).replace(',','').strip() or 0))
        except: item['quantity'] = 0
        try: item['price'] = float(str(item.get('price',0)).replace('¥','').replace(',','').strip() or 0.0)
        except: item['price'] = 0.0
        if item.get('name') or item.get('model'): standardized.append(item)

    # 获取现有数据用于比对
    existing_res = d1.execute("SELECT id, name, model, package, category, quantity, unit, price, location, supplier, channel FROM components")
    existing_items = existing_res.get('results', []) if existing_res else []
    
    # 构建快速查找索引 (名称|封装 和 型号|封装)
    name_pkg_map = {}
    model_pkg_map = {}
    for r in existing_items:
        n = str(r.get('name') or '').strip().lower()
        m = str(r.get('model') or '').strip().lower()
        p = str(r.get('package') or '').strip().lower()
        if n: name_pkg_map[f"{n}|{p}"] = r
        if m: model_pkg_map[f"{m}|{p}"] = r

    conflicts, uniques = [], []
    for item in standardized:
        target_name = str(item.get('name') or '').strip().lower()
        target_model = str(item.get('model') or '').strip().lower()
        target_pkg = str(item.get('package') or '').strip().lower()
        
        # 严格逻辑：名称+封装 匹配 OR 型号+封装 匹配
        match = name_pkg_map.get(f"{target_name}|{target_pkg}") or model_pkg_map.get(f"{target_model}|{target_pkg}")
        
        if match:
            diff = {f: str(match.get(f, '')).strip() != str(item.get(f, '')).strip() for f in fields_to_check}
            conflicts.append({'new': item, 'old': match, 'diff': diff})
        else:
            uniques.append(item)
            
    return jsonify(success=True, conflicts=conflicts, uniques=uniques)

@inventory_bp.route('/import/execute', methods=['POST'])
def import_execute():
    data = request.json
    uniques, resolved = data.get('uniques', []), data.get('resolved', [])
    added, updated, skipped = 0, 0, 0
    
    # 1. 处理完全无冲突的新增项
    for item in uniques:
        keys = list(item.keys())
        d1.execute(f"INSERT INTO components ({','.join(keys)}) VALUES ({','.join(['?']*len(keys))})", [item[k] for k in keys])
        
        # 立即生成二维码
        res = d1.execute("SELECT id FROM components ORDER BY id DESC LIMIT 1")
        if res and res.get('results'):
            new_id = res['results'][0]['id']
            generate_qr(new_id, item.get('name',''), item.get('model',''))
        added += 1

    # 2. 处理冲突解决项
    for entry in resolved:
        strat, new, old_id = entry.get('strategy'), entry.get('new'), entry.get('old_id')
        
        if strat == 'merge': 
            d1.execute("UPDATE components SET quantity = quantity + ? WHERE id = ?", [new.get('quantity',0), old_id])
            # Merge 后通常无需更新二维码，除非以后把数量也放进二维码。暂保持不变。
            updated += 1
            
        elif strat == 'cover':
            # 覆盖：先获取旧记录以删除旧二维码（如果品名型号变了）
            old_res = d1.execute("SELECT name, model, qrcode_path FROM components WHERE id=?", [old_id])
            if old_res and old_res.get('results'):
                old_item = old_res['results'][0]
                # 如果品名或型号有变，或者本来就没二维码，则更新
                if old_item.get('qrcode_path'): delete_from_r2(old_item['qrcode_path'])
            
            keys = [k for k in new.keys() if k != 'id']
            d1.execute(f"UPDATE components SET {', '.join([f'{k}=?' for k in keys])} WHERE id=?", [new[k] for k in keys] + [old_id])
            
            # 强制重新生成二维码
            generate_qr(old_id, new.get('name',''), new.get('model',''))
            updated += 1
            
        elif strat == 'new': 
            # 作为新项插入
            new['model'] += '_RE' # 自动加后缀防重复
            keys = list(new.keys())
            d1.execute(f"INSERT INTO components ({','.join(keys)}) VALUES ({','.join(['?']*len(keys))})", [new[k] for k in keys])
            
            # 为这个新项生成二维码
            res = d1.execute("SELECT id FROM components ORDER BY id DESC LIMIT 1")
            if res and res.get('results'):
                new_id = res['results'][0]['id']
                generate_qr(new_id, new.get('name',''), new.get('model',''))
            added += 1
            
        else: 
            skipped += 1
            
    return jsonify(success=True, added=added, updated=updated, skipped=skipped)