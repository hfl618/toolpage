import requests
import urllib3
from config import Config

# 禁用 SSL 警告
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class D1Client:
    def __init__(self):
        self.url = f"https://api.cloudflare.com/client/v4/accounts/{Config.CF_ACCOUNT_ID}/d1/database/{Config.CF_D1_DATABASE_ID}/query"
        self.headers = {
            "Authorization": f"Bearer {Config.CF_API_TOKEN}",
            "Content-Type": "application/json"
        }

    def execute(self, sql, params=None):
        """执行 SQL 并返回结果"""
        payload = {
            "sql": sql,
            "params": params or []
        }
        try:
            # 允许走系统代理，并禁用 SSL 验证以绕过代理证书干扰
            response = requests.post(
                self.url, 
                headers=self.headers, 
                json=payload, 
                timeout=30,
                verify=False
            )
            result = response.json()
            if result.get('success'):
                return result['result'][0]
            else:
                print(f"D1 API Error: {result.get('errors')}")
                return None
        except Exception as e:
            print(f"D1 Connection Error: {e}")
            print("提示：如果报错中含有 ProxyError，请尝试关闭梯子或检查网络代理设置。")
            return None

# 全局单例
d1 = D1Client()
