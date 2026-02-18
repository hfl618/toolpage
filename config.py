import os

class Config:
    # 优先从环境变量读取，如果没有则使用默认值（仅限非敏感项）
    SECRET_KEY = os.getenv('SECRET_KEY', 'default-unsafe-key')
    
    # Cloudflare D1 配置
    CF_ACCOUNT_ID = os.getenv('CF_ACCOUNT_ID')
    CF_D1_DATABASE_ID = os.getenv('CF_D1_DATABASE_ID')
    CF_API_TOKEN = os.getenv('CF_API_TOKEN')

    # Lemon Squeezy 支付安全
    LS_WEBHOOK_SECRET = os.getenv('LS_WEBHOOK_SECRET', 'your-default-secret-here')
    
    # 静态资源路径
    BASE_DIR = os.path.abspath(os.path.dirname(__file__))
    STATIC_FOLDER = os.path.join(BASE_DIR, 'static')
