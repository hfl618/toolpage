import os
import qrcode
import qrcode.image.svg
import io
import json
import pandas as pd
import requests
import zipfile
import re
from datetime import datetime
from io import BytesIO
from flask import Blueprint, render_template, request, redirect, url_for, jsonify, send_file, abort
from werkzeug.utils import secure_filename
from tools.database import d1
from tools.r2_client import upload_to_r2, delete_from_r2
from tools.config import Config

curr_dir = os.path.dirname(os.path.abspath(__file__))
export_dir = os.path.join(curr_dir, 'static', 'exports')
inventory_bp = Blueprint('inventory', __name__, template_folder='templates', static_folder='static')

SYSTEM_FIELDS = [
    ('category', '品类'), ('name', '品名'), ('model', '型号'),
    ('package', '封装'), ('quantity', '数量'), ('unit', '单位'),
    ('price', '单价'), ('supplier', '供应商'), ('channel', '渠道'),
    ('location', '位置'), ('buy_time', '时间'), ('remark', '备注')
]

def get_current_uid():
    uid = request.headers.get('X-User-Id')
    if not uid: abort(401)
    return uid

def smart_match(cols):
    mapping = {}
    field_keywords = {
        'model': ['mpn', 'p/n', 'part number', 'part_no', 'pn', 'model', 'type', 'spec', 'specification', 'value', 'val', '型号', '规格', '参数', '料号'],
        'name': ['description', 'desc', 'detail', 'product name', 'item name', 'component', 'part name', 'name', 'item', '品名', '名称', '物料名称'],
        'package': ['footprint', 'package', 'pkg', 'encapsulation', 'case', 'size', 'dimension', '封装', '外形', '尺寸'],
        'quantity': ['quantity', 'qty', 'count', 'amount', 'number', 'stock', 'inventory', 'balance', 'pcs', '数量', '库存', '实存'],
        'supplier': ['manufacturer', 'mfr', 'brand', 'vendor', 'supplier', 'maker', '品牌', '厂商', '厂家', '供应商'],
        'location': ['location', 'loc', 'bin', 'rack', 'shelf', 'warehouse', 'wh', 'place', 'position', '库位', '货位', '位置'],
        'category': ['category', 'cat', 'class', 'group', 'family', 'sort', 'kind', '分类', '品类', '类型'],
        'unit': ['unit', 'uom', 'meas', '单位'],
        'price': ['price', 'cost', 'unit price', '单价', '价格'],
        'channel': ['channel', 'source', '渠道', '来源'],
        'buy_time': ['date', 'time', 'buy time', '时间', '日期'],
        'remark': ['remark', 'note', 'comment', 'memo', 'ref', '备注', '说明']
    }
    for col in cols:
        col_clean = str(col).lower().strip().replace('_', ' ').replace('-', ' ')
        mapping[col] = ''
        for field, keywords in field_keywords.items():
            if any(kw.lower() in col_clean for kw in keywords):
                mapping[col] = field; break
    return mapping

def generate_qr(id, name, model, uid):
    try:
        qr_content = json.dumps({"id": str(id), "uid": str(uid)}, separators=(',', ':'))
        img = qrcode.make(qr_content, image_factory=qrcode.image.svg.SvgImage)
        buf = io.BytesIO()
        img.save(buf); buf.seek(0)
        url = upload_to_r2(buf, "qrcodes", fixed_name=f"qr_{id}", app_name=f"inventory/user_{uid}")
        if url: d1.execute("UPDATE components SET qrcode_path = ? WHERE id = ?", [url, id])
        return url
    except: return ""

def sanitize_filename(name):
    if not name: return "unnamed"
    return re.sub(r'[\\/:*?"<>|]', '_', name).strip()

def _perform_delete(id, uid):
    res = d1.execute("SELECT img_path, doc_path, qrcode_path FROM components WHERE id=? AND user_id=?", [id, uid])
    if res and res.get('results'):
        item = res['results'][0]
        for field in ['img_path', 'doc_path', 'qrcode_path']:
            url = item.get(field)
            if url and url.startswith('http'):
                delete_from_r2(url)
        d1.execute("DELETE FROM components WHERE id=? AND user_id=?", [id, uid])
        return True
    return False

@inventory_bp.route('/')
def index():
    import glob
    uid = get_current_uid()
    args = request.args
    q, filters = args.get('q', '').strip(), {k: args.get(k, '') for k in ['category', 'name', 'model', 'package', 'location', 'supplier', 'channel', 'buy_time']}
    sql, params = "SELECT * FROM components WHERE user_id = ?", [uid]
    if q:
        sql += " AND (model LIKE ? OR category LIKE ? OR name LIKE ? OR remark LIKE ?)"
        search = f"%{q}%"; params.extend([search]*4)
    for k, v in filters.items():
        if v: sql += f" AND {k} LIKE ?"; params.append(f"%{v}%")
    res = d1.execute(sql + " ORDER BY created_at DESC", params)
    items = res.get('results', []) if res else []
    for item in items:
        try: item['quantity'] = int(float(item.get('quantity', 0) or 0))
        except: item['quantity'] = 0
        try: item['price'] = float(item.get('price', 0) or 0.0)
        except: item['price'] = 0.0
        item['docs'] = [{'file_name': '技术手册.pdf', 'file_url': item['doc_path']}] if item.get('doc_path') else []
    locs = d1.execute("SELECT DISTINCT location FROM components WHERE user_id = ? AND location != ''", [uid])
    
    # 动态加载帮助手册
    docs_zh, docs_en = "", ""
    static_dir = os.path.join(curr_dir, 'static')
    md_dir = os.path.join(static_dir, 'md')
    
    try:
        # 尝试从 md 目录或 static 目录找中文
        zh_found = False
        for d in [md_dir, static_dir]:
            if not os.path.exists(d): continue
            zh_files = sorted(glob.glob(os.path.join(d, 'inventory_zh_*.md')))
            if zh_files:
                with open(zh_files[-1], 'r', encoding='utf-8') as f: docs_zh = f.read()
                zh_found = True; break
        
        # 尝试从 md 目录或 static 目录找英文
        for d in [md_dir, static_dir]:
            if not os.path.exists(d): continue
            en_files = sorted(glob.glob(os.path.join(d, 'inventory_en_*.md')))
            if en_files:
                with open(en_files[-1], 'r', encoding='utf-8') as f: docs_en = f.read()
                break
    except: pass

    return render_template('inventory.html', items=items, locations=[r['location'] for r in locs.get('results', [])] if locs else [], q=q, filters=filters, system_fields=SYSTEM_FIELDS, docs_zh=docs_zh, docs_en=docs_en)

@inventory_bp.route('/get/<int:id>')
def get_one(id):
    uid = get_current_uid()
    res = d1.execute("SELECT * FROM components WHERE id = ? AND user_id = ?", [id, uid])
    if res and res.get('results'):
        data = res['results'][0]
        data['docs'] = [{'id': 0, 'file_name': '技术手册.pdf', 'file_url': data['doc_path']}] if data.get('doc_path') else []
        return jsonify(success=True, data=data)
    return jsonify(success=False), 404

@inventory_bp.route('/add', methods=['POST'])
def add():
    uid, d, f = get_current_uid(), request.form, request.files
    if not all([d.get('name'), d.get('model')]): return "必填项缺失", 400
    user_res = d1.execute("SELECT username FROM users WHERE id = ?", [uid])
    username = user_res['results'][0]['username'] if user_res and user_res.get('results') else "System"
    cols = ['category', 'name', 'model', 'package', 'quantity', 'unit', 'location', 'supplier', 'channel', 'price', 'buy_time', 'remark', 'user_id', 'creator']
    try: p = float(str(d.get('price', '0')).replace('¥','').replace(',','').strip() or 0.0); q = int(float(d.get('quantity', 0) or 0))
    except: p, q = 0.0, 0
    vals = [d.get('category','未分类'), d.get('name'), d.get('model'), d.get('package'), q, d.get('unit','个'), d.get('location','未定义'), d.get('supplier','未知'), d.get('channel','未知'), p, d.get('buy_time',''), d.get('remark',''), uid, username]
    d1.execute(f"INSERT INTO components ({','.join(cols)}) VALUES ({','.join(['?']*len(cols))})", vals)
    res = d1.execute("SELECT id FROM components WHERE user_id=? AND name=? AND model=? ORDER BY id DESC LIMIT 1", [uid, d.get('name'), d.get('model')])
    if res and res.get('results'):
        new_id, app_path = res['results'][0]['id'], f"inventory/user_{uid}"
        img_url = upload_to_r2(f.get('img_file'), 'images', fixed_name=f"img_{new_id}", app_name=app_path) if f.get('img_file') else ''
        doc_url = upload_to_r2(f.get('doc_file'), 'docs', fixed_name=f"doc_{new_id}", app_name=app_path) if f.get('doc_file') else ''
        qr_url = generate_qr(new_id, d.get('name'), d.get('model'), uid)
        d1.execute("UPDATE components SET img_path = ?, doc_path = ?, qrcode_path = ? WHERE id = ?", [img_url, doc_url, qr_url, new_id])
    return redirect(url_for('inventory.index'))

@inventory_bp.route('/update/<int:id>', methods=['POST'])
def update(id):
    uid, d, f = get_current_uid(), request.form, request.files
    curr = d1.execute("SELECT img_path, doc_path, qrcode_path FROM components WHERE id=? AND user_id=?", [id, uid]).get('results', [{}])[0]
    updates = {'category': d.get('category'), 'name': d.get('name'), 'model': d.get('model'), 'package': d.get('package'), 'quantity': int(float(d.get('quantity', 0) or 0)), 'unit': d.get('unit'), 'location': d.get('location'), 'supplier': d.get('supplier'), 'channel': d.get('channel'), 'buy_time': d.get('buy_time'), 'remark': d.get('remark')}
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
    return redirect(url_for('inventory.index'))

@inventory_bp.route('/delete/<int:id>')
def delete_api(id):
    uid = get_current_uid()
    _perform_delete(id, uid)
    return redirect(url_for('inventory.index'))

@inventory_bp.route('/batch_delete', methods=['POST'])
def batch_delete():
    uid = get_current_uid()
    for i in request.form.getlist('ids[]'): _perform_delete(int(i), uid)
    return jsonify(success=True)

@inventory_bp.route('/batch_update', methods=['POST'])
def batch_update():
    uid, data = get_current_uid(), request.json
    ids, updates = data.get('ids', []), data.get('updates', {})
    allowed = ['category', 'name', 'package', 'unit', 'location', 'supplier', 'channel', 'price', 'remark', 'buy_time']
    set_clauses, values = [], []
    for field, val in updates.items():
        if field in allowed and val: set_clauses.append(f"{field} = ?"); values.append(val)
    if not set_clauses: return jsonify(success=False)
    d1.execute(f"UPDATE components SET {', '.join(set_clauses)} WHERE id IN ({','.join(['?']*len(ids))}) AND user_id = ?", values + ids + [uid])
    return jsonify(success=True)

@inventory_bp.route('/import/parse', methods=['POST'])
def import_parse():
    mode = request.form.get('mode')
    try:
        if mode == 'file': 
            f = request.files.get('file')
            df = pd.read_csv(f).fillna('') if f.filename.endswith('.csv') else pd.read_excel(f, engine='openpyxl').fillna('')
        else: 
            txt = request.form.get('text', '').strip()
            df = pd.DataFrame([r.split('\t') for r in txt.split('\n')]).fillna('')
            if not df.empty: df.columns = df.iloc[0]; df = df[1:]
        return jsonify(success=True, columns=df.columns.tolist(), total_rows=len(df), preview=df.head(3).values.tolist(), mapping=smart_match(df.columns.tolist()), raw_data=df.to_dict(orient='records'))
    except Exception as e: return jsonify(success=False, error=str(e))

@inventory_bp.route('/import/verify', methods=['POST'])
def import_verify():
    uid, data = get_current_uid(), request.json
    mapping, raw = data.get('mapping'), data.get('raw_data')
    fields = ['category', 'name', 'model', 'package', 'quantity', 'location', 'price', 'unit', 'supplier', 'channel', 'buy_time', 'remark']
    standardized = []
    for row in raw:
        item = {f: '' for f in fields}; [item.update({mapping[col]: str(row[col]).strip()}) for col in mapping if mapping[col] in fields and col in row]
        if item.get('name') or item.get('model'): standardized.append(item)
    existing = d1.execute("SELECT * FROM components WHERE user_id = ?", [uid]).get('results', [])
    conflicts, uniques = [], []
    for item in standardized:
        match = next((r for r in existing if (str(r['name']).lower() == str(item['name']).lower() and str(r['package']).lower() == str(item['package']).lower()) or (str(r['model']).lower() == str(item['model']).lower() and str(r['package']).lower() == str(item['package']).lower())), None)
        if match: conflicts.append({'new': item, 'old': match, 'diff': {f: str(item[f]) != str(match.get(f,'')) for f in fields}})
        else: uniques.append(item)
    return jsonify(success=True, conflicts=conflicts, uniques=uniques)

@inventory_bp.route('/import/execute', methods=['POST'])
def import_execute():
    uid, data = get_current_uid(), request.json
    uniques, resolved = data.get('uniques', []), data.get('resolved', [])
    user_res = d1.execute("SELECT username FROM users WHERE id = ?", [uid])
    username = user_res['results'][0]['username'] if user_res and user_res.get('results') else "System"
    for item in uniques:
        if not item.get('name') or not item.get('model'): continue
        item.update({'user_id': uid, 'creator': username})
        keys = list(item.keys())
        d1.execute(f"INSERT INTO components ({','.join(keys)}) VALUES ({','.join(['?']*len(keys))})", [item[k] for k in keys])
        id_res = d1.execute("SELECT id FROM components WHERE user_id=? AND name=? AND model=? ORDER BY id DESC LIMIT 1", [uid, item['name'], item['model']])
        if id_res and id_res.get('results'): generate_qr(id_res['results'][0]['id'], item['name'], item['model'], uid)
    for entry in resolved:
        strat, new, old_id = entry.get('strategy'), entry.get('new'), entry.get('old_id')
        if strat == 'merge': d1.execute("UPDATE components SET quantity = quantity + ?, creator = ? WHERE id = ?", [int(float(new.get('quantity',0))), username, old_id])
        elif strat == 'cover':
            new.update({'user_id': uid, 'creator': username})
            keys = [k for k in new.keys() if k != 'id']
            d1.execute(f"UPDATE components SET {', '.join([f'{k}=?' for k in keys])} WHERE id=?", [new[k] for k in keys] + [old_id])
    return jsonify(success=True)

@inventory_bp.route('/export', methods=['POST'])
def export():
    uid, data = get_current_uid(), request.form
    ids_str, fields = data.get('ids', ''), [f for f in data.getlist('fields') if f in [x[0] for f in SYSTEM_FIELDS]] or [f[0] for f in SYSTEM_FIELDS]
    ids, fmt, with_assets = [int(i) for i in ids_str.split(',') if i.strip().isdigit()] if ids_str else [], data.get('format', 'xlsx'), data.get('with_assets') == '1'
    res = d1.execute(f"SELECT * FROM components WHERE user_id = ? {'AND id IN ('+','.join(['?']*len(ids))+')' if ids else ''}", [uid] + ids)
    items = res.get('results', []) if res else []
    if not items: return jsonify(success=False, error="无数据")
    field_map = {k: v for k, v in SYSTEM_FIELDS}
    df = pd.DataFrame([{field_map.get(f, f): item.get(f, '') for f in fields} for item in items])
    base_name = f"Export_{datetime.now().strftime('%m%d_%H%M')}"; output = BytesIO()
    try:
        if fmt == 'zip' and with_assets:
            with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as zf:
                eb = BytesIO(); df.to_excel(eb, index=False); zf.writestr("Inventory.xlsx", eb.getvalue())
                for item in items:
                    for f_k, fld in [('img_path','images'),('qrcode_path','qrcodes'),('doc_path','docs')]:
                        url = item.get(f_k)
                        if url and url.startswith('http'):
                            try:
                                r = requests.get(url, timeout=5, verify=False, headers={'User-Agent': 'Mozilla/5.0'})
                                if r.status_code == 200: 
                                    ext = url.split('.')[-1].split('?')[0]
                                    zf.writestr(f"attachments/{fld}/{item['id']}_{fld}.{ext}", r.content)
                            except: pass
            output.seek(0); return send_file(output, mimetype='application/zip', as_attachment=True, download_name=f"Export_{datetime.now().strftime('%m%d%H%M')}.zip")
        df.to_excel(output, index=False); output.seek(0)
        return send_file(output, mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', as_attachment=True, download_name=f"Export_{datetime.now().strftime('%m%d%H%M')}.xlsx")
    except Exception as e: return jsonify(success=False, error=str(e))

@inventory_bp.route('/backup')

def backup():

    uid = get_current_uid()

    print(f"--- 开始为用户 {uid} 执行全量备份 ---")

    try:

        items = d1.execute("SELECT * FROM components WHERE user_id = ?", [uid]).get('results', [])

        output = BytesIO()

        session = requests.Session()

        session.headers.update({'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'})

        

        with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as zf:

            zf.writestr('inventory_data.json', json.dumps(items, ensure_ascii=False))

            for item in items:

                for f, fd in [('img_path','images'), ('qrcode_path','qrcodes'), ('doc_path','docs')]:

                    url = item.get(f)

                    if url and isinstance(url, str) and url.startswith('http'):

                        fname = url.split('?')[0].split('/')[-1]

                        print(f"正在抓取: {fname}...", end=' ', flush=True)

                        try: 

                            r = session.get(url, verify=False, timeout=15)

                            if r.status_code == 200:

                                zf.writestr(f"inventory/{fd}/{fname}", r.content)

                                print("成功 ✅")

                            else:

                                print(f"失败 (状态码: {r.status_code}) ❌")

                        except Exception as e:

                            print(f"报错: {str(e)} ❌")

        

        print("--- 备份包构建完成 ---")

        output.seek(0); return send_file(output, mimetype='application/zip', as_attachment=True, download_name=f"Backup_{datetime.now().strftime('%Y%m%d_%H%M')}.zip")

    except Exception as e:

        print(f"备份失败: {e}")

        return jsonify(success=False, error=str(e))

@inventory_bp.route('/restore', methods=['POST'])
def restore():
    uid, file = get_current_uid(), request.files.get('backup_zip')
    if not file: return jsonify(success=False)
    try:
        count, app_path = 0, f"inventory/user_{uid}"
        d1.execute("DELETE FROM components WHERE user_id = ?", [uid])
        with zipfile.ZipFile(file, 'r') as zf:
            available_files = {} 
            for name in zf.namelist():
                if name.endswith('/'): continue
                raw = os.path.basename(name); match = re.search(r'(img|qr|doc)_(\d+)', raw)
                if match:
                    f_t, f_i = match.group(1), match.group(2)
                    base_name, ext = os.path.splitext(raw); ext = ext.lower()
                    file_data = BytesIO(zf.read(name)); file_data.filename = raw
                    fld = 'images' if f_t == 'img' else ('qrcodes' if f_t == 'qr' else 'docs')
                    new_url = upload_to_r2(file_data, fld, fixed_name=f"{f_t}_{f_i}", app_name=app_path)
                    if new_url: available_files[f"{f_t}_{f_i}"] = ext
            if 'inventory_data.json' in zf.namelist():
                items = json.loads(zf.read('inventory_data.json').decode('utf-8'))
                for item in items:
                    item['user_id'] = uid
                    for f_key, prefix, fld in [('img_path','img','images'),('qrcode_path','qr','qrcodes'),('doc_path','doc','docs')]:
                        base_key = f"{prefix}_{item['id']}"
                        # 核心保底逻辑：如果zip里有新文件，用新的；没有则保留json里的旧链接（防误删）
                        if base_key in available_files:
                            real_ext = available_files[base_key]
                            item[f_key] = f"{Config.R2_PUBLIC_URL}/{app_path}/{fld}/{base_key}{real_ext}"
                        # else: keep item[f_key] as is (from json)
                    
                    # 核心 ID 保留：将 id 显式加入插入列表
                    keys = [k for k in item.keys() if k in [f[0] for f in SYSTEM_FIELDS]+['id','img_path','doc_path','qrcode_path','creator','user_id']]
                    d1.execute(f"INSERT INTO components ({','.join(keys)}) VALUES ({','.join(['?']*len(keys))})", [item[k] for k in keys])
                    count += 1
        return jsonify(success=True, count=count)
    except Exception as e: return jsonify(success=False, error=str(e))

@inventory_bp.route('/view_doc/<int:id>')
def view_doc(id):
    uid = get_current_uid()
    res = d1.execute("SELECT doc_path FROM components WHERE id=? AND user_id=?", [id, uid])
    if res and res.get('results') and res['results'][0].get('doc_path'): return redirect(res['results'][0]['doc_path'])
    abort(404)

@inventory_bp.route('/delete_file/<int:id>/<field>')
def delete_file(id, field):
    uid = get_current_uid()
    res = d1.execute(f"SELECT {field} FROM components WHERE id=? AND user_id=?", [id, uid])
    if res and res.get('results') and res['results'][0].get(field):
        delete_from_r2(res['results'][0][field]); d1.execute(f"UPDATE components SET {field} = '' WHERE id=? AND user_id=?", [id, uid]); return jsonify(success=True)
    return jsonify(success=False)

@inventory_bp.route('/get_export_files')
def get_export_files():
    files = []
    if os.path.exists(export_dir):
        for f in os.listdir(export_dir):
            if f.endswith(('.xlsx', '.csv', '.zip')):
                fp = os.path.join(export_dir, f); files.append({'name': f, 'time': datetime.fromtimestamp(os.path.getmtime(fp)).strftime('%Y-%m-%d %H:%M'), 'size': f"{os.path.getsize(fp)/1024:.1f} KB"})
    files.sort(key=lambda x: x['time'], reverse=True)
    return jsonify({'files': files})

@inventory_bp.route('/delete_export_file/<filename>')
def delete_export_file(filename):
    try:
        fp = os.path.join(export_dir, secure_filename(filename))
        if os.path.exists(fp): os.remove(fp); return jsonify(success=True)
    except: pass
    return jsonify(success=False)

@inventory_bp.route('/clear_export_history')
def clear_export_history():
    try:
        if os.path.exists(export_dir):
            for f in os.listdir(export_dir): os.remove(os.path.join(export_dir, f))
        return jsonify(success=True)
    except: return jsonify(success=False)

@inventory_bp.route('/regenerate_qr/<int:id>')
def regenerate_qr_api(id):
    uid = get_current_uid()
    res = d1.execute("SELECT name, model FROM components WHERE id=? AND user_id=?", [id, uid])
    if res and res.get('results'):
        u = generate_qr(id, res['results'][0]['name'], res['results'][0]['model'], uid)
        return jsonify(success=True, qrcode_path=u)
    return jsonify(success=False)