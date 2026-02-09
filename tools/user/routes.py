import datetime
import jwt
import time
from flask import Blueprint, request, jsonify, make_response
from werkzeug.security import generate_password_hash, check_password_hash
from tools.database import d1
from tools.config import Config
from tools.r2_client import upload_to_r2

user_bp = Blueprint('user', __name__)

@user_bp.route('/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    if not username or not password: return jsonify({"error": "请输入账号密码"}), 400

    sql = "SELECT id, username, password_hash, role, avatar FROM users WHERE username = ?"
    res = d1.execute(sql, [username])
    user = res['results'][0] if res and res.get('results') else None

    if user:
        # 兼容逻辑：支持明文转哈希
        is_valid = False
        if user['password_hash'].startswith('pbkdf2:sha256:'):
            is_valid = check_password_hash(user['password_hash'], password)
        elif user['password_hash'] == password:
            is_valid = True
            # 自动升级为加密
            d1.execute("UPDATE users SET password_hash = ? WHERE id = ?", [generate_password_hash(password), user['id']])
        
        if is_valid:
            payload = {
                "uid": user['id'],
                "username": user['username'],
                "role": user.get('role', 'free'),
                "avatar": user.get('avatar', ''),
                "exp": datetime.datetime.utcnow() + datetime.timedelta(seconds=Config.JWT_EXP_DELTA)
            }
            token = jwt.encode(payload, Config.SECRET_KEY, algorithm="HS256")
            resp = make_response(jsonify({"success": True, "msg": "登录成功"}))
            domain = Config.COOKIE_DOMAIN if Config.COOKIE_DOMAIN else None
            resp.set_cookie('auth_token', token, httponly=True, secure=Config.COOKIE_SECURE, domain=domain, path='/', samesite='Lax')
            return resp
            
    return jsonify({"error": "用户名或密码错误"}), 401

@user_bp.route('/register', methods=['POST'])
def register():
    data = request.json
    u, p = data.get('username'), data.get('password')
    if not u or not p: return jsonify({"error": "内容不能为空"}), 400
    try:
        check = d1.execute("SELECT id FROM users WHERE username = ?", [u])
        if check and check.get('results'): return jsonify({"error": "该名字已被注册"}), 409
        d1.execute("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)", [u, generate_password_hash(p), 'free'])
        return jsonify({"success": True})
    except Exception as e: return jsonify({"error": str(e)}), 500

@user_bp.route('/update_profile', methods=['POST'])
def update_profile():
    """对接前端 updateAccount 接口"""
    uid = request.headers.get('X-User-Id')
    if not uid: return jsonify(success=False, error="Unauthorized"), 401
    data = request.json
    new_u, new_p = data.get('username'), data.get('password')
    
    fields, params = [], []
    if new_u:
        exists = d1.execute("SELECT id FROM users WHERE username = ? AND id != ?", [new_u, uid])
        if exists and exists.get('results'): return jsonify(success=False, error="名字已被占用"), 400
        fields.append("username = ?"); params.append(new_u)
    if new_p:
        if len(new_p) < 6: return jsonify(success=False, error="密码至少6位"), 400
        fields.append("password_hash = ?"); params.append(generate_password_hash(new_p))
    
    if not fields: return jsonify(success=False, error="无修改内容"), 400
    try:
        params.append(uid)
        d1.execute(f"UPDATE users SET {', '.join(fields)} WHERE id = ?", params)
        return jsonify(success=True)
    except Exception as e: return jsonify(success=False, error=str(e)), 500

@user_bp.route('/upload_avatar', methods=['POST'])
def upload_avatar():
    """对接前端 uploadAvatar 接口"""
    uid = request.headers.get('X-User-Id')
    file = request.files.get('file')
    if not uid or not file: return jsonify(success=False, error="参数错误"), 400
    try:
        # 上传到 R2 (不带后缀名传参，由 r2_client 自动补全)
        url = upload_to_r2(file, "avatars", fixed_name=f"avatar_{uid}", app_name="users")
        if url:
            d1.execute("UPDATE users SET avatar = ? WHERE id = ?", [url, uid])
            return jsonify(success=True, url=url)
        return jsonify(success=False, error="上传失败")
    except Exception as e: return jsonify(success=False, error=str(e)), 500

@user_bp.route('/profile_api')
def profile_api():
    """全量数据对位接口"""
    uid = request.headers.get('X-User-Id')
    if not uid: return jsonify(success=False), 401
    try:
        user_res = d1.execute("SELECT username, role, avatar, created_at FROM users WHERE id = ?", [uid])
        u = user_res['results'][0] if user_res and user_res.get('results') else {}
        
        # 统计
        comp_res = d1.execute("SELECT COUNT(*) as count FROM components WHERE user_id = ?", [uid])
        storage_used = comp_res['results'][0]['count'] if comp_res and comp_res.get('results') else 0
        
        log_res = d1.execute("SELECT COUNT(*) as count FROM usage_logs WHERE user_id = ? AND request_date = DATE('now')", [uid])
        api_today = log_res['results'][0]['count'] if log_res and log_res.get('results') else 0
        
        total_res = d1.execute("SELECT COUNT(*) as count FROM usage_logs WHERE user_id = ?", [uid])
        total_calls = total_res['results'][0]['count'] if total_res and total_res.get('results') else 0

        # 加入天数
        days = 1
        if u.get('created_at'):
            from datetime import datetime
            try:
                delta = datetime.utcnow() - datetime.strptime(u['created_at'][:10], '%Y-%m-%d')
                days = max(1, delta.days)
            except: pass

        return jsonify({
            "success": True,
            "user": {"username": u.get('username', 'User'), "role": u.get('role', 'free'), "avatar": u.get('avatar', '')},
            "stats": {
                "days": days,
                "total_calls": total_calls,
                "storage_used": storage_used,
                "storage_limit": 5000 if u.get('role') == 'pro' else 500,
                "api_today": api_today,
                "api_limit": 1000 if u.get('role') == 'pro' else 100
            },
            "activities": [
                {"text": "系统安全扫描完成", "time": "刚刚", "icon": "ri-shield-check-line", "bg": "bg-blue-50", "color": "text-blue-600"},
                {"text": "同步资源云端快照", "time": "1小时前", "icon": "ri-cloud-line", "bg": "bg-slate-50", "color": "text-slate-600"}
            ]
        })
    except Exception as e: return jsonify(success=False, error=str(e)), 500

@user_bp.route('/info')
def user_info():
    uid = request.headers.get('X-User-Id')
    if not uid: return jsonify(user=None)
    res = d1.execute("SELECT username, role, avatar FROM users WHERE id = ?", [uid])
    if res and res.get('results'):
        u = res['results'][0]
        return jsonify(user={"uid": uid, "username": u['username'], "role": u['role'], "avatar": u['avatar']})
    return jsonify(user=None)

@user_bp.route('/logout')
def logout():
    resp = make_response(jsonify(success=True))
    resp.set_cookie('auth_token', '', expires=0, path='/')
    return resp
