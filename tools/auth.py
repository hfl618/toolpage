import datetime
import jwt
from flask import Blueprint, request, jsonify, make_response, render_template_string
from .database import d1 # Import database singleton
from .config import Config

auth_bp = Blueprint('auth', __name__)

LOGIN_HTML = """
<!DOCTYPE html>
<html>
<head>
    <title>Login - Toolpage</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f0f2f5; }
        .login-card { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); width: 300px; }
        input { width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
        button { width: 100%; padding: 10px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; }
        button:hover { background: #0056b3; }
    </style>
</head>
<body>
    <div class="login-card">
        <h2>Login</h2>
        <form id="loginForm">
            <input type="text" id="username" placeholder="Username" required>
            <input type="password" id="password" placeholder="Password" required>
            <button type="submit">Sign In</button>
        </form>
        <p id="msg" style="color:red; font-size:12px;"></p>
    </div>
    <script>
        document.getElementById('loginForm').onsubmit = async (e) => {
            e.preventDefault();
            const res = await fetch('/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: document.getElementById('username').value,
                    password: document.getElementById('password').value
                })
            });
            const data = await res.json();
            if (data.success) {
                window.location.href = new URLSearchParams(window.location.search).get('next') || '/';
            } else {
                document.getElementById('msg').innerText = data.error || 'Login failed';
            }
        };
    </script>
</body>
</html>
"""

@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'GET':
        return render_template_string(LOGIN_HTML)
        
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
        # 3. 生成真正的 JWT (增加 username 供 Worker 直接提取)
        payload = {
            "uid": user['id'],
            "username": username,
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

@auth_bp.route('/profile_api')
def profile_api():
    """为前端提供真实的个人中心数据"""
    from flask import g
    uid = request.headers.get('X-User-Id')
    if not uid: return jsonify(success=False), 401
    
    try:
        # 1. 获取基础统计
        # 存入天数
        user_res = d1.execute("SELECT created_at FROM users WHERE id = ?", [uid])
        join_date = user_res['results'][0]['created_at'] if user_res['results'] else None
        days = 1
        if join_date:
            from datetime import datetime
            delta = datetime.utcnow() - datetime.strptime(join_date, '%Y-%m-%d %H:%M:%S')
            days = max(1, delta.days)

        # 库存用量
        count_res = d1.execute("SELECT COUNT(*) as count FROM components WHERE user_id = ?", [uid])
        storage_used = count_res['results'][0]['count'] if count_res['results'] else 0

        # 今日 API 调用
        api_res = d1.execute("SELECT COUNT(*) as count FROM usage_logs WHERE user_id = ? AND request_date = DATE('now')", [uid])
        api_today = api_res['results'][0]['count'] if api_res['results'] else 0

        # 2. 获取最近活动 (从日志表取最近5条)
        log_res = d1.execute("SELECT path, created_at FROM usage_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 5", [uid])
        activities = []
        path_map = {'/inventory/add': '添加了元器件', '/inventory/update': '更新了元器件', '/auth/login': '登录了系统', '/inventory/import/execute': '执行了批量导入'}
        
        if log_res and log_res.get('results'):
            for log in log_res['results']:
                action = '使用了系统功能'
                for k, v in path_map.items():
                    if k in log['path']: action = v; break
                activities.append({
                    "text": action,
                    "time": log['created_at'],
                    "icon": "ri-pulse-line",
                    "color": "bg-blue-100 text-blue-600"
                })

        return jsonify({
            "success": True,
            "stats": {
                "days": days,
                "api_calls": 0, # 这里可以根据需要统计总数
                "storage_used": storage_used,
                "api_today": api_today
            },
            "activities": activities
        })
    except Exception as e:
        return jsonify(success=False, error=str(e)), 500

@auth_bp.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'GET':
        return render_template_string("""
        <!DOCTYPE html>
        <html><body>
            <h2>Register New User</h2>
            <form method="POST">
                <input name="username" placeholder="Username" required><br>
                <input name="password" type="password" placeholder="Password" required><br>
                <button type="submit">Register</button>
            </form>
        </body></html>
        """)
    
    # 支持 JSON 和 表单 两种提交方式
    if request.is_json:
        data = request.json
    else:
        data = request.form
        
    username = data.get('username')
    password = data.get('password')
    try:
        sql = "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)"
        d1.execute(sql, [username, password, 'free'])
        if not request.is_json:
            return 'User created! <a href="/auth/login">Go to Login</a>'
        return jsonify({"success": True, "msg": "User created"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500