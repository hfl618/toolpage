import os

class Config:
    # --- 环境开关 ---
    # 'local': 使用本地 SQLite 文件 (debugging)
    # 'prod': 使用 Cloudflare D1 HTTP API
    ENV = os.getenv('FLASK_ENV', 'local') 

    # --- Cloudflare D1 配置 (Prod) ---
    CF_ACCOUNT_ID = "086001d6706e622db6e36d54236a02be"
    CF_DATABASE_ID = "32ee2a66-2503-4c4c-9772-2773d6776b33"
    CF_API_TOKEN = "7_X4Q-377777777777777777777777777777" # 示例Token，请替换为您的真实Token

    # --- 本地数据库配置 (Local) ---
    LOCAL_DB_PATH = "local_debug.sqlite"

    # --- 认证与安全 ---
    # 用于签发 JWT 的密钥，生产环境请务必修改！
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key-change-me')
    
    # Cookie 设置
    COOKIE_DOMAIN = ".618002.xyz" if ENV == 'prod' else None
    COOKIE_SECURE = True if ENV == 'prod' else False
    
    # JWT 过期时间 (秒)
    JWT_EXP_DELTA = 60 * 60 * 24 * 7  # 7天

    # --- 网关安全校验 ---
    GATEWAY_SECRET = os.getenv('GATEWAY_SECRET', 'local-dev-gateway-secret-123')

    # --- Cloudflare R2 配置 (Prod) ---
    R2_ACCESS_KEY = os.getenv('R2_ACCESS_KEY', 'a26ae6eb8acf2e04778b34eb8d529af9')
    R2_SECRET_KEY = os.getenv('R2_SECRET_KEY', '091fc08f8d4e4288a4703f719d2ca39141cabb3456fbd689d36169c13797a2f3')
    R2_ENDPOINT = os.getenv('R2_ENDPOINT', 'https://1473d81a1c18df1443cbaa3adf41da73.r2.cloudflarestorage.com')
    R2_BUCKET = os.getenv('R2_BUCKET', 'inventory-assets')
    R2_PUBLIC_URL = os.getenv('R2_PUBLIC_URL', 'https://pub-1f8bb9b02a224c45920856332170406e.r2.dev')
