from flask import Flask, redirect
from flask_cors import CORS
from config import Config

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    CORS(app)

    # 导入并注册元器件工具
    try:
        from tools.inventory.routes import inventory_bp
        app.register_blueprint(inventory_bp, url_prefix='/inventory')
        print("✅ 成功注册：元器件仓库 (/inventory)")
    except Exception as e:
        print(f"❌ 注册元器件仓库失败: {e}")

    # 导入并注册项目中心工具
    try:
        from tools.project_hub.routes import project_bp
        app.register_blueprint(project_bp, url_prefix='/projects')
        print("✅ 成功注册：项目中心 (/projects)")
    except Exception as e:
        print(f"❌ 注册项目中心失败: {e}")

    @app.route('/')
    def index():
        return redirect('/inventory/')

    # 打印所有路由，方便调试
    print("\n--- 当前已注册的所有路由 ---")
    for rule in app.url_map.iter_rules():
        print(f"Endpoint: {rule.endpoint:20} URL: {rule}")
    print("---------------------------\n")

    return app

app = create_app()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=7860, debug=True)