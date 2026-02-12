import datetime
import jwt
import time
import os
from flask import Blueprint, request, jsonify, make_response, render_template, send_from_directory
from werkzeug.security import generate_password_hash, check_password_hash
from tools.database import d1
from tools.config import Config
from tools.r2_client import upload_to_r2

# 获取项目根目录下的 frontend 路径
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FRONTEND_DIR = os.path.join(BASE_DIR, 'frontend')

user_bp = Blueprint('user', __name__)

# --- 辅助工具：模拟 Worker 的解析逻辑 ---
def get_uid_from_request():
    """本地调试保底：如果 Header 没传 UID，尝试从 Cookie 解析"""
    uid = request.headers.get('X-User-Id')
    if uid: return uid
    
    token = request.cookies.get('auth_token')
    if token:
        try:
            payload = jwt.decode(token, Config.SECRET_KEY, algorithms=["HS256"])
            return str(payload.get('uid'))
        except: pass
    return None

# ==========================================
# 🏠 页面渲染路由 (让 Flask 在本地也能显示前端)
# ==========================================

@user_bp.route('/')
def local_index():
    return send_from_directory(FRONTEND_DIR, 'index.html')

@user_bp.route('/login')
def local_login():
    return send_from_directory(FRONTEND_DIR, 'login.html')

@user_bp.route('/profile')
def local_profile():
    uid = get_uid_from_request()
    if not uid: return redirect('/login')
    return send_from_directory(FRONTEND_DIR, 'profile.html')

# ==========================================
# 🔐 身份验证 API
# ==========================================

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
        if check_password_hash(user['password_hash'], password) or user['password_hash'] == password:
            if not user['password_hash'].startswith('pbkdf2:sha256:'):
                d1.execute("UPDATE users SET password_hash = ? WHERE id = ?", [generate_password_hash(password), user['id']])
            
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
    import re
    data = request.json
    u, p = data.get('username', '').strip(), data.get('password', '')
    
    if not u or not p: return jsonify({"error": "账号密码不能为空"}), 400
    # 校验：4位以上，字母数字下划线，不能纯数字
    if not re.match(r'^(?!\d+$)[a-zA-Z0-9_]{4,20}$', u):
        return jsonify({"error": "用户名需4位以上字母/数字/下划线组合，且不能为纯数字"}), 400
    if len(p) < 6:
        return jsonify({"error": "密码长度不能少于 6 位"}), 400

    try:
        check = d1.execute("SELECT id FROM users WHERE username = ?", [u])
        if check and check.get('results'): return jsonify({"error": "用户名已被占用"}), 409
        d1.execute("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)", [u, generate_password_hash(p), 'free'])
        return jsonify({"success": True})
    except Exception as e: return jsonify({"error": str(e)}), 500

@user_bp.route('/update_profile', methods=['POST'])
def update_profile():
    import re
    uid = get_uid_from_request()
    if not uid: return jsonify(success=False, error="Unauthorized"), 401
    data = request.json
    new_u, new_p = data.get('username', '').strip(), data.get('password', '')
    fields, params = [], []
    
    if new_u:
        # 同样的校验逻辑
        if not re.match(r'^(?!\d+$)[a-zA-Z0-9_]{4,20}$', new_u):
            return jsonify(success=False, error="用户名需4位以上字母/数字/下划线组合，且不能为纯数字"), 400
        exists = d1.execute("SELECT id FROM users WHERE username = ? AND id != ?", [new_u, uid]);
        if exists and exists.get('results'): return jsonify(success=False, error="用户名已存在"), 400
        fields.append("username = ?"); params.append(new_u)
    
    if new_p:
        if len(new_p) < 6: return jsonify(success=False, error="密码至少 6 位"), 400
        fields.append("password_hash = ?"); params.append(generate_password_hash(new_p))
    
    if not fields: return jsonify(success=False, error="无修改内容")
    params.append(uid)
    d1.execute(f"UPDATE users SET {', '.join(fields)} WHERE id = ?", params)
    return jsonify(success=True)

@user_bp.route('/upload_avatar', methods=['POST'])
def upload_avatar():
    uid = get_uid_from_request()
    file = request.files.get('file')
    if not uid or not file: return jsonify(success=False), 400
    url = upload_to_r2(file, "avatars", fixed_name=f"avatar_{uid}", app_name="users")
    if url:
        d1.execute("UPDATE users SET avatar = ? WHERE id = ?", [url, uid])
        return jsonify(success=True, url=url)
    return jsonify(success=False), 500

@user_bp.route('/profile_api')
def profile_api():
    uid = get_uid_from_request()
    if not uid: return jsonify(success=False), 401
    try:
        user_res = d1.execute("SELECT username, role, avatar, created_at FROM users WHERE id = ?", [uid])
        u = user_res['results'][0] if user_res and user_res.get('results') else {}
        comp_res = d1.execute("SELECT COUNT(*) as count FROM components WHERE user_id = ?", [uid])
        api_res = d1.execute("SELECT COUNT(*) as count FROM usage_logs WHERE user_id = ? AND request_date = DATE('now')", [uid])
        
        # 加入天数计算
        days = 1
        if u.get('created_at'):
            from datetime import datetime
            try: delta = datetime.utcnow() - datetime.strptime(u['created_at'][:10], '%Y-%m-%d'); days = max(1, delta.days)
            except: pass

        return jsonify({
            "success": True,
            "user": {"username": u.get('username', 'User'), "role": u.get('role', 'free'), "avatar": u.get('avatar', '')},
            "stats": {
                "days": days, "total_calls": 0, 
                "storage_used": comp_res['results'][0]['count'] if comp_res else 0,
                "storage_limit": 5000 if u.get('role') == 'pro' else 500,
                "api_today": api_res['results'][0]['count'] if api_res else 0,
                "api_limit": 1000 if u.get('role') == 'pro' else 100
            },
            "activities": [{"text": "本地系统就绪", "time": "刚刚", "icon": "ri-check-double-line", "bg": "bg-green-50", "color": "text-green-600"}]
        })
    except Exception as e: return jsonify(success=False, error=str(e)), 500

@user_bp.route('/info')
def user_info():
    uid = get_uid_from_request()
    if not uid: return jsonify(user=None)
    res = d1.execute("SELECT username, role, avatar FROM users WHERE id = ?", [uid])
    if res and res.get('results'):
        u = res['results'][0]
        return jsonify(user={"uid": uid, "username": u['username'], "role": u['role'], "avatar": u['avatar']})
    return jsonify(user=None)

@user_bp.route('/logout')
def logout():
    from flask import redirect, url_for
    resp = make_response(redirect('/login'))
    resp.set_cookie('auth_token', '', expires=0, path='/')
    return resp

@user_bp.route('/check_username')
def check_username():
    import re
    u = request.args.get('username', '').strip()
    if not u: return jsonify(status="empty", msg="")
    if len(u) < 4: return jsonify(status="error", msg="至少4位")
    if not re.match(r'^[a-zA-Z0-9_]+$', u): return jsonify(status="error", msg="仅限字母/数字/_")
    if u.isdigit(): return jsonify(status="error", msg="不能纯数字")
    
    # 数据库查重
    try:
        res = d1.execute("SELECT id FROM users WHERE username = ?", [u])
        if res and res.get('results'):
            return jsonify(status="error", msg="已被占用")
        return jsonify(status="success", msg="可用")
    except:
        return jsonify(status="error", msg="检测失败")