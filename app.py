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
            return redirect(url_for('auth.login', next=request.path))

        # 3. 【生产环境】安全校验：如果是来自网关的请求，校验密钥
        if Config.ENV == 'prod':
            client_secret = request.headers.get('X-Gateway-Secret')
            # 只有当请求头包含 X-Gateway-Secret 时才校验（允许直接访问或网关访问）
            if client_secret and client_secret != Config.GATEWAY_SECRET:
                return "Forbidden: Invalid gateway secret.", 403

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

    @app.route('/admin/cleanup_r2')
    def admin_cleanup_r2():
        try:
            import boto3
            from botocore.config import Config as BotoConfig
            from tools.config import Config
            
            s3 = boto3.client(
                service_name='s3',
                endpoint_url=Config.R2_ENDPOINT,
                aws_access_key_id=Config.R2_ACCESS_KEY,
                aws_secret_access_key=Config.R2_SECRET_KEY,
                region_name='auto',
                config=BotoConfig(signature_version='s3v4'),
                verify=False
            )
            
            prefixes = ['inventory/images/', 'inventory/qrcodes/', 'inventory/user_2/']
            results = []
            
            for prefix in prefixes:
                paginator = s3.get_paginator('list_objects_v2')
                pages = paginator.paginate(Bucket=Config.R2_BUCKET, Prefix=prefix)
                delete_keys = []
                for page in pages:
                    if 'Contents' in page:
                        for obj in page['Contents']:
                            delete_keys.append({'Key': obj['Key']})
                
                if delete_keys:
                    for i in range(0, len(delete_keys), 1000):
                        s3.delete_objects(Bucket=Config.R2_BUCKET, Delete={'Objects': delete_keys[i:i+1000]})
                    results.append(f"Deleted {len(delete_keys)} files from {prefix}")
                else:
                    results.append(f"Prefix {prefix} already empty")
            
            return {"success": True, "details": results}
        except Exception as e:
            return {"success": False, "error": str(e)}, 500

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
