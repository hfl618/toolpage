import os
from flask import Blueprint, render_template, request, jsonify, make_response, Response
from tools.database import d1
from tools.r2_client import upload_to_r2, get_s3_client, get_json_from_r2, put_json_to_r2, delete_from_r2
from tools.config import Config
from datetime import datetime
import requests

ble_config_bp = Blueprint('ble_config', __name__, 
                          template_folder='templates', 
                          static_folder='static')

OTA_DOMAIN = "http://ota.hhhtool.cc.cd"

def rewrite_url(url):
    """将 URL 重写为指向本服务器的代理下载地址 (适配局域网与公网)"""
    if not url: return ""
    if "/ota/" in url:
        # 提取相对路径部分
        path_suffix = url.split("/ota/")[1]
        
        # 智能识别当前访问的主机名 (127.0.0.1 或 172.20.10.5)
        host = request.host
        if "127.0.0.1" in host or "localhost" in host:
            import socket
            try:
                s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                s.connect(("8.8.8.8", 80))
                lan_ip = s.getsockname()[0]
                s.close()
                host = host.replace("127.0.0.1", lan_ip).replace("localhost", lan_ip)
            except: pass
            
        return f"http://{host}/ble_config/ota/download/{path_suffix}"
    return url

@ble_config_bp.route('/ota/download/<path:file_path>')
def ota_proxy_download(file_path):
    """OTA 固件下载代理：强制透传文件长度"""
    # 构造 R2 真实地址 (file_path 已经包含了 uid/bin/target/name)
    r2_url = f"{Config.R2_PUBLIC_URL}/ota/{file_path}"
    print(f"📦 [Proxy Request] Target R2: {r2_url}")
    
    try:
        # 1. 向 R2 请求数据
        r2_resp = requests.get(r2_url, stream=True, timeout=60, verify=False, proxies={"http": None, "https": None})
        
        if r2_resp.status_code == 200:
            content_length = r2_resp.headers.get('Content-Length')
            print(f"✅ [Proxy Success] Found File. Size: {content_length} bytes")
            
            # 2. 构造响应头，必须透传 Content-Length 给单片机
            headers = {
                'Content-Type': 'application/octet-stream',
                'Content-Length': content_length,
                'Content-Disposition': f'attachment; filename={os.path.basename(file_path)}',
                'Cache-Control': 'no-cache'
            }
            
            # 3. 流式回传
            def generate():
                for chunk in r2_resp.iter_content(chunk_size=16384):
                    yield chunk
            
            return Response(generate(), status=200, headers=headers)
        
        print(f"❌ [Proxy Failed] R2 returned status: {r2_resp.status_code}")
        return f"File Not Found", 404
    except Exception as e:
        print(f"💥 [Proxy Error]: {str(e)}")
        return str(e), 500

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
    uid = request.args.get('uid') or request.headers.get('X-User-Id')
    current_uid = request.headers.get('X-User-Id')
    if not uid: return jsonify({"error": "Missing UID"}), 401
    latest = get_json_from_r2(f"ota/{uid}/latest.json") or {}
    for t in latest:
        if isinstance(latest[t], dict) and 'url' in latest[t]:
            latest[t]['url'] = rewrite_url(latest[t]['url'])
    data = {"uid": uid, "workspace": f"Space #{uid}", "can_edit": str(uid) == str(current_uid), "status": "active" if latest else "empty"}
    data.update(latest)
    resp = make_response(jsonify(data))
    resp.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    return resp

@ble_config_bp.route('/ota/upload', methods=['POST'])
def ota_upload():
    uid = request.headers.get('X-User-Id') or request.environ.get('HTTP_X_USER_ID')
    if not uid: return jsonify(success=False), 401
    file = request.files.get('file')
    target = request.form.get('target', '').strip().lower()
    name = request.form.get('name', '').strip() or target.upper()
    version = request.form.get('version', '1.0.0')
    if file and file.filename.endswith('.bin') and target:
        now = datetime.now().strftime('%Y-%m-%d %H:%M')
        fixed_name = f"{name.replace(' ', '_')}_v{version}_{datetime.now().strftime('%m%d%H%M')}"
        file.seek(0)
        url = upload_to_r2(file, folder=f"{uid}/bin/{target}", fixed_name=fixed_name, app_name="ota")
        if not url: return jsonify(success=False), 500
        history = get_json_from_r2(f"ota/{uid}/history.json") or []
        new_entry = {"target": target, "name": name, "version": version, "url": url, "date": now, "changelog": request.form.get('changelog', ''), "active": False}
        history.insert(0, new_entry)
        put_json_to_r2(f"ota/{uid}/history.json", history[:30])
        return jsonify(success=True)
    return jsonify(success=False), 400

@ble_config_bp.route('/ota/set_active', methods=['POST'])
def ota_set_active():
    uid = request.headers.get('X-User-Id') or request.environ.get('HTTP_X_USER_ID')
    index = request.json.get('index')
    action = request.json.get('action')
    history = get_json_from_r2(f"ota/{uid}/history.json") or []
    latest = get_json_from_r2(f"ota/{uid}/latest.json") or {}
    if 0 <= index < len(history):
        target = history[index]['target']
        if action == 'online':
            for item in history:
                if item['target'] == target: item['active'] = False
            history[index]['active'] = True
            history[index]['active_date'] = datetime.now().strftime('%Y-%m-%d %H:%M')
            latest_entry = history[index].copy()
            del latest_entry['target']; del latest_entry['active']
            latest[target] = latest_entry
        else:
            history[index]['active'] = False
            if target in latest and latest[target]['url'] == history[index]['url']: del latest[target]
        put_json_to_r2(f"ota/{uid}/history.json", history)
        put_json_to_r2(f"ota/{uid}/latest.json", latest)
        return jsonify(success=True)
    return jsonify(success=False), 404

@ble_config_bp.route('/ota/history')
def ota_history():
    uid = request.args.get('uid') or request.headers.get('X-User-Id')
    if not uid: return jsonify([])
    history = get_json_from_r2(f"ota/{uid}/history.json") or []
    for item in history: item['url'] = rewrite_url(item['url'])
    resp = make_response(jsonify(history))
    resp.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    return resp

@ble_config_bp.route('/ota/delete', methods=['POST'])
def ota_delete():
    uid = request.headers.get('X-User-Id') or request.environ.get('HTTP_X_USER_ID')
    index = request.json.get('index')
    history = get_json_from_r2(f"ota/{uid}/history.json") or []
    if 0 <= index < len(history):
        item = history.pop(index)
        if 'url' in item: delete_from_r2(item['url'])
        if item.get('active'):
            latest = get_json_from_r2(f"ota/{uid}/latest.json") or {}
            if item['target'] in latest: del latest[item['target']]
            put_json_to_r2(f"ota/{uid}/latest.json", latest)
        put_json_to_r2(f"ota/{uid}/history.json", history)
        return jsonify(success=True)
    return jsonify(success=False), 404

@ble_config_bp.route('/ota/delete_partition', methods=['POST'])
def ota_delete_partition():
    uid = request.headers.get('X-User-Id') or request.environ.get('HTTP_X_USER_ID')
    target = request.json.get('target')
    latest = get_json_from_r2(f"ota/{uid}/latest.json") or {}
    if target in latest:
        del latest[target]
        put_json_to_r2(f"ota/{uid}/latest.json", latest)
        history = get_json_from_r2(f"ota/{uid}/history.json") or []
        for item in history:
            if item['target'] == target: item['active'] = False
        put_json_to_r2(f"ota/{uid}/history.json", history)
        return jsonify(success=True)
    return jsonify(success=False), 404
