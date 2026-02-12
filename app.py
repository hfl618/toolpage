import os
import sys
import jwt
from dotenv import load_dotenv
from flask import Flask, send_from_directory, redirect, jsonify, request, g, url_for

# 加载本地 .env 文件 (仅在本地开发时生效，不影响云端)
load_dotenv()

# 强制日志立即输出，不缓存
sys.stdout.reconfigure(line_buffering=True)

import requests
from tools.config import Config

def create_app():
    # 明确指定模板和静态文件路径，适配根目录运行
    app = Flask(__name__, 
                template_folder='tools/inventory/templates', 
                static_folder='tools/inventory/static')
    
    app.config.from_object(Config)

    # --- 1. 注册认证与用户模块 ---
    from tools.user.routes import user_bp
    app.register_blueprint(user_bp, url_prefix='/auth')

    # --- 2. 模块化业务注册 ---
    from tools.inventory.routes import inventory_bp
    app.register_blueprint(inventory_bp, url_prefix='/inventory')

    from tools.project_hub.routes import project_bp
    app.register_blueprint(project_bp, url_prefix='/projects')

    from tools.lvgl_image.routes import lvgl_image_bp
    app.register_blueprint(lvgl_image_bp, url_prefix='/lvgl_image')

    # --- 3. 核心中间件：身份模拟与网关安全校验 ---
    @app.before_request
    def handle_auth_and_security():
        # 1. 尝试获取并注入用户身份 (这一步对所有请求执行，包括公开页面)
        uid = request.headers.get('X-User-Id')
        if not uid:
            token = request.cookies.get('auth_token')
            if token:
                try:
                    # 解析 JWT 并注入环境信息
                    payload = jwt.decode(token, Config.SECRET_KEY, algorithms=["HS256"])
                    uid = str(payload.get('uid'))
                    request.environ['HTTP_X_USER_ID'] = uid
                    request.environ['HTTP_X_USER_ROLE'] = str(payload.get('role'))
                except:
                    pass

        # 2. 放开认证、健康检查、静态资源、图片代理以及前端页面
        if request.path == '/' or request.path.startswith('/auth') or \
           request.path == '/health' or request.path == '/proxy_img' or \
           request.path.startswith('/lvgl_image') or \
           request.path.startswith('/static') or request.path.endswith('.html'):
            return

        # 3. 拦截未登录的私有路径
        if not uid:
            if request.path.startswith('/api/'):
                return jsonify(success=False, error="Unauthorized: Missing identity"), 401
            # 统一跳转到前端登录页，并带上 next 参数
            return redirect(f'/login.html?next={request.path}')

        # 4. 【生产环境】安全校验：如果是来自网关的请求，校验密钥
        if Config.ENV == 'prod':
            client_secret = request.headers.get('X-Gateway-Secret')
            if client_secret and client_secret != Config.GATEWAY_SECRET:
                return "Forbidden: Invalid gateway secret.", 403

    @app.route('/proxy_img')
    def proxy_img():
        """代理 R2 图片，解决手机端 r2.dev 域名访问不稳定的问题"""
        url = request.args.get('url')
        if not url or not url.startswith('http'):
            abort(404)
        try:
            # 强制不使用系统代理，防止本地 VPN 导致连接失败
            resp = requests.get(url, timeout=10, verify=False, proxies={"http": None, "https": None})
            return (resp.content, resp.status_code, resp.headers.items())
        except Exception as e:
            return f"Proxy error: {e}", 500

    # --- 4. 自动记录操作日志 ---
    @app.after_request
    def log_request(response):
        # 仅记录写入类操作或核心访问
        if request.method in ['POST', 'PUT', 'DELETE'] or request.path == '/inventory/':
            uid = request.headers.get('X-User-Id')
            if uid:
                from tools.database import d1
                try:
                    d1.execute("INSERT INTO usage_logs (user_id, path, status) VALUES (?, ?, ?)", 
                               [uid, request.path, response.status_code])
                except: pass
        return response

    @app.route('/api/user/change_password', methods=['POST'])
    def api_change_pw_proxy():
        from tools.user.routes import user_bp
        return app.view_functions['user.change_password']()

    @app.route('/api/user/avatar_upload', methods=['POST'])
    def api_avatar_upload_proxy():
        from tools.user.routes import user_bp
        return app.view_functions['user.upload_avatar']()

    @app.route('/api/user/profile')
    def api_profile_proxy():
        # 内部重定向到新的 user 模块接口
        from tools.user.routes import user_bp
        return app.view_functions['user.profile_api']()

    # --- 静态前端托管 (仅限本地开发使用，线上建议用 CF Pages) ---
    @app.route('/')
    def serve_index():
        return send_from_directory('frontend', 'index.html')

    @app.route('/login')
    def serve_login():
        return send_from_directory('frontend', 'login.html')

    @app.route('/profile')
    def serve_profile():
        return send_from_directory('frontend', 'profile.html')

    @app.route('/logout')
    def serve_logout():
        # 调用 user 模块的退出逻辑
        from tools.user.routes import user_bp
        return app.view_functions['user.logout']()

    @app.route('/<path:filename>')
    def serve_frontend(filename):
        # 1. 如果请求的是蓝图目录下的静态文件
        # 路径示例: lvgl_image/static/docs.txt
        if '/static/' in filename:
            parts = filename.split('/')
            if parts[0] in ['lvgl_image', 'inventory', 'projects']:
                blueprint_dir = os.path.join('tools', parts[0], 'static')
                static_file = '/'.join(parts[2:]) # 去掉 'lvgl_image' 和 'static'
                if os.path.exists(os.path.join(blueprint_dir, static_file)):
                    return send_from_directory(blueprint_dir, static_file)

        # 2. 优先从 frontend 目录查找文件
        if os.path.exists(os.path.join('frontend', filename)):
            return send_from_directory('frontend', filename)
        
        return "Not Found", 404

    @app.route('/health')
    def health():
        return {"status": "healthy"}, 200

    # ------------------ AI 工具代理路由 ------------------
    @app.route('/ai_tools')
    def ai_tools():
        try:
            import tools.AI_app as ai_app
            return render_template_string(ai_app.HTML_TEMPLATE)
        except Exception as e:
            return f"无法加载 AI 工具：{e}", 500

    @app.route('/debug/routes')
    def list_routes():
        import urllib
        output = []
        for rule in app.url_map.iter_rules():
            methods = ','.join(rule.methods)
            line = urllib.parse.unquote(f"{rule.endpoint:50s} {methods:20s} {rule}")
            output.append(line)
        return "<pre>" + "\n".join(sorted(output)) + "</pre>"

    return app

app = create_app()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    print(f"--- Starting Flask App on port {port} ---")
    app.run(
        host='0.0.0.0', 
        port=port, 
        debug=False,
        use_reloader=False
    )
