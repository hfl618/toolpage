import sqlite3
import requests
import urllib3
import os
from .config import Config

# 禁用 SSL 警告
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class Database:
    def __init__(self):
        self.env = Config.ENV
        if self.env == 'local':
            print(f"🔧 [DB] Running in LOCAL mode. DB Path: {Config.LOCAL_DB_PATH}")
            self.init_local_db()
        else:
            print(f"☁️ [DB] Running in PROD mode. Target: D1 ({Config.CF_DATABASE_ID})")
            self.url = f"https://api.cloudflare.com/client/v4/accounts/{Config.CF_ACCOUNT_ID}/d1/database/{Config.CF_DATABASE_ID}/query"
            self.headers = {
                "Authorization": f"Bearer {Config.CF_API_TOKEN}",
                "Content-Type": "application/json"
            }

    def init_local_db(self):
        """本地模式下初始化 SQLite 表结构"""
        # 1. 用户表 (身份中心)
        # 2. 工具配置表 (路由与规则中心)
        # 3. 使用日志表 (API调用流水)
        schema = """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL, 
            role TEXT DEFAULT 'free',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS tool_configs (
            path TEXT PRIMARY KEY,
            is_public INTEGER DEFAULT 0,
            required_role TEXT DEFAULT 'user',
            limit_type TEXT DEFAULT 'request', 
            daily_limit_free INTEGER DEFAULT 10,
            daily_limit_pro INTEGER DEFAULT 1000
        );

        CREATE TABLE IF NOT EXISTS usage_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            path TEXT NOT NULL,
            status INTEGER DEFAULT 200,
            request_date DATE DEFAULT (DATE('now')), 
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        -- 以及 Inventory 原有的 components 表
        CREATE TABLE IF NOT EXISTS components (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            category TEXT,
            name TEXT,
            model TEXT,
            package TEXT,
            quantity INTEGER,
            unit TEXT,
            price REAL,
            supplier TEXT,
            channel TEXT,
            location TEXT,
            buy_time TEXT,
            remark TEXT,
            creator TEXT,
            img_path TEXT,
            doc_path TEXT,
            qrcode_path TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- 新增：Project Hub 项目表
        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            status TEXT DEFAULT '进行中',
            description TEXT,
            cover_img TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """
        try:
            with sqlite3.connect(Config.LOCAL_DB_PATH) as conn:
                conn.executescript(schema)
                
                # 【自动迁移补丁】
                try:
                    conn.execute("ALTER TABLE components ADD COLUMN user_id INTEGER")
                except: pass
                
                # 初始化示例配置
                conn.execute("INSERT OR IGNORE INTO tool_configs (path, is_public, required_role, limit_type, daily_limit_free) VALUES ('/api/inventory/add', 0, 'user', 'storage', 0)")
                conn.execute("INSERT OR IGNORE INTO tool_configs (path, is_public, required_role, limit_type, daily_limit_free) VALUES ('/api/ai/analyze', 0, 'user', 'request', 5)")
                conn.execute("INSERT OR IGNORE INTO tool_configs (path, is_public, required_role, limit_type, daily_limit_free) VALUES ('/api/public/status', 1, 'none', 'none', 0)")
        except Exception as e:
            print(f"❌ [DB] Local DB Init Failed: {e}")

    def execute(self, sql, params=None):
        """统一执行入口"""
        if self.env == 'local':
            return self._execute_local(sql, params)
        else:
            return self._execute_d1(sql, params)

    def _execute_local(self, sql, params):
        try:
            with sqlite3.connect(Config.LOCAL_DB_PATH) as conn:
                conn.row_factory = sqlite3.Row # 让结果像字典一样访问
                cursor = conn.cursor()
                cursor.execute(sql, params or [])
                rows = cursor.fetchall()
                conn.commit()
                
                # 模拟 D1 的返回格式 {'results': [...]}
                results = [dict(row) for row in rows]
                return {'success': True, 'results': results}
        except Exception as e:
            print(f"❌ [DB] Local Query Error: {e}")
            return {'success': False, 'error': str(e)}

    def _execute_d1(self, sql, params):
        payload = {
            "sql": sql,
            "params": params or []
        }
        try:
            response = requests.post(
                self.url, 
                headers=self.headers, 
                json=payload, 
                timeout=30,
                verify=False
            )
            result = response.json()
            if result.get('success'):
                # D1 返回格式通常是 { result: [ { results: [...] } ] }
                return result['result'][0]
            else:
                print(f"❌ [DB] D1 API Error: {result.get('errors')}")
                return None
        except Exception as e:
            print(f"❌ [DB] Connection Error: {e}")
            return None

# 全局单例
d1 = Database()
