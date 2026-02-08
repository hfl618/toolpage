from flask import Blueprint, render_template, request, redirect, url_for, abort, jsonify
from tools.database import d1

# 使用 __name__ 让 Flask 自动处理路径
project_bp = Blueprint(
    'projects', 
    __name__, 
    template_folder='templates',
    static_folder='static'
)

def get_current_uid():
    """统一从 Header 获取用户 ID"""
    uid = request.headers.get('X-User-Id')
    if not uid:
        abort(401, description="Unauthorized: Missing X-User-Id")
    return uid

@project_bp.route('/')
def index():
    uid = get_current_uid()
    # 强制隔离：只查询当前用户的项目
    sql = "SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC"
    res = d1.execute(sql, [uid])
    items = res.get('results', []) if res else []
    return render_template('project_index.html', items=items)

@project_bp.route('/add', methods=['POST'])
def add_project():
    uid = get_current_uid()
    name = request.form.get('name')
    desc = request.form.get('description')
    
    if not name:
        return "项目名称不能为空", 400
        
    sql = "INSERT INTO projects (user_id, name, description) VALUES (?, ?, ?)"
    d1.execute(sql, [uid, name, desc])
    
    return redirect(url_for('projects.index'))

@project_bp.route('/delete/<int:project_id>')
def delete_project(project_id):
    uid = get_current_uid()
    # 物理隔离删除：确保只能删自己的
    sql = "DELETE FROM projects WHERE id = ? AND user_id = ?"
    d1.execute(sql, [project_id, uid])
    return redirect(url_for('projects.index'))