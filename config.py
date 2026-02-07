import os

class Config:
    SECRET_KEY = '618002_pro_secret_2026'
    
    # Cloudflare D1 配置
    CF_ACCOUNT_ID = "1473d81a1c18df1443cbaa3adf41da73"
    CF_D1_DATABASE_ID = "09e84079-e114-4f23-93be-2c155f004376"
    CF_API_TOKEN = "R0DkjZtXtrtWx-q9R0FZ0x60R1wgHT-KwJfuhw4w"
    
    # 静态资源路径
    BASE_DIR = os.path.abspath(os.path.dirname(__file__))
    STATIC_FOLDER = os.path.join(BASE_DIR, 'static')