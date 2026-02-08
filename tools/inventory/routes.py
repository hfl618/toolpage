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
from flask import Blueprint, render_template, request, redirect, url_for, jsonify, send_file, abort
from tools.database import d1
from tools.r2_client import upload_to_r2, delete_from_r2

curr_dir = os.path.dirname(os.path.abspath(__file__))
export_dir = os.path.join(curr_dir, 'static', 'exports')
inventory_bp = Blueprint('inventory', __name__, template_folder='templates', static_folder='static')

SYSTEM_FIELDS = [
    ('category', '品类'), ('name', '品名'), ('model', '型号'),
    ('package', '封装'), ('quantity', '数量'), ('unit', '单位'),
    ('price', '单价'), ('supplier', '供应商'), ('channel', '渠道'),
    ('location', '位置'), ('buy_time', '时间'), ('remark', '备注')
]

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

def get_current_uid():
    """从 Header 获取用户 ID，如果缺失则报错"""
    uid = request.headers.get('X-User-Id')
    if not uid:
        abort(401, description="Unauthorized: Missing X-User-Id")
    return uid

def smart_match(cols):
    mapping = {}
    for col in cols:
        col_lower = str(col).lower().strip()
        mapping[col] = ''
        for field, keywords in COLUMN_KEYWORDS.items():
            if any(kw.lower() in col_lower for kw in keywords):
                mapping[col] = field; break
    return mapping

def generate_qr(id, name, model, uid):
    """生成二维码并上传，UID 用于路径隔离"""
    try:
        qr_data = json.dumps({"id": id, "name": name, "model": model}, ensure_ascii=False)
        factory = qrcode.image.svg.SvgImage
        img = qrcode.make(qr_data, image_factory=factory)
        img_byte_arr = io.BytesIO()
        img.save(img_byte_arr)
        img_byte_arr.seek(0)
        # R2 路径：inventory/user_{uid}/qrcodes/qr_{id}.svg
        qr_url = upload_to_r2(img_byte_arr, "qrcodes", fixed_name=f"qr_{id}", app_name=f"inventory/user_{uid}")
        if qr_url:
            d1.execute("UPDATE components SET qrcode_path = ? WHERE id = ? AND user_id = ?", [qr_url, id, uid])
            return qr_url
    except Exception as e:
        print(f"QR Gen Error: {e}")
    return ""

def sanitize_filename(name):
    """清理文件名中的非法字符"""
    if not name: return "unnamed"
    for char in ['/', '\\', ':', '*', '?', '"', '<', '>', '|']:
        name = name.replace(char, '_')
    return name.strip()

@inventory_bp.route('/backup')
def backup():
    uid = get_current_uid()
    try:
        res = d1.execute("SELECT * FROM components WHERE user_id = ?", [uid])
        items = res.get('results', []) if res else []
        if not items: return jsonify(success=False, error="数据库无数据")
        data_json = json.dumps(items, ensure_ascii=False, indent=2)
        output = BytesIO()
        with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as zf:
            zf.writestr('inventory_data.json', data_json)
            for item in items:
                for field, folder, prefix in [('img_path', 'images', 'img'), ('qrcode_path', 'qrcodes', 'qr'), ('doc_path', 'docs', 'doc')]:
                    url = item.get(field)
                    if url and url.startswith('http'):
                        try:
                            resp = requests.get(url, timeout=10, verify=False)
                            if resp.status_code == 200:
                                ext = url.split('.')[-1].split('?')[0]
                                zf.writestr(f"inventory/{folder}/{prefix}_{item['id']}.{ext}", resp.content)
                        except: pass
        output.seek(0)
        return send_file(output, mimetype='application/zip', as_attachment=True, download_name=f"Inventory_Backup_{uid}_{datetime.now().strftime('%Y%m%d')}.zip")
    except Exception as e: return jsonify(success=False, error=str(e))

@inventory_bp.route('/restore', methods=['POST'])
def restore():
    uid = get_current_uid()
    file = request.files.get('backup_zip')
    if not file: return jsonify(success=False, error="未检测到文件")
    try:
        with zipfile.ZipFile(file, 'r') as zf:
            items = json.loads(zf.read('inventory_data.json').decode('utf-8'))
            db_count = 0
            for item in items:
                item['user_id'] = uid # 强制归属于当前用户
                keys = [k for k in item.keys() if k in ['img_path','doc_path','qrcode_path','category','name','model','package','quantity','unit','location','supplier','channel','price','buy_time','remark','user_id']]
                placeholders = ', '.join(['?'] * len(keys))
                sql = f"INSERT OR REPLACE INTO components ({', '.join(keys)}) VALUES ({placeholders})"
                d1.execute(sql, [item[k] for k in keys])
                db_count += 1
        return jsonify(success=True, count=db_count)
    except Exception as e: return jsonify(success=False, error=str(e))

@inventory_bp.route('/')
def index():
    uid = get_current_uid()
    args = request.args
    q = args.get('q', '').strip()
    filters = {k: args.get(k, '') for k in ['category', 'name', 'model', 'package', 'location', 'supplier', 'channel', 'buy_time']}
    
    sql = "SELECT * FROM components WHERE user_id = ?"
    params = [uid]
    
    if q:
        sql += " AND (model LIKE ? OR category LIKE ? OR name LIKE ? OR remark LIKE ?)"
        search = f"%{q}%"; params.extend([search]*4)
    for k, v in filters.items():
        if v: sql += f" AND {k} LIKE ?"; params.append(f"%{v}%")
    
    sql += " ORDER BY created_at DESC"
    res = d1.execute(sql, params)
    items = res.get('results', []) if res else []
    
    cats = d1.execute("SELECT DISTINCT category FROM components WHERE user_id = ? AND category != ''", [uid])
    locs = d1.execute("SELECT DISTINCT location FROM components WHERE user_id = ? AND location != ''", [uid])
    
    return render_template('inventory.html', items=items, categories=[r['category'] for r in cats.get('results', [])] if cats else [], locations=[r['location'] for r in locs.get('results', [])] if locs else [], q=q, filters=filters, system_fields=SYSTEM_FIELDS)

@inventory_bp.route('/add', methods=['POST'])
def add():
    uid = get_current_uid()
    d, f = request.form, request.files
    cols = ['category', 'name', 'model', 'package', 'quantity', 'unit', 'location', 'supplier', 'channel', 'price', 'buy_time', 'remark', 'user_id']
    sql = f"INSERT INTO components ({','.join(cols)}) VALUES ({','.join(['?']*len(cols))})"
    
    try: p = float(str(d.get('price', '0')).replace('¥','').replace(',','').strip() or 0.0)
    except: p = 0.0
    
    vals = [d.get('category','未分类'), d.get('name','未命名'), d.get('model',''), d.get('package','N/A'), int(float(d.get('quantity',0))), d.get('unit','个'), d.get('location','未定义'), d.get('supplier','未知'), d.get('channel','未知'), p, d.get('buy_time',''), d.get('remark',''), uid]
    
    d1.execute(sql, vals)
    res = d1.execute("SELECT id FROM components WHERE user_id = ? ORDER BY id DESC LIMIT 1", [uid])
    if res and res.get('results'):
        new_id = res['results'][0]['id']
        app_path = f"inventory/user_{uid}"
        img_url = upload_to_r2(f.get('img_file'), 'images', fixed_name=f"img_{new_id}", app_name=app_path) if f.get('img_file') else ''
        doc_url = upload_to_r2(f.get('doc_file'), 'docs', fixed_name=f"doc_{new_id}", app_name=app_path) if f.get('doc_file') else ''
        d1.execute("UPDATE components SET img_path = ?, doc_path = ? WHERE id = ? AND user_id = ?", [img_url, doc_url, new_id, uid])
        generate_qr(new_id, d.get('name',''), d.get('model',''), uid)
    
    return redirect(url_for('inventory.index'))

@inventory_bp.route('/get/<int:id>')
def get_one(id):
    uid = get_current_uid()
    res = d1.execute("SELECT * FROM components WHERE id = ? AND user_id = ?", [id, uid])
    if res and res.get('results'): return jsonify(success=True, data=res['results'][0])
    return jsonify(success=False), 404

@inventory_bp.route('/update/<int:id>', methods=['POST'])
def update(id):
    uid = get_current_uid()
    d, f = request.form, request.files
    curr_res = d1.execute("SELECT name, model, img_path, doc_path, qrcode_path FROM components WHERE id = ? AND user_id = ?", [id, uid])
    if not curr_res or not curr_res.get('results'): abort(403)
    curr = curr_res['results'][0]
    
    updates = {
        'category': d.get('category'), 'name': d.get('name'), 'model': d.get('model'),
        'package': d.get('package'), 'quantity': int(float(d.get('quantity', 0))),
        'unit': d.get('unit'), 'location': d.get('location'), 'supplier': d.get('supplier'),
        'channel': d.get('channel'), 'buy_time': d.get('buy_time'), 'remark': d.get('remark')
    }
    try: updates['price'] = float(str(d.get('price', '0')).replace('¥','').replace(',','').strip() or 0.0)
    except: updates['price'] = 0.0
    
    app_path = f"inventory/user_{uid}"
    if f.get('img_file'):
        if curr.get('img_path'): delete_from_r2(curr['img_path'])
        updates['img_path'] = upload_to_r2(f['img_file'], 'images', fixed_name=f"img_{id}", app_name=app_path)
    if f.get('doc_file'):
        if curr.get('doc_path'): delete_from_r2(curr['doc_path'])
        updates['doc_path'] = upload_to_r2(f['doc_file'], 'docs', fixed_name=f"doc_{id}", app_name=app_path)
        
    set_sql = ", ".join([f"{c}=?" for c in updates.keys()])
    d1.execute(f"UPDATE components SET {set_sql} WHERE id=? AND user_id=?", list(updates.values()) + [id, uid])
    if d.get('name') != curr.get('name') or d.get('model') != curr.get('model'):
        generate_qr(id, d.get('name'), d.get('model'), uid)
    return redirect(url_for('inventory.index'))

@inventory_bp.route('/delete/<int:id>')
def delete(id):
    uid = get_current_uid()
    res = d1.execute("SELECT img_path, doc_path, qrcode_path FROM components WHERE id=? AND user_id=?", [id, uid])
    if res and res.get('results'):
        item = res['results'][0]
        for key in ['img_path', 'doc_path', 'qrcode_path']:
            if item.get(key): delete_from_r2(item[key])
        d1.execute("DELETE FROM components WHERE id=? AND user_id=?", [id, uid])
    return redirect(url_for('inventory.index'))

@inventory_bp.route('/batch_delete', methods=['POST'])
def batch_delete():
    uid = get_current_uid()
    ids = request.form.getlist('ids[]')
    for i in ids:
        res = d1.execute("SELECT img_path, doc_path, qrcode_path FROM components WHERE id=? AND user_id=?", [i, uid])
        if res and res.get('results'):
            item = res['results'][0]
            for key in ['img_path', 'doc_path', 'qrcode_path']:
                if item.get(key): delete_from_r2(item[key])
            d1.execute("DELETE FROM components WHERE id=? AND user_id=?", [i, uid])
    return jsonify(success=True)

@inventory_bp.route('/batch_update', methods=['POST'])
def batch_update():
    uid = get_current_uid()
    data = request.json
    ids, updates = data.get('ids', []), data.get('updates', {})
    allowed_fields = ['category', 'name', 'package', 'unit', 'location', 'supplier', 'channel', 'price', 'buy_time', 'remark']
    set_clauses, values = [], []
    for field, val in updates.items():
        if field in allowed_fields:
            set_clauses.append(f"{field} = ?")
            values.append(val)
    if not set_clauses: return jsonify(success=False, error="无可修改字段")
    sql = f"UPDATE components SET {', '.join(set_clauses)} WHERE id IN ({','.join(['?']*len(ids))}) AND user_id = ?"
    d1.execute(sql, values + ids + [uid])
    return jsonify(success=True)

@inventory_bp.route('/import/parse', methods=['POST'])
def import_parse():
    mode = request.form.get('mode')
    try:
        if mode == 'file': df = pd.read_excel(request.files.get('file'), engine='openpyxl').fillna('')
        else: df = pd.DataFrame([r.split('\t') for r in request.form.get('text','').strip().split('\n')]).fillna(''); df.columns=df.iloc[0]; df=df[1:]
        return jsonify(success=True, columns=df.columns.tolist(), total_rows=len(df), preview=df.head(3).values.tolist(), mapping=smart_match(df.columns.tolist()), raw_data=df.to_dict(orient='records'))
    except Exception as e: return jsonify(success=False, error=str(e))

@inventory_bp.route('/import/verify', methods=['POST'])
def import_verify():
    uid = get_current_uid()
    data = request.json
    mapping, raw = data.get('mapping'), data.get('raw_data')
    standardized = []
    fields_to_check = ['category', 'name', 'model', 'package', 'quantity', 'location', 'price', 'unit', 'supplier', 'channel']
    for row in raw:
        item = {f: '' for f in fields_to_check}
        for col, field in mapping.items():
            if field in fields_to_check and col in row: item[field] = str(row[col]).strip()
        if item.get('name') or item.get('model'): standardized.append(item)
    
    existing_res = d1.execute("SELECT id, name, model, package FROM components WHERE user_id = ?", [uid])
    existing = existing_res.get('results', []) if existing_res else []
    
    conflicts, uniques = [], []
    for item in standardized:
        match = next((r for r in existing if (str(r['name']).lower() == str(item['name']).lower() and str(r['package']).lower() == str(item['package']).lower()) or (str(r['model']).lower() == str(item['model']).lower() and str(r['package']).lower() == str(item['package']).lower())), None)
        if match: conflicts.append({'new': item, 'old': match, 'diff': {f: True for f in fields_to_check}})
        else: uniques.append(item)
    return jsonify(success=True, conflicts=conflicts, uniques=uniques)

@inventory_bp.route('/import/execute', methods=['POST'])
def import_execute():
    uid = get_current_uid()
    data = request.json
    uniques, resolved = data.get('uniques', []), data.get('resolved', [])
    
    added, updated, skipped = 0, 0, 0
    
    for item in uniques:
        item['user_id'] = uid
        keys = list(item.keys())
        d1.execute(f"INSERT INTO components ({','.join(keys)}) VALUES ({','.join(['?']*len(keys))})", [item[k] for k in keys])
        added += 1
        res = d1.execute("SELECT id FROM components WHERE user_id = ? ORDER BY id DESC LIMIT 1", [uid])
        if res and res.get('results'):
            generate_qr(res['results'][0]['id'], item.get('name',''), item.get('model',''), uid)
            
    for entry in resolved:
        strat, new, old_id = entry.get('strategy'), entry.get('new'), entry.get('old_id')
        if strat == 'merge':
            d1.execute("UPDATE components SET quantity = quantity + ? WHERE id = ? AND user_id = ?", [new.get('quantity',0), old_id, uid])
            updated += 1
        elif strat == 'cover':
            new['user_id'] = uid
            keys = [k for k in new.keys() if k != 'id']
            d1.execute(f"UPDATE components SET {', '.join([f'{k}=?' for k in keys])} WHERE id=? AND user_id=?", [new[k] for k in keys] + [old_id, uid])
            updated += 1
        else:
            skipped += 1
            
    return jsonify(success=True, added=added, updated=updated, skipped=skipped)

@inventory_bp.route('/get_export_files')
def get_export_files():
    files = []
    if os.path.exists(export_dir):
        for f in os.listdir(export_dir):
            if f.endswith(('.xlsx', '.csv', '.zip')):
                fp = os.path.join(export_dir, f)
                files.append({'name': f, 'time': datetime.fromtimestamp(os.path.getmtime(fp)).strftime('%Y-%m-%d %H:%M'), 'size': f"{os.path.getsize(fp)/1024:.1f} KB"})
    files.sort(key=lambda x: x['time'], reverse=True)
    return jsonify({'files': files[:20]})

@inventory_bp.route('/delete_export_file/<filename>')
def delete_export_file(filename):
    try:
        if '..' in filename or '/' in filename or '\\' in filename: return jsonify(success=False, error="非法文件名")
        fp = os.path.join(export_dir, filename)
        if os.path.exists(fp): os.remove(fp); return jsonify(success=True)
        return jsonify(success=False, error="文件不存在")
    except Exception as e: return jsonify(success=False, error=str(e))

@inventory_bp.route('/clear_export_history')
def clear_export_history():
    try:
        if os.path.exists(export_dir):
            for f in os.listdir(export_dir):
                if f.endswith(('.xlsx', '.csv', '.zip')): os.remove(os.path.join(export_dir, f))
        return jsonify(success=True)
    except Exception as e: return jsonify(success=False, error=str(e))

@inventory_bp.route('/export', methods=['POST'])
def export():
    uid = get_current_uid()
    data = request.form
    ids_str, fields = data.get('ids', ''), data.getlist('fields') or [f[0] for f in SYSTEM_FIELDS]
    ids = [int(i) for i in ids_str.split(',') if i.strip().isdigit()] if ids_str else []
    fmt, with_assets = data.get('format', 'xlsx'), data.get('with_assets') == '1'
    filename_mode, custom_name = data.get('filename_mode', 'default'), data.get('custom_filename', '').strip()
    if ids:
        sql = f"SELECT * FROM components WHERE id IN ({','.join(['?']*len(ids))}) AND user_id = ?"; res = d1.execute(sql, ids + [uid])
    else: sql = "SELECT * FROM components WHERE user_id = ?"; res = d1.execute(sql, [uid])
    items = res.get('results', []) if res else []
    if not items: return jsonify(success=False, error="没有数据可导出")
    export_data = []
    field_map = {k: v for k, v in SYSTEM_FIELDS}
    for item in items:
        row = {}
        for f in fields: row[field_map.get(f, f)] = item.get(f, '')
        export_data.append(row)
    df = pd.DataFrame(export_data)
    if filename_mode == 'custom' and custom_name: base_name = sanitize_filename(custom_name)
    elif len(items) == 1: base_name = sanitize_filename(f"{items[0].get('name')}_{items[0].get('model')}")
    else: base_name = f"库存导出_{datetime.now().strftime('%m%d_%H%M')}"
    try:
        output = BytesIO()
        if fmt == 'zip' and with_assets:
            final_name, mimetype = f"{base_name}.zip", 'application/zip'
            with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as zf:
                excel_buf = BytesIO(); df.to_excel(excel_buf, index=False); zf.writestr(f"{base_name}.xlsx", excel_buf.getvalue())
                for item in items:
                    file_id_name = sanitize_filename(f"{item.get('name')}_{item.get('model')}")
                    for field, folder in [('img_path', 'images'), ('qrcode_path', 'qrcodes')]:
                        url = item.get(field)
                        if url and url.startswith('http'):
                            try:
                                c = requests.get(url, timeout=5, verify=False).content
                                zf.writestr(f"inventory/{folder}/{file_id_name}.{url.split('.')[-1]}", c)
                            except: pass
        elif fmt == 'xlsx':
            final_name, mimetype = f"{base_name}.xlsx", 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            df.to_excel(output, index=False)
            if not os.path.exists(export_dir): os.makedirs(export_dir)
            with open(os.path.join(export_dir, final_name), 'wb') as f: f.write(output.getvalue())
        else:
            final_name, mimetype = f"{base_name}.csv", 'text/csv'; df.to_csv(output, index=False, encoding='utf-8-sig')
        output.seek(0)
        return send_file(output, mimetype=mimetype, as_attachment=True, download_name=final_name)
    except Exception as e: return jsonify(success=False, error=str(e))

@inventory_bp.route('/delete_file/<int:id>/<field>')
def delete_file(id, field):
    uid = get_current_uid()
    if field not in ['img_path', 'doc_path']: return jsonify(success=False, error="无效字段")
    res = d1.execute(f"SELECT {field} FROM components WHERE id=? AND user_id=?", [id, uid])
    if res and res.get('results'):
        url = res['results'][0].get(field)
        if url: delete_from_r2(url); d1.execute(f"UPDATE components SET {field} = '' WHERE id=? AND user_id=?", [id, uid]); return jsonify(success=True)
    return jsonify(success=False, error="文件未找到")

@inventory_bp.route('/view_doc/<int:id>')
def view_doc(id):
    uid = get_current_uid()
    res = d1.execute("SELECT doc_path FROM components WHERE id=? AND user_id=?", [id, uid])
    if res and res.get('results'):
        url = res['results'][0].get('doc_path')
        if url: return redirect(url)
    abort(404, description="文档未找到")

@inventory_bp.route('/regenerate_qr/<int:id>')
def regenerate_qr_api(id):
    uid = get_current_uid()
    res = d1.execute("SELECT name, model, qrcode_path FROM components WHERE id=? AND user_id=?", [id, uid])
    if res and res.get('results'):
        item = res['results'][0]
        if item.get('qrcode_path'): delete_from_r2(item['qrcode_path'])
        new_url = generate_qr(id, item.get('name'), item.get('model'), uid)
        if new_url: return jsonify(success=True, qrcode_path=new_url)
    return jsonify(success=False, error="生成失败")
