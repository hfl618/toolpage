import os
from flask import Blueprint, render_template, request, jsonify, make_response
from tools.database import d1
from tools.r2_client import upload_to_r2, get_s3_client, get_json_from_r2, put_json_to_r2, delete_from_r2
from tools.config import Config
from datetime import datetime

ble_config_bp = Blueprint('ble_config', __name__, 
                          template_folder='templates', 
                          static_folder='static')

@ble_config_bp.route('/')
def index():
    return render_template('ble_config.html')

@ble_config_bp.route('/ota')
def ota_user():
    return render_template('ota_user.html')

@ble_config_bp.route('/ota/admin')
def ota_admin():
    return render_template('ota_manager.html')

@ble_config_bp.route('/ota/info')
def ota_info():
    """获取 OTA 状态 (仅返回已上线的固件)"""
    uid = request.args.get('uid') or request.headers.get('X-User-Id')
    current_uid = request.headers.get('X-User-Id')
    if not uid: return jsonify({"error": "Missing UID"}), 401
    
    latest = get_json_from_r2(f"ota/{uid}/latest.json") or {}
    
    data = {
        "uid": uid,
        "workspace": f"Space #{uid}",
        "can_edit": str(uid) == str(current_uid),
        "status": "active" if latest else "empty"
    }
    data.update(latest)
    
    resp = make_response(jsonify(data))
    resp.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    return resp

@ble_config_bp.route('/ota/upload', methods=['POST'])
def ota_upload():
    """上传新版本 (默认不直接覆盖最新版，需手动上线)"""
    uid = request.headers.get('X-User-Id') or request.environ.get('HTTP_X_USER_ID')
    if not uid: return jsonify(success=False, error="Unauthorized"), 401
    
    file = request.files.get('file')
    target = request.form.get('target', '').strip().lower()
    name = request.form.get('name', '').strip() or target.upper()
    version = request.form.get('version', '1.0.0')
    changelog = request.form.get('changelog', '')
    
    if file and file.filename.endswith('.bin') and target:
        now = datetime.now().strftime('%Y-%m-%d %H:%M')
        fixed_name = f"{name.replace(' ', '_')}_v{version}_{datetime.now().strftime('%m%d%H%M')}"
        
        # 1. 上传物理文件
        file.seek(0)
        url = upload_to_r2(file, folder=f"{uid}/bin/{target}", fixed_name=fixed_name, app_name="ota")
        if not url: return jsonify(success=False, error="R2 Upload Fail"), 500
        
        # 2. 存入历史记录 (初始状态为 offline)
        history = get_json_from_r2(f"ota/{uid}/history.json") or []
        new_entry = {
            "target": target,
            "name": name,
            "version": version,
            "url": url,
            "date": now,
            "changelog": changelog,
            "active": False # 默认不下发
        }
        history.insert(0, new_entry)
        put_json_to_r2(f"ota/{uid}/history.json", history[:30])
        
        return jsonify(success=True)
    return jsonify(success=False, error="Invalid Input"), 400

@ble_config_bp.route('/ota/set_active', methods=['POST'])
def ota_set_active():
    """设置某个历史版本为“在线”或“离线”"""
    uid = request.headers.get('X-User-Id') or request.environ.get('HTTP_X_USER_ID')
    index = request.json.get('index')
    action = request.json.get('action') # 'online' or 'offline'
    if not uid or index is None: return jsonify(success=False), 400
    
    history = get_json_from_r2(f"ota/{uid}/history.json") or []
    latest = get_json_from_r2(f"ota/{uid}/latest.json") or {}
    
    if 0 <= index < len(history):
        target = history[index]['target']
        
        if action == 'online':
            # 获取当前上线时间
            active_now = datetime.now().strftime('%Y-%m-%d %H:%M')
            # 先把该分区的所有版本设为 offline
            for item in history:
                if item['target'] == target: item['active'] = False
            
            # 激活当前并记录上线时间
            history[index]['active'] = True
            history[index]['active_date'] = active_now
            
            # 同步到 latest.json
            latest_entry = history[index].copy()
            del latest_entry['target']
            del latest_entry['active']
            latest[target] = latest_entry
        else:
            # 下线处理
            history[index]['active'] = False
            if target in latest and latest[target]['url'] == history[index]['url']:
                del latest[target]
        
        put_json_to_r2(f"ota/{uid}/history.json", history)
        put_json_to_r2(f"ota/{uid}/latest.json", latest)
        return jsonify(success=True)
    return jsonify(success=False), 404

@ble_config_bp.route('/ota/delete', methods=['POST'])
def ota_delete():
    """彻底删除记录及物理文件"""
    uid = request.headers.get('X-User-Id') or request.environ.get('HTTP_X_USER_ID')
    index = request.json.get('index')
    if not uid or index is None: return jsonify(success=False), 400
    
    history = get_json_from_r2(f"ota/{uid}/history.json") or []
    if 0 <= index < len(history):
        item = history.pop(index)
        # 物理删除文件
        if 'url' in item: delete_from_r2(item['url'])
        # 如果删除的是正在上线的，同步从 latest 移除
        if item.get('active'):
            latest = get_json_from_r2(f"ota/{uid}/latest.json") or {}
            target = item['target']
            if target in latest: del latest[target]
            put_json_to_r2(f"ota/{uid}/latest.json", latest)
            
        put_json_to_r2(f"ota/{uid}/history.json", history)
        return jsonify(success=True)
    return jsonify(success=False), 404

@ble_config_bp.route('/ota/history')
def ota_history():
    uid = request.args.get('uid') or request.headers.get('X-User-Id')
    if not uid: return jsonify([])
    resp = make_response(jsonify(get_json_from_r2(f"ota/{uid}/history.json") or []))
    resp.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    return resp

@ble_config_bp.route('/ota/delete_partition', methods=['POST'])
def ota_delete_partition():
    """仅下架分区（快捷方式）"""
    uid = request.headers.get('X-User-Id') or request.environ.get('HTTP_X_USER_ID')
    target = request.json.get('target')
    latest = get_json_from_r2(f"ota/{uid}/latest.json") or {}
    if target in latest:
        del latest[target]
        put_json_to_r2(f"ota/{uid}/latest.json", latest)
        # 同步将 history 里的对应分区设为 offline
        history = get_json_from_r2(f"ota/{uid}/history.json") or []
        for item in history:
            if item['target'] == target: item['active'] = False
        put_json_to_r2(f"ota/{uid}/history.json", history)
        return jsonify(success=True)
    return jsonify(success=False), 404
