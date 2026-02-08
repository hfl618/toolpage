import os

class Config:
    # --- 环境开关 ---
    # 'local': 使用本地 SQLite 文件 (debugging)
    # 'prod': 使用 Cloudflare D1 HTTP API
    ENV = os.getenv('ENV', 'prod')

    # --- Cloudflare D1 配置 (Prod) ---
    CF_ACCOUNT_ID = os.getenv('CF_ACCOUNT_ID', "086001d6706e622db6e36d54236a02be")
    CF_DATABASE_ID = os.getenv('CF_DATABASE_ID', "32ee2a66-2503-4c4c-9772-2773d6776b33")
    CF_API_TOKEN = os.getenv('CF_API_TOKEN')

    # --- 本地数据库配置 (Local) ---
    LOCAL_DB_PATH = "local_debug.sqlite"

    # --- 认证与安全 ---
    # 用于签发 JWT 的密钥，生产环境请务必修改！
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key-change-me')
    
    # Cookie 设置
    COOKIE_DOMAIN = os.getenv('COOKIE_DOMAIN', ".618002.xyz" if ENV == 'prod' else None)
    COOKIE_SECURE = True if ENV == 'prod' else False
    
    # JWT 过期时间 (秒)
    JWT_EXP_DELTA = 60 * 60 * 24 * 7  # 7天

    # --- 网关安全校验 ---
    GATEWAY_SECRET = os.getenv('GATEWAY_SECRET', 'local-dev-gateway-secret-123')

    # --- Cloudflare R2 配置 (Prod) ---
    R2_ACCESS_KEY = os.getenv('R2_ACCESS_KEY')
    R2_SECRET_KEY = os.getenv('R2_SECRET_KEY')
    R2_ENDPOINT = os.getenv('R2_ENDPOINT')
    R2_BUCKET = os.getenv('R2_BUCKET', 'inventory-assets')
    R2_PUBLIC_URL = os.getenv('R2_PUBLIC_URL', 'https://pub-1f8bb9b02a224c45920856332170406e.r2.dev')
