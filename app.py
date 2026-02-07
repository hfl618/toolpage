from flask import Flask
from flask_cors import CORS
from config import Config

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    CORS(app)

    # --- 模块化注册：以后每加一个工具，只需在这里加两行 ---
    from tools.inventory.routes import inventory_bp
    app.register_blueprint(inventory_bp, url_prefix='/inventory')

    # 预留：AI识别工具
    # from tools.ai_vision.routes import ai_bp
    # app.register_blueprint(ai_bp, url_prefix='/ai')

    return app

app = create_app()

if __name__ == '__main__':
    # Hugging Face 或本地运行环境
    app.run(host='0.0.0.0', port=7860)
