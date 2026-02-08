import requests
from flask import Flask, render_template, request, jsonify, render_template_string, redirect, url_for
from flask_cors import CORS
from config import Config

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    CORS(app)

    # --- 模块化注册 ---
    from tools.inventory.routes import inventory_bp
    app.register_blueprint(inventory_bp, url_prefix='/inventory')

    from tools.project_hub.routes import project_bp
    app.register_blueprint(project_bp, url_prefix='/projects')

    @app.route('/')
    def index():
        return redirect(url_for('inventory.index'))

    # ------------------ AI 工具代理路由 ------------------
    @app.route('/ai_tools')
    def ai_tools():
        try:
            import AI_app as ai_app
            return render_template_string(ai_app.HTML_TEMPLATE)
        except Exception as e:
            return f"无法加载 AI 工具：{e}", 500

    @app.route('/get_env_config')
    def get_env_config():
        try:
            import AI_app as ai_app
            from dotenv import dotenv_values, load_dotenv
            load_dotenv(ai_app.Config.ENV_FILE)
            env = dotenv_values(ai_app.Config.ENV_FILE)
            config = {
                'api_key': env.get('API_KEY') or ai_app.Config.API_KEY or '',
                'api_url': env.get('API_URL') or ai_app.Config.API_URL or '',
                'ai_model': env.get('AI_MODEL') or ai_app.Config.AI_MODEL or ''
            }
            return jsonify(success=True, config=config)
        except Exception as e:
            return jsonify(success=False, message=str(e))

    @app.route('/save_api_config', methods=['POST'])
    def save_api_config():
        try:
            import AI_app as ai_app
            data = request.get_json() or {}
            ok = ai_app.Config.save_env(data.get('api_key', ''), data.get('api_url', ''), data.get('ai_model', ''))
            return jsonify(success=ok, message='保存成功' if ok else '保存失败')
        except Exception as e:
            return jsonify(success=False, message=str(e))

    @app.route('/test_api', methods=['POST'])
    def test_api():
        try:
            data = request.get_json() or {}
            headers = {'Authorization': f"Bearer {data.get('api_key')}", 'Content-Type': 'application/json'}
            payload = {'model': data.get('ai_model', 'gpt-3.5-turbo'), 'messages': [{'role': 'user', 'content': '测试连接'}], 'temperature': 0}
            resp = requests.post(f"{data.get('api_url').rstrip('/')}/chat/completions", headers=headers, json=payload, timeout=10)
            return jsonify(success=(resp.status_code in (200, 201)), message='连接成功' if resp.status_code in (200, 201) else f'错误: {resp.status_code}')
        except Exception as e:
            return jsonify(success=False, message=str(e))

    @app.route('/upload_images', methods=['POST'])
    def upload_images_proxy():
        import AI_app as ai
        return ai.upload_images()

    @app.route('/ai_parse', methods=['POST'])
    def ai_parse_proxy():
        import AI_app as ai
        return ai.api_ai_parse()

    @app.route('/save_to_table', methods=['POST'])
    def save_to_table_proxy():
        import AI_app as ai
        return ai.save_to_table()

    @app.route('/get_table_info')
    def get_table_info_proxy():
        import AI_app as ai
        return ai.api_get_table_info()

    @app.route('/download_table')
    def download_table_proxy():
        import AI_app as ai
        return ai.download_table()

    @app.route('/parse_paste_data', methods=['POST'])
    def parse_paste_data_proxy():
        import AI_app as ai
        return ai.parse_paste_data()

    return app

app = create_app()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=7860)
