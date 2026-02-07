# tools/database.py
import requests
from config import Config

class D1Client:
    def __init__(self):
        self.url = f"https://api.cloudflare.com/client/v4/accounts/{Config.CF_ACCOUNT_ID}/d1/database/{Config.CF_D1_DATABASE_ID}/query"
        self.headers = {
            "Authorization": f"Bearer {Config.CF_API_TOKEN}",
            "Content-Type": "application/json"
        }

    def execute(self, sql, params=None):
        payload = {"sql": sql, "params": params or []}
        try:
            r = requests.post(self.url, headers=self.headers, json=payload, timeout=10)
            res = r.json()
            if res.get('success'):
                return res['result'][0]
            return None
        except Exception as e:
            print(f"D1 API Error: {e}")
            return None

# 初始化全局实例
d1 = D1Client()