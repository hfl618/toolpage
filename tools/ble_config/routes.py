import os
from flask import Blueprint, render_template, request, jsonify
from tools.database import d1

ble_config_bp = Blueprint('ble_config', __name__, 
                          template_folder='templates', 
                          static_folder='static')

def get_visitor_id():
    uid = request.headers.get('X-User-Id')
    if uid: return uid
    
    forwarded = request.headers.get('X-Forwarded-For')
    if forwarded:
        ip = forwarded.split(',')[0].strip()
    else:
        ip = request.remote_addr
    return f"guest_{ip}"

@ble_config_bp.route('/')
def index():
    # vid = get_visitor_id()
    # try:
    #     d1.execute("INSERT INTO usage_logs (user_id, path, status) VALUES (?, ?, ?)", [vid, '/ble_config/', 200])
    # except Exception as e:
    #     print(f"Log Error: {e}")
    return render_template('ble_config.html')
