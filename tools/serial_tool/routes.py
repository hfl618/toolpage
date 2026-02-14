import os
from flask import Blueprint, render_template, request, jsonify
from tools.database import d1

serial_tool_bp = Blueprint('serial_tool', __name__, 
                           template_folder='templates', 
                           static_folder='static')

def get_visitor_id():
    # 优先使用身份验证后的 UID
    uid = request.headers.get('X-User-Id')
    if uid: return uid
    
    # 否则使用客户端 IP (处理代理转发)
    forwarded = request.headers.get('X-Forwarded-For')
    if forwarded:
        ip = forwarded.split(',')[0].strip()
    else:
        ip = request.remote_addr
    return f"guest_{ip}"

@serial_tool_bp.route('/')
def index():
    # vid = get_visitor_id()
    # # 记录访问日志
    # try:
    #     from tools.database import d1
    #     d1.execute("INSERT INTO usage_logs (user_id, path, status) VALUES (?, ?, ?)", [vid, '/serial/', 200])
    # except Exception as e:
    #     print(f"Log Error: {e}")
    return render_template('serial.html')
