import datetime
import jwt
from flask import Blueprint, request, jsonify, make_response, render_template_string, redirect, url_for
from tools.database import d1 # Import database singleton
from tools.config import Config

user_bp = Blueprint('user', __name__)

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

@user_bp.route('/login', methods=['GET', 'POST'])
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

@user_bp.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'GET':
        return render_template_string("Direct access not supported. Use the login page.")
    
    data = request.json if request.is_json else request.form
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400

    try:
        # 1. 显式查重
        check_sql = "SELECT id FROM users WHERE username = ?"
        exists = d1.execute(check_sql, [username])
        if exists and exists.get('results'):
            return jsonify({"error": "该用户名已被注册，请换一个"}), 409

        # 2. 执行插入
        sql = "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)"
        d1.execute(sql, [username, password, 'free'])
        return jsonify({"success": True, "msg": "User created"})
    except Exception as e:
        # 兜底捕获数据库约束错误
        err_msg = str(e)
        if "UNIQUE constraint failed" in err_msg:
            return jsonify({"error": "该用户名已被注册"}), 409
        return jsonify({"error": f"注册失败: {err_msg}"}), 500

@user_bp.route('/logout')
def logout_api():
    """服务器端注销，彻底清除 HttpOnly Cookie"""
    resp = make_response(jsonify(success=True, msg="Logged out"))
    # 设置一个立即过期的 Cookie 来覆盖旧的
    resp.set_cookie('auth_token', '', expires=0, path='/')
    # 如果有自定义域名，也尝试清除
    if Config.COOKIE_DOMAIN:
        resp.set_cookie('auth_token', '', expires=0, domain=Config.COOKIE_DOMAIN, path='/')
    return resp

@user_bp.route('/info')
def user_info():
    """获取当前登录用户信息，用于前端导航栏"""
    uid = request.headers.get('X-User-Id')
    if not uid:
        return jsonify(user=None)
    
    res = d1.execute("SELECT username, role, avatar FROM users WHERE id = ?", [uid])
    username = f"User_{uid}"
    role = "free"
    avatar = None
    
    if res and res.get('results'):
        u = res['results'][0]
        username = u.get('username') or username
        role = u.get('role') or role
        avatar = u.get('avatar')

    return jsonify(user={
        "uid": uid,
        "username": username,
        "role": role,
        "avatar": avatar
    })

@user_bp.route('/check_username')
def check_username():
    """实时查重与规则校验接口"""
    username = request.args.get('username', '').strip()
    if not username: return jsonify(available=False, reason="")
    
    # 规则 1: 长度至少 4 位
    if len(username) < 4:
        return jsonify(available=False, reason="至少4位")
    
    # 规则 2: 不能是纯数字
    if username.isdigit():
        return jsonify(available=False, reason="不能纯数字")
    
    try:
        # 规则 3: 唯一性检查
        res = d1.execute("SELECT id FROM users WHERE username = ?", [username])
        if res and res.get('results'):
            return jsonify(available=False, reason="已被占用")
        return jsonify(available=True, reason="可用")
    except:
        return jsonify(available=True, reason="")

from tools.r2_client import upload_to_r2

@user_bp.route('/upload_avatar', methods=['POST'])
def upload_avatar():
    uid = request.headers.get('X-User-Id')
    if not uid: return jsonify(success=False, error="Unauthorized"), 401
    
    file = request.files.get('avatar')
    if not file: return jsonify(success=False, error="No file uploaded"), 400
    
    try:
        # 上传到 R2: users/avatar_{uid}.png
        url = upload_to_r2(file, "avatars", fixed_name=f"avatar_{uid}", app_name="users")
        if url:
            try:
                d1.execute("UPDATE users SET avatar = ? WHERE id = ?", [url, uid])
            except: pass
            return jsonify(success=True, url=url)
        return jsonify(success=False, error="Upload failed")
    except Exception as e:
        return jsonify(success=False, error=str(e)), 500

@user_bp.route('/change_password', methods=['POST'])
def change_password():
    uid = request.headers.get('X-User-Id')
    if not uid: return jsonify(success=False, error="Unauthorized"), 401
    
    data = request.json
    old_pw = data.get('old_password')
    new_pw = data.get('new_password')
    
    if not old_pw or not new_pw:
        return jsonify(success=False, error="请输入完整信息"), 400
    if len(new_pw) < 6:
        return jsonify(success=False, error="新密码至少需要6位"), 400
        
    try:
        # 1. 验证旧密码
        user_res = d1.execute("SELECT password_hash FROM users WHERE id = ?", [uid])
        if not user_res or not user_res.get('results'):
            return jsonify(success=False, error="用户不存在"), 404
            
        current_hash = user_res['results'][0]['password_hash']
        if current_hash != old_pw:
            return jsonify(success=False, error="旧密码错误"), 403
            
        # 2. 更新密码
        d1.execute("UPDATE users SET password_hash = ? WHERE id = ?", [new_pw, uid])
        return jsonify(success=True)
    except Exception as e:
        return jsonify(success=False, error=str(e)), 500

@user_bp.route('/profile_api')
def profile_api():
    """为前端提供真实的个人中心数据"""
    uid = request.headers.get('X-User-Id')
    if not uid: return jsonify(success=False), 401
    
    try:
        # 1. 获取用户信息和头像
        user_res = d1.execute("SELECT username, role, created_at, avatar FROM users WHERE id = ?", [uid])
        user_data = user_res['results'][0] if user_res and user_res.get('results') else {}
        
        username = user_data.get('username') or f"User_{uid}"
        role = user_data.get('role') or "free"
        avatar_url = user_data.get('avatar')
        
        # 如果数据库没有头像，使用基于用户名的默认生成器
        if not avatar_url:
            avatar_url = f"https://api.dicebear.com/7.x/avataaars/svg?seed={username}"

        # 2. 动态读取数据库配额配置
        # 读取存储限制配置
        storage_cfg = d1.execute("SELECT * FROM tool_configs WHERE path = '/api/inventory/add'")
        s_cfg = storage_cfg['results'][0] if storage_cfg and storage_cfg.get('results') else {}
        storage_limit = s_cfg.get(f'daily_limit_{role.lower()}', 500)
        
        # 读取 API 限制配置 (默认通用限制)
        api_cfg = d1.execute("SELECT * FROM tool_configs WHERE path = '/api/usage/general'")
        a_cfg = api_cfg['results'][0] if api_cfg and api_cfg.get('results') else {}
        api_limit = a_cfg.get(f'daily_limit_{role.lower()}', 100)

        # 元器件总数
        comp_res = d1.execute("SELECT COUNT(*) as count FROM components WHERE user_id = ?", [uid])
        storage_used = comp_res['results'][0]['count'] if comp_res and comp_res.get('results') else 0

        # 今日操作记录
        api_res = d1.execute("SELECT COUNT(*) as count FROM usage_logs WHERE user_id = ? AND request_date = DATE('now')", [uid])
        api_today = api_res['results'][0]['count'] if api_res and api_res.get('results') else 0

        # 3. 统计加入天数
        join_date = user_data.get('created_at')
        days = 1
        if join_date:
            from datetime import datetime
            try:
                dt_str = join_date[:19]
                fmt = '%Y-%m-%d %H:%M:%S' if ' ' in dt_str else '%Y-%m-%d'
                delta = datetime.utcnow() - datetime.strptime(dt_str, fmt)
                days = max(1, delta.days)
            except: pass

        # 4. 获取最近活动 (最近 5 条)
        log_res = d1.execute("SELECT path, created_at FROM usage_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 5", [uid])
        activities = []
        path_map = {
            '/inventory/add': '添加了元器件', 
            '/inventory/update': '更新了元器件', 
            '/auth/login': '登录了系统', 
            '/inventory/import/execute': '执行了批量导入',
            '/api/user/avatar_upload': '更新了个人头像'
        }
        
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
            "user": {"username": username, "role": role, "avatar": avatar_url},
            "stats": {
                "days": days,
                "api_calls": api_today,
                "storage_used": storage_used,
                "storage_limit": storage_limit,
                "api_today": api_today,
                "api_limit": api_limit
            },
            "activities": activities
        })
    except Exception as e:
        return jsonify(success=False, error=str(e)), 500
