from flask import Blueprint, render_template
from tools.database import d1

# 使用 __name__ 让 Flask 自动处理相对路径
project_bp = Blueprint(
    'projects', 
    __name__, 
    template_folder='templates',
    static_folder='static'
)

@project_bp.route('/')
def index():
    # 模拟数据
    items = [
        {"name": "智能家居网关", "status": "开发中", "desc": "基于 ESP32 的 Zigbee 网关"},
        {"name": "桌面小电视", "status": "已完成", "desc": "LVGL 综合演示项目"}
    ]
    return render_template('project_index.html', items=items)