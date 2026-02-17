import os
import sys
import jwt
from dotenv import load_dotenv
from flask import Flask, send_from_directory, redirect, jsonify, request, g, url_for, render_template_string, abort

# 加载本地 .env 文件 (仅在本地开发时生效，不影响云端)
load_dotenv()

# --- 强制清理代理环境变量，防止干扰 ---
import os
for var in ['http_proxy', 'https_proxy', 'HTTP_PROXY', 'HTTPS_PROXY']:
    os.environ.pop(var, None)

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

    # --- 1. 注册模块 ---
    from tools.user.routes import user_bp
    app.register_blueprint(user_bp, url_prefix='/auth')

    from tools.inventory.routes import inventory_bp
    app.register_blueprint(inventory_bp, url_prefix='/inventory')

    from tools.project_hub.routes import project_bp
    app.register_blueprint(project_bp, url_prefix='/projects')

    from tools.lvgl_image.routes import lvgl_image_bp
    app.register_blueprint(lvgl_image_bp, url_prefix='/lvgl_image')

    from tools.serial_tool.routes import serial_tool_bp
    app.register_blueprint(serial_tool_bp, url_prefix='/serial')

    from tools.ble_config.routes import ble_config_bp
    app.register_blueprint(ble_config_bp, url_prefix='/ble_config')

    from tools.support.routes import support_bp
    app.register_blueprint(support_bp, url_prefix='/support')

    # --- 1.1 注册全局模板函数 ---
    @app.context_processor
    def inject_global_functions():
        from tools.support.sponsors import get_sponsors_logic
        from tools.support.seo_config import get_seo_data
        return dict(
            get_sponsors=get_sponsors_logic,
            get_seo=get_seo_data,
            lang=request.cookies.get('lang', 'zh')
        )

    # --- 2. 核心中间件：身份模拟与网关安全校验 ---
    @app.before_request
    def handle_auth_and_security():
        # 爬虫识别逻辑 (Google, Bing, Baidu, etc.)
        ua = request.headers.get('User-Agent', '').lower()
        is_bot = any(bot in ua for bot in ['googlebot', 'bingbot', 'baiduspider', 'sogou', 'yandex', 'duckduckbot'])
        
        uid = request.headers.get('X-User-Id')
        if not uid:
            token = request.cookies.get('auth_token')
            if token:
                try:
                    payload = jwt.decode(token, Config.SECRET_KEY, algorithms=["HS256"])
                    uid = str(payload.get('uid'))
                    request.environ['HTTP_X_USER_ID'] = uid
                    request.environ['HTTP_X_USER_ROLE'] = str(payload.get('role'))
                except: pass

        # 白名单
        if request.path == '/' or request.path.startswith('/auth') or \
           request.path == '/health' or request.path == '/proxy_img' or \
           request.path == '/sitemap.xml' or \
           request.path.startswith('/lvgl_image') or \
           request.path.startswith('/serial') or \
           request.path.startswith('/ble_config') or \
           request.path.startswith('/support') or \
           request.path.startswith('/static') or request.path.endswith('.html'):
            return

        # 如果不是白名单且没有 UID，但它是爬虫，允许通过（后续在路由中处理数据屏蔽）
        if not uid:
            if is_bot:
                return # 允许爬虫进入
            if request.path.startswith('/api/'):
                return jsonify(success=False, error="Unauthorized"), 401
            return redirect(f'/login.html?next={request.path}')

        if Config.ENV == 'prod':
            client_secret = request.headers.get('X-Gateway-Secret')
            if client_secret and client_secret != Config.GATEWAY_SECRET:
                return "Forbidden", 403

    @app.after_request
    def after_request_hook(response):
        # 1. 自动记录日志 (暂时注释，规避 D1 同步阻塞导致 504)
        # if request.method in ['POST', 'PUT', 'DELETE'] or request.path == '/inventory/':
        #     uid = request.headers.get('X-User-Id')
        #     if uid:
        #         from tools.database import d1
        #         try:
        #             d1.execute("INSERT INTO usage_logs (user_id, path, status) VALUES (?, ?, ?)", 
        #                        [uid, request.path, response.status_code])
        #         except: pass
        
        # 2. 全局注入 Bug 反馈组件 (支持 i18n)
        if response.content_type and "text/html" in response.content_type:
            try:
                is_passthrough = response.direct_passthrough
                if is_passthrough:
                    response.direct_passthrough = False
                    data = response.get_data(as_text=True)
                else:
                    data = response.get_data(as_text=True)

                if "</body>" in data:
                    bug_widget = """
                    <!-- Help Button -->
                    <div id="help-trigger" onclick="toggleHelpModal()" style="position:fixed; right:24px; bottom:160px; width:48px; height:48px; background:white; border:1px solid #f1f5f9; box-shadow:0 20px 25px -5px rgba(0,0,0,0.1); border-radius:16px; display:flex; align-items:center; justify-content:center; cursor:pointer; z-index:9999; transition:all 0.3s;" onmouseover="this.style.transform='scale(1.1)';" onmouseout="this.style.transform='scale(1)';">
                        <i class="ri-book-open-line" style="font-size:20px; color:#94a3b8;"></i>
                    </div>

                    <!-- Bug 反馈悬浮按钮 -->
                    <div id="bug-report-trigger" onclick="toggleBugModal()" style="position:fixed; right:24px; bottom:100px; width:48px; height:48px; background:white; border:1px solid #f1f5f9; box-shadow:0 20px 25px -5px rgba(0,0,0,0.1); border-radius:16px; display:flex; align-items:center; justify-content:center; cursor:pointer; z-index:9999; transition:all 0.3s;" onmouseover="this.style.transform='scale(1.1)';" onmouseout="this.style.transform='scale(1)';">
                        <i class="ri-bug-2-line" style="font-size:20px; color:#94a3b8;"></i>
                    </div>

                    <!-- Help Modal -->
                    <div id="help-modal" style="display:none; position:fixed; inset:0; background:rgba(15,23,42,0.4); backdrop-filter:blur(4px); z-index:10000; align-items:center; justify-content:center; padding:16px;">
                        <div style="background:white; width:100%; max-width:600px; max-height:80vh; overflow-y:auto; border-radius:32px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.25); padding:32px; position:relative;">
                            <div id="help-content" style="font-size:14px; color:#475569; line-height:1.6;"></div>
                            <button onclick="toggleHelpModal()" style="position:absolute; top:24px; right:24px; border:none; background:none; cursor:pointer; color:#94a3b8;"><i class="ri-close-line" style="font-size:20px;"></i></button>
                        </div>
                    </div>

                    <div id="bug-modal" style="display:none; position:fixed; inset:0; background:rgba(15,23,42,0.4); backdrop-filter:blur(4px); z-index:10000; align-items:center; justify-content:center; padding:16px;">
                        <div style="background:white; width:100%; max-width:400px; border-radius:32px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.25); padding:32px; position:relative;">
                            <h3 class="bug-i18n" data-zh="报告问题" data-en="Report Issue" style="font-weight:900; font-size:20px; margin-bottom:8px;">报告问题</h3>
                            <p class="bug-i18n" data-zh="帮助我们改进系统" data-en="Help us improve" style="font-size:10px; color:#94a3b8; font-weight:800; text-transform:uppercase; margin-bottom:24px;">帮助我们改进系统</p>
                            <textarea id="bug-content" class="bug-i18n-ph" data-zh-ph="请详细描述您遇到的问题..." data-en-ph="Please describe the issue in detail..." style="width:100%; height:120px; padding:16px; border-radius:16px; background:#f8fafc; border:none; outline:none; font-size:14px; resize:none; margin-bottom:16px; min-height:120px;"></textarea>
                            <div style="margin-bottom:16px; display:flex; align-items:center; gap:12px;">
                                <div onclick="document.getElementById('bug-image').click()" style="width:48px; height:48px; border-radius:12px; background:#f1f5f9; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#64748b; border:1px dashed #cbd5e1;">
                                    <i class="ri-camera-line" style="font-size:20px;"></i>
                                </div>
                                <input type="file" id="bug-image" accept="image/*" multiple style="display:none;" onchange="updateBugPreview(this)">
                                <div id="bug-preview-name" class="bug-i18n" data-zh="上传截图 (支持多选)" data-en="Upload Screenshots" style="font-size:11px; color:#94a3b8; font-weight:700;">上传截图 (支持多选)</div>
                            </div>
                            <button id="bug-submit-btn" onclick="submitBug()" class="bug-i18n" data-zh="提交反馈" data-en="Submit Feedback" style="width:100%; padding:16px; background:#0f172a; color:white; border-radius:16px; font-weight:800; border:none; cursor:pointer;">提交反馈</button>
                            <button onclick="toggleBugModal()" style="position:absolute; top:24px; right:24px; border:none; background:none; cursor:pointer; color:#94a3b8;"><i class="ri-close-line" style="font-size:20px;"></i></button>
                        </div>
                    </div>
                    <script src="/support/static/js/support_widget.js"></script>
                    """
                    response.set_data(data.replace("</body>", bug_widget + "</body>"))
                if is_passthrough:
                    response.direct_passthrough = True
            except: pass
        return response

    # --- 3. 路由定义 ---
    @app.route('/proxy_img')
    def proxy_img():
        url = request.args.get('url')
        if not url: abort(404)
        try:
            resp = requests.get(url, timeout=10, verify=False, proxies={"http": None, "https": None})
            return (resp.content, resp.status_code, resp.headers.items())
        except: return "Proxy error", 500

    @app.route('/')
    def serve_index():
        from flask import render_template
        return render_template('index.html')

    @app.route('/login')
    def serve_login():
        return send_from_directory('frontend', 'login.html')

    @app.route('/profile')
    def serve_profile():
        return send_from_directory('frontend', 'profile.html')

    @app.route('/logout')
    def serve_logout():
        from tools.user.routes import user_bp
        return app.view_functions['user.logout']()

    @app.route('/<path:filename>')
    def serve_frontend(filename):
        # 1. 检查是否是各工具模块的静态文件请求 (例如: serial_tool/static/...)
        parts = filename.split('/')
        if len(parts) >= 3 and parts[1] == 'static':
            module_name = parts[0]
            if module_name in ['lvgl_image', 'inventory', 'projects', 'support', 'serial_tool', 'ble_config']:
                blueprint_dir = os.path.join('tools', module_name, 'static')
                static_file = '/'.join(parts[2:])
                full_path = os.path.join(blueprint_dir, static_file)
                if os.path.exists(full_path):
                    return send_from_directory(blueprint_dir, static_file)

        # 2. 检查根 frontend 目录
        if os.path.exists(os.path.join('frontend', filename)):
            return send_from_directory('frontend', filename)
        
        return "Not Found", 404

    @app.route('/health')
    def health(): return {"status": "healthy"}, 200

    @app.route('/sitemap.xml')
    def sitemap():
        """自动生成站点地图，方便搜索引擎爬取"""
        from flask import make_response
        base_url = "https://618002.xyz"
        # 定义所有工具路径
        paths = [
            "/",
            "/serial/",
            "/inventory/",
            "/lvgl_image/",
            "/ble_config/",
            "/projects/",
            "/support/"
        ]
        
        xml = '<?xml version="1.0" encoding="UTF-8"?>'
        xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        for path in paths:
            xml += f'<url><loc>{base_url}{path}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>'
        xml += '</urlset>'
        
        response = make_response(xml)
        response.headers["Content-Type"] = "application/xml"
        return response

    return app

app = create_app()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=False, use_reloader=False)
