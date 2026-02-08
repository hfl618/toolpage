import datetime
import jwt
from flask import Blueprint, request, jsonify, make_response
from .database import d1
from .config import Config

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/auth/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({"error": "Missing credentials"}), 400

    # 1. 查询用户
    sql = "SELECT id, password_hash, role FROM users WHERE username = ?"
    res = d1.execute(sql, [username])
    
    user = None
    if res and res.get('results'):
        user = res['results'][0]

    # 2. 验证密码 
    if user and user['password_hash'] == password:
        # 3. 生成真正的 JWT
        payload = {
            "uid": user['id'],
            "role": user['role'],
            "exp": datetime.datetime.utcnow() + datetime.timedelta(seconds=Config.JWT_EXP_DELTA)
        }
        token = jwt.encode(payload, Config.SECRET_KEY, algorithm="HS256")

        # 4. 设置 Cookie
        resp = make_response(jsonify({"success": True, "msg": "Login successful"}))
        resp.set_cookie(
            'auth_token', 
            token,
            httponly=True,
            secure=Config.COOKIE_SECURE,
            domain=Config.COOKIE_DOMAIN,
            samesite='Lax'
        )
        return resp
    else:
        return jsonify({"error": "Invalid username or password"}), 401

@auth_bp.route('/auth/register', methods=['POST'])
def register():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    try:
        sql = "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)"
        d1.execute(sql, [username, password, 'free'])
        return jsonify({"success": True, "msg": "User created"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500