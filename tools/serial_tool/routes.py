import os
from flask import Blueprint, render_template, request, jsonify
from tools.database import d1

serial_tool_bp = Blueprint('serial_tool', __name__, 
                           template_folder='templates', 
                           static_folder='static')

def get_visitor_id():
    uid = request.headers.get('X-User-Id')
    if uid: return uid
    ip = request.headers.get('X-Forwarded-For', request.remote_addr)
    return f"guest_{ip.split(',')[0]}"

@serial_tool_bp.route('/')
def index():
    vid = get_visitor_id()
    # 记录访问日志
    try:
        d1.execute("INSERT INTO usage_logs (user_id, path, status) VALUES (?, ?, ?)", [vid, '/serial/', 200])
    except: pass
    return render_template('serial.html')
