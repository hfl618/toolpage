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

    url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/d1/database/{CF_D1_DATABASE_ID}/query"
    headers = {
        "Authorization": f"Bearer {CF_API_TOKEN}",
        "Content-Type": "application/json"
    }

    # 尝试执行一个最简单的查询
    res = requests.post(url, headers=headers, json={"sql": "SELECT 1"})

    if res.json().get('success'):
        print("✅ 恭喜！参数完全正确，已成功连通 D1 数据库！")
    else:
        print("❌ 连接失败，请检查 Token 权限或 ID 是否填错。")
        print(res.text)
import requests



