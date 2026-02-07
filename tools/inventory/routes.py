# tools/inventory/routes.py
from flask import Blueprint, render_template, request, redirect, url_for
from tools.database import d1

# 定义蓝图：url_prefix 将在 app.py 统一分配
inventory_bp = Blueprint('inventory', __name__, template_folder='templates')

@inventory_bp.route('/')
def index():
    # 查询你刚才建好的表
    res = d1.execute("SELECT * FROM components ORDER BY created_at DESC")
    items = res.get('results', []) if res else []
    return render_template('inventory.html', items=items)

@inventory_bp.route('/add', methods=['POST'])
def add():
    data = request.form
    sql = """INSERT INTO components (category, model, quantity, location, supplier, channel) 
             VALUES (?, ?, ?, ?, ?, ?)"""
    d1.execute(sql, [
        data.get('category'), data.get('model'), 
        data.get('quantity'), data.get('location'),
        data.get('supplier'), data.get('channel')
    ])
    return redirect(url_for('inventory.index'))