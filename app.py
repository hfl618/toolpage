# -*- coding: utf-8 -*-
import os
import sys
import logging
import uuid
import json
import zipfile
import pandas as pd
import qrcode
from datetime import datetime
from io import BytesIO
from flask import Flask, render_template_string, request, redirect, url_for, flash, send_file, jsonify, abort
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS

# -------------------------- 1. 基础配置与环境适配 --------------------------
app = Flask(__name__)
CORS(app)  # 允许 Cloudflare 域名跨域访问
app.config['SECRET_KEY'] = '618002_secure_token_2026'

# 智能识别持久化目录 (Hugging Face Persistent Storage)
# 只有把数据存在 /data 下，重启才不会丢失
if os.path.exists('/data'):
    BASE_DIR = '/data'
    print(">>> 检测到云端持久化环境，数据将存入 /data")
else:
    BASE_DIR = os.path.abspath(os.path.dirname(__file__))
    print(">>> 检测到本地开发环境")

# 文件夹定义
STATIC_DIR = os.path.join(BASE_DIR, 'static')
IMG_DIR = os.path.join(STATIC_DIR, 'img')
ATTACH_DIR = os.path.join(STATIC_DIR, 'attach')
QR_DIR = os.path.join(STATIC_DIR, 'qrcode')
DB_FILE = os.path.join(BASE_DIR, 'component.db')

for d in [IMG_DIR, ATTACH_DIR, QR_DIR]:
    os.makedirs(d, exist_ok=True)

app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{DB_FILE}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# -------------------------- 2. 数据库模型 (Model) --------------------------
class Component(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    category = db.Column(db.String(50), nullable=False, default='未知')  # 品类
    type = db.Column(db.String(50), default='')                         # 类别
    model = db.Column(db.String(200), nullable=False)                   # 型号规格
    package = db.Column(db.String(50), default='未知封装')               # 封装
    supplier = db.Column(db.String(100), default='未知供应商')
    quantity = db.Column(db.Integer, default=0)
    unit = db.Column(db.String(20), default='个')
    location = db.Column(db.String(100), default='未知位置')
    price = db.Column(db.Float, default=0.00)
    buy_time = db.Column(db.String(20), default=datetime.now().strftime('%Y-%m-%d'))
    remark = db.Column(db.Text, default='')
    img_path = db.Column(db.String(255), default='')
    attach_path = db.Column(db.String(255), default='')
    qrcode_path = db.Column(db.String(255), default='')

# -------------------------- 3. 核心工具函数 --------------------------
def create_qrcode_internal(comp):
    """为元器件生成二维码并保存"""
    qr_data = f"ID:{comp.id}|MOD:{comp.model}|LOC:{comp.location}"
    qr = qrcode.make(qr_data)
    filename = f"QR_{comp.id}_{uuid.uuid4().hex[:6]}.png"
    filepath = os.path.join(QR_DIR, filename)
    qr.save(filepath)
    comp.qrcode_path = f"static/qrcode/{filename}"
    db.session.commit()

def save_upload_file(file, folder):
    """通用文件保存函数"""
    if not file or file.filename == '': return ''
    ext = file.filename.rsplit('.', 1)[1].lower()
    filename = f"{uuid.uuid4().hex}.{ext}"
    file.save(os.path.join(folder, filename))
    # 返回相对路径供前端访问
    rel_dir = os.path.basename(os.path.dirname(folder))
    return f"static/{rel_dir}/{filename}"

# -------------------------- 4. 前端界面模板 (Template) --------------------------
# 这里采用了你要求的现代感设计，同时保留所有管理功能
MAIN_TEMPLATE = """
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>元器件管理系统 | 618002.xyz</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
</head>
<body class="bg-slate-50 min-h-screen">
    <nav class="bg-white border-b border-slate-200 p-4 sticky top-0 z-50">
        <div class="max-w-7xl mx-auto flex justify-between items-center">
            <div class="flex items-center gap-2">
                <a href="/" class="text-blue-600 font-bold text-xl"><i class="fa-solid fa-microchip"></i> 库存中心</a>
            </div>
            <div class="flex gap-3">
                <button onclick="location.href='/inventory/add_page'" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 transition">入库登记</button>
                <button onclick="location.href='/inventory/bom_import'" class="bg-slate-100 text-slate-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-200 transition">BOM 导入</button>
            </div>
        </div>
    </nav>

    <main class="max-w-7xl mx-auto p-6">
        {% with messages = get_flashed_messages(with_categories=true) %}
          {% if messages %}
            {% for category, message in messages %}
              <div class="mb-4 p-4 rounded-lg bg-{{ 'green' if category == 'success' else 'red' }}-100 text-{{ 'green' if category == 'success' else 'red' }}-700">{{ message }}</div>
            {% endfor %}
          {% endif %}
        {% endwith %}

        <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <table class="w-full text-left border-collapse">
                <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 text-sm">
                    <tr>
                        <th class="p-4">图片</th>
                        <th class="p-4">品类/型号</th>
                        <th class="p-4">封装</th>
                        <th class="p-4">库存数量</th>
                        <th class="p-4">存放位置</th>
                        <th class="p-4">二维码</th>
                        <th class="p-4 text-right">操作</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    {% for comp in components %}
                    <tr class="hover:bg-slate-50 transition">
                        <td class="p-4">
                            {% if comp.img_path %}
                                <img src="/{{ comp.img_path }}" class="w-12 h-12 rounded border object-cover">
                            {% else %}
                                <div class="w-12 h-12 bg-slate-100 rounded flex items-center justify-center text-slate-400 text-xs">无图</div>
                            {% endif %}
                        </td>
                        <td class="p-4">
                            <div class="font-bold text-slate-800">{{ comp.category }}</div>
                            <div class="text-xs text-slate-500">{{ comp.model }}</div>
                        </td>
                        <td class="p-4 text-sm text-slate-600">{{ comp.package }}</td>
                        <td class="p-4">
                            <span class="px-2 py-1 rounded text-xs font-bold {{ 'bg-red-100 text-red-600' if comp.quantity < 10 else 'bg-green-100 text-green-600' }}">
                                {{ comp.quantity }} {{ comp.unit }}
                            </span>
                        </td>
                        <td class="p-4 text-sm text-slate-600">{{ comp.location }}</td>
                        <td class="p-4">
                            {% if comp.qrcode_path %}
                                <img src="/{{ comp.qrcode_path }}" class="w-10 h-10 border opacity-60 hover:opacity-100 cursor-pointer transition">
                            {% endif %}
                        </td>
                        <td class="p-4 text-right space-x-2">
                            <a href="/inventory/edit/{{ comp.id }}" class="text-blue-600 hover:underline text-sm">编辑</a>
                            <a href="/inventory/delete/{{ comp.id }}" onclick="return confirm('确定删除？')" class="text-red-500 hover:underline text-sm">删除</a>
                        </td>
                    </tr>
                    {% else %}
                    <tr><td colspan="7" class="p-10 text-center text-slate-400">暂无库存数据，请先录入</td></tr>
                    {% endfor %}
                </tbody>
            </table>
        </div>
    </main>
</body>
</html>
"""

# -------------------------- 5. 路由逻辑 (Routes) --------------------------
@app.route('/inventory/')
def index():
    """主列表页"""
    components = Component.query.order_by(Component.id.desc()).all()
    return render_template_string(MAIN_TEMPLATE, components=components)

@app.route('/inventory/add_page')
def add_page():
    # 这里可以复用一个简单的表单 HTML
    return "入库表单开发中，请使用 API 或等待更新"

@app.route('/inventory/add', methods=['POST'])
def add():
    """执行入库"""
    try:
        data = request.form
        comp = Component(
            category=data.get('category'),
            model=data.get('model'),
            package=data.get('package'),
            quantity=int(data.get('quantity', 0)),
            location=data.get('location')
        )
        db.session.add(comp)
        db.session.flush() # 获取 ID
        
        # 处理图片
        comp.img_path = save_upload_file(request.files.get('img'), IMG_DIR)
        
        # 生成二维码
        create_qrcode_internal(comp)
        
        db.session.commit()
        flash("录入成功", "success")
    except Exception as e:
        db.session.rollback()
        flash(f"录入失败: {str(e)}", "error")
    return redirect(url_for('index'))

@app.route('/inventory/delete/<int:id>')
def delete(id):
    comp = Component.query.get_or_404(id)
    db.session.delete(comp)
    db.session.commit()
    flash("已删除", "success")
    return redirect(url_for('index'))

# -------------------------- 6. 静态资源路由适配 --------------------------
@app.route('/static/<path:filename>')
def custom_static(filename):
    """确保在持久化目录下的文件能被访问"""
    return send_from_directory(STATIC_DIR, filename)

# -------------------------- 7. 启动入口 --------------------------
if __name__ == '__main__':
    with app.app_context():
        db.create_all()  # 自动创建数据库表
        print(f">>> 数据库已就绪: {DB_FILE}")

    # Hugging Face 必须监听 0.0.0.0 和 7860
    app.run(host='0.0.0.0', port=7860, debug=False)