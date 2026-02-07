import os
from flask import Blueprint, render_template, request, redirect, url_for, jsonify
from tools.database import d1

curr_dir = os.path.dirname(os.path.abspath(__file__))

inventory_bp = Blueprint(
    'inventory', 
    __name__, 
    template_folder=os.path.join(curr_dir, 'templates'),
    static_folder=os.path.join(curr_dir, 'static')
)

@inventory_bp.route('/')
def index():
    args = request.args
    q = args.get('q', '').strip()
    
    filters = {
        'category': args.get('category', ''),
        'location': args.get('location', ''),
        'package': args.get('package', ''),
        'supplier': args.get('supplier', ''),
        'channel': args.get('channel', ''),
        'name': args.get('name', ''),
        'buy_time': args.get('buy_time', '')
    }

    sql = "SELECT * FROM components WHERE 1=1"
    params = []
    
    if q:
        sql += " AND (model LIKE ? OR name LIKE ? OR remark LIKE ?)"
        search = f"%{q}%"
        params.extend([search, search, search])
    
    for key, val in filters.items():
        if val:
            if key == 'buy_time':
                sql += " AND buy_time = ?"
            else:
                sql += f" AND {key} LIKE ?"
                val = f"%{val}%"
            params.append(val)
    
    sql += " ORDER BY created_at DESC"
    res = d1.execute(sql, params)
    items = res.get('results', []) if res else []
    
    cats_res = d1.execute("SELECT DISTINCT category FROM components WHERE category != ''")
    locs_res = d1.execute("SELECT DISTINCT location FROM components WHERE location != ''")
    categories = [r['category'] for r in cats_res.get('results', [])] if cats_res else []
    locations = [r['location'] for r in locs_res.get('results', [])] if locs_res else []
    
    return render_template('inventory.html', items=items, categories=categories, locations=locations, q=q, filters=filters)

@inventory_bp.route('/add', methods=['POST'])
def add():
    data = request.form
    sql = """
    INSERT INTO components 
    (img_path, category, name, model, package, quantity, location, supplier, channel, price, buy_time, remark) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    params = [
        data.get('img_path', ''), data.get('category'), data.get('name'), 
        data.get('model'), data.get('package'), data.get('quantity', 0),
        data.get('location'), data.get('supplier'), data.get('channel'), 
        data.get('price', 0.0), data.get('buy_time'), data.get('remark', '')
    ]
    d1.execute(sql, params)
    return redirect(url_for('inventory.index'))

@inventory_bp.route('/delete/<int:id>')
def delete(id):
    d1.execute("DELETE FROM components WHERE id = ?", [id])
    return redirect(url_for('inventory.index'))

# 新增：批量删除接口
@inventory_bp.route('/batch_delete', methods=['POST'])
def batch_delete():
    ids = request.form.getlist('ids[]')
    if not ids:
        return "No IDs provided", 400
    
    # 动态构建删除 SQL
    placeholders = ','.join(['?'] * len(ids))
    sql = f"DELETE FROM components WHERE id IN ({placeholders})"
    d1.execute(sql, ids)
    return "OK"
