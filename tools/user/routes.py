import datetime
import jwt
import os
from flask import Blueprint, request, jsonify, make_response
from werkzeug.security import generate_password_hash, check_password_hash
from tools.database import d1
from tools.config import Config

user_bp = Blueprint('user', __name__)

@user_bp.route('/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    if not username or not password: return jsonify({"error": "请输入账号密码"}), 400

    # 1. 查库
    sql = "SELECT id, username, password_hash, role, avatar FROM users WHERE username = ?"
    res = d1.execute(sql, [username])
    user = res['results'][0] if res and res.get('results') else None

    # 2. 验证 (支持明文自动升级哈希)
    if user:
        if check_password_hash(user['password_hash'], password) or user['password_hash'] == password:
            if not user['password_hash'].startswith('pbkdf2:sha256:'):
                # 自动升级旧账号
                new_hash = generate_password_hash(password)
                d1.execute("UPDATE users SET password_hash = ? WHERE id = ?", [new_hash, user['id']])
            
            # 签发 JWT (包含全量信息)
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
    u = data.get('username'); p = data.get('password')
    if not u or not p: return jsonify({"error": "不能为空"}), 400
    try:
        check = d1.execute("SELECT id FROM users WHERE username = ?", [u])
        if check and check.get('results'): return jsonify({"error": "名字已被占用"}), 409
        d1.execute("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)", [u, generate_password_hash(p), 'free'])
        return jsonify({"success": True})
    except Exception as e: return jsonify({"error": str(e)}), 500

@user_bp.route('/update_profile', methods=['POST'])
def update_profile():
    """对接 v3.3 前端的修改接口"""
    uid = request.headers.get('X-User-Id')
    if not uid: return jsonify(success=False, error="未登录"), 401
    
    data = request.json
    new_u = data.get('username', '').strip()
    new_p = data.get('password', '').strip() # 对应前端的 new-password
    
    fields, params = [], []
    if new_u:
        exists = d1.execute("SELECT id FROM users WHERE username = ? AND id != ?", [new_u, uid])
        if exists and exists.get('results'): return jsonify(success=False, error="用户名已存在"), 400
        fields.append("username = ?"); params.append(new_u)
    if new_p:
        if len(new_p) < 6: return jsonify(success=False, error="密码至少6位"), 400
        fields.append("password_hash = ?"); params.append(generate_password_hash(new_p))
    
    if not fields: return jsonify(success=False, error="未提供修改内容"), 400
    try:
        params.append(uid)
        d1.execute(f"UPDATE users SET {', '.join(fields)} WHERE id = ?", params)
        return jsonify(success=True)
    except Exception as e: return jsonify(success=False, error=str(e)), 500

@user_bp.route('/profile_api')
def profile_api():
    """提供 v3.3 前端所需的所有字段"""
    uid = request.headers.get('X-User-Id')
    if not uid: return jsonify(success=False), 401
    try:
        user_res = d1.execute("SELECT username, role, avatar, created_at FROM users WHERE id = ?", [uid])
        u_data = user_res['results'][0] if user_res and user_res.get('results') else {}
        
        # 统计数据
        count_res = d1.execute("SELECT COUNT(*) as count FROM components WHERE user_id = ?", [uid])
        storage_used = count_res['results'][0]['count'] if count_res and count_res.get('results') else 0
        
        api_res = d1.execute("SELECT COUNT(*) as count FROM usage_logs WHERE user_id = ? AND request_date = DATE('now')", [uid])
        api_today = api_res['results'][0]['count'] if api_res and api_res.get('results') else 0

        # 加入天数计算
        days = 1
        if u_data.get('created_at'):
            from datetime import datetime
            try:
                delta = datetime.utcnow() - datetime.strptime(u_data['created_at'][:10], '%Y-%m-%d')
                days = max(1, delta.days)
            except: pass

        return jsonify({
            "success": True,
            "user": {
                "username": u_data.get('username', 'User'),
                "role": u_data.get('role', 'free'),
                "avatar": u_data.get('avatar', '')
            },
            "stats": {
                "days": days,
                "api_today": api_today,
                "storage_used": storage_used,
                "storage_limit": 5000 if u_data.get('role') == 'pro' else 500,
                "api_limit": 1000 if u_data.get('role') == 'pro' else 100
            },
            "activities": [
                {"text": "访问了工作台", "time": "刚刚", "icon": "ri-radar-line", "color": "text-blue-500", "bg": "bg-blue-50"}
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