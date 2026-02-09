import datetime
import jwt
from flask import Blueprint, request, jsonify, make_response, render_template_string
from tools.database import d1
from tools.config import Config
from tools.r2_client import upload_to_r2

user_bp = Blueprint('user', __name__)

@user_bp.route('/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({"error": "请输入账号密码"}), 400

    # 1. 完整查询：获取 ID、等级、头像
    sql = "SELECT id, password_hash, role, avatar FROM users WHERE username = ?"
    res = d1.execute(sql, [username])
    
    user = None
    if res and res.get('results'):
        user = res['results'][0]

    # 2. 验证密码 
    if user and user['password_hash'] == password:
        # 3. ✨ 核心修改：签发全信息通行证 (JWT)
        # 这样 Worker 拿到 Token 后，不用问后端，直接就知道你是谁、什么等级
        payload = {
            "uid": user['id'],
            "username": username,
            "role": user.get('role', 'free'),
            "avatar": user.get('avatar', ''), # 存入头像链接
            "exp": datetime.datetime.utcnow() + datetime.timedelta(seconds=Config.JWT_EXP_DELTA)
        }
        token = jwt.encode(payload, Config.SECRET_KEY, algorithm="HS256")

        # 4. 设置 Cookie (设置 Domain 确保 CF 域名通用)
        resp = make_response(jsonify({"success": True, "msg": "登录成功"}))
        domain = Config.COOKIE_DOMAIN if Config.COOKIE_DOMAIN else None
        
        resp.set_cookie(
            'auth_token', 
            token,
            httponly=True,
            secure=Config.COOKIE_SECURE,
            domain=domain,
            path='/',
            samesite='Lax'
        )
        return resp
    else:
        return jsonify({"error": "用户名或密码错误"}), 401

@user_bp.route('/register', methods=['POST'])
def register():
    data = request.json
    username = data.get('username'); password = data.get('password')
    if not username or not password: return jsonify({"error": "内容不能为空"}), 400

    try:
        check = d1.execute("SELECT id FROM users WHERE username = ?", [username])
        if check and check.get('results'): return jsonify({"error": "该名字已被注册"}), 409

        # 注册时默认 role 为 free
        d1.execute("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)", [username, password, 'free'])
        return jsonify({"success": True})
    except Exception as e: return jsonify({"error": str(e)}), 500

@user_bp.route('/profile_api')
def profile_api():
    """个人中心实时数据接口 (用于资源进度条和最近活动)"""
    uid = request.headers.get('X-User-Id')
    if not uid: return jsonify(success=False), 401
    
    try:
        user_res = d1.execute("SELECT username, role, avatar FROM users WHERE id = ?", [uid])
        user_data = user_res['results'][0] if user_res and user_res.get('results') else {}
        
        # 统计元器件和今日 API
        comp_res = d1.execute("SELECT COUNT(*) as count FROM components WHERE user_id = ?", [uid])
        storage_used = comp_res['results'][0]['count'] if comp_res and comp_res.get('results') else 0
        
        api_res = d1.execute("SELECT COUNT(*) as count FROM usage_logs WHERE user_id = ? AND request_date = DATE('now')", [uid])
        api_today = api_res['results'][0]['count'] if api_res and api_res.get('results') else 0

        return jsonify({
            "success": True,
            "user": {
                "username": user_data.get('username', 'Unknown'),
                "role": user_data.get('role', 'free'),
                "avatar": user_data.get('avatar', '')
            },
            "stats": {
                "days": 1, # 这里可以根据创建时间计算
                "api_calls": api_today,
                "storage_used": storage_used,
                "storage_limit": 5000 if user_data.get('role') == 'pro' else 500,
                "api_limit": 1000 if user_data.get('role') == 'pro' else 100
            },
            "activities": [
                {"text": "系统连接成功", "time": "刚刚", "icon": "ri-check-line", "color": "bg-green-100 text-green-600"}
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