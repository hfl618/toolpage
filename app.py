import os
import sys
# 强制日志立即输出，不缓存
sys.stdout.reconfigure(line_buffering=True)

import requests
import jwt
from flask import Flask, render_template, request, jsonify, render_template_string, redirect, url_for, g
from tools.config import Config

def create_app():
    # 明确指定模板和静态文件路径，适配根目录运行
    app = Flask(__name__, 
                template_folder='tools/inventory/templates', 
                static_folder='tools/inventory/static')
    
    app.config.from_object(Config)

    # --- 1. 注册认证蓝图 ---
    from tools.auth import auth_bp
    app.register_blueprint(auth_bp, url_prefix='/auth')

    # --- 2. 模块化业务注册 ---
    from tools.inventory.routes import inventory_bp
    app.register_blueprint(inventory_bp, url_prefix='/inventory')

    from tools.project_hub.routes import project_bp
    app.register_blueprint(project_bp, url_prefix='/projects')

    # --- 3. 核心中间件：身份模拟与网关安全校验 ---
    @app.before_request
    def handle_auth_and_security():
        # 放开认证、健康检查和静态资源
        if request.path.startswith('/auth') or request.path == '/health' or request.path.startswith('/static'):
            return

        # 1. 尝试获取 UID (从 Header 或 Cookie)
        uid = request.headers.get('X-User-Id')
        
        # 如果 Header 没有，尝试从 Cookie 解析 JWT (方便直接浏览器访问)
        if not uid:
            token = request.cookies.get('auth_token')
            if token:
                try:
                    payload = jwt.decode(token, Config.SECRET_KEY, algorithms=["HS256"])
                    uid = str(payload.get('uid'))
                    request.environ['HTTP_X_USER_ID'] = uid
                    request.environ['HTTP_X_USER_ROLE'] = str(payload.get('role'))
                except:
                    pass

        # 2. 如果依然没有 UID，且不是在 API 路径下，重定向到登录
        if not uid:
            if request.path.startswith('/api/'):
                return jsonify(success=False, error="Unauthorized: Missing identity"), 401
            # 统一跳转到 Worker 的登录页
            return redirect(f'/login?next={request.path}')

        # 3. 【生产环境】安全校验：如果是来自网关的请求，校验密钥
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
            resp = requests.get(url, timeout=10, verify=False)
            return (resp.content, resp.status_code, resp.headers.items())
        except Exception as e:
            return f"Proxy error: {e}", 500

    @app.route('/health')
    def health():
        return {"status": "healthy"}, 200

    @app.route('/')
    def index():
        return redirect(url_for('inventory.index'))

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
