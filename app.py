import os
import sys

# 极其关键：这是容器启动后第一行执行的代码
print("🚀 [CRITICAL] app.py execution started!", flush=True)

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
    app.register_blueprint(auth_bp)

    # --- 2. 模块化业务注册 ---
    from tools.inventory.routes import inventory_bp
    app.register_blueprint(inventory_bp, url_prefix='/inventory')

    from tools.project_hub.routes import project_bp
    app.register_blueprint(project_bp, url_prefix='/projects')

    # --- 3. 核心中间件：身份模拟与网关安全校验 ---
    @app.before_request
    def handle_auth_and_security():
        # 放行健康检查和静态资源
        if request.path == '/health' or request.path.startswith('/static'):
            return

        # 【生产环境】安全校验：必须携带网关密钥
        if Config.ENV == 'prod':
            client_secret = request.headers.get('X-Gateway-Secret')
            if client_secret != Config.GATEWAY_SECRET:
                # 记录一下被拦截的请求，方便调试
                app.logger.warning(f"Access denied for {request.path} from {request.remote_addr}")
                return "Forbidden: Direct access not allowed. Please use the official gateway.", 403

        # 【本地环境】身份模拟
        elif Config.ENV == 'local':
            if not request.headers.get('X-User-Id'):
                token = request.cookies.get('auth_token')
                if token:
                    try:
                        payload = jwt.decode(token, Config.SECRET_KEY, algorithms=["HS256"])
                        request.environ['HTTP_X_USER_ID'] = str(payload.get('uid'))
                        request.environ['HTTP_X_USER_ROLE'] = str(payload.get('role'))
                    except:
                        pass

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

    return app

app = create_app()

if __name__ == '__main__':
    print("--- Starting Flask App directly ---")
    # 监听 0.0.0.0 以便在 Docker 中被外部访问
    app.run(
        host='0.0.0.0', 
        port=7860, 
        debug=False,
        use_reloader=False
    )
