import sqlite3
import requests
import urllib3
import os
from .config import Config

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class Database:
    def __init__(self):
        self.env = Config.ENV
        if self.env == 'local':
            self.init_local_db()
        else:
            self.url = f"https://api.cloudflare.com/client/v4/accounts/{Config.CF_ACCOUNT_ID}/d1/database/{Config.CF_DATABASE_ID}/query"
            self.headers = {"Authorization": f"Bearer {Config.CF_API_TOKEN}", "Content-Type": "application/json"}

    def init_local_db(self):
        # 保持本地 SQLite 结构同步
        schema = """
        CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password_hash TEXT, role TEXT DEFAULT 'free', avatar TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS tool_configs (
            path TEXT PRIMARY KEY, 
            is_public INTEGER DEFAULT 0, 
            required_role TEXT DEFAULT 'user', 
            limit_type TEXT DEFAULT 'request', 
            daily_limit_free INTEGER DEFAULT 10, 
            daily_limit_pro INTEGER DEFAULT 1000,
            shadow TEXT,
            label TEXT,
            color TEXT
        );
        CREATE TABLE IF NOT EXISTS usage_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, path TEXT, status INTEGER DEFAULT 200, request_date DATE DEFAULT (DATE('now')), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS components (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, category TEXT, name TEXT, model TEXT, package TEXT, quantity INTEGER, unit TEXT, price REAL, supplier TEXT, channel TEXT, location TEXT, buy_time TEXT, remark TEXT, creator TEXT, img_path TEXT, doc_path TEXT, qrcode_path TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
        
        -- 新增：元器件多文档支持
        CREATE TABLE IF NOT EXISTS component_docs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            component_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            file_name TEXT NOT NULL,
            file_url TEXT NOT NULL,
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
        with sqlite3.connect(Config.LOCAL_DB_PATH) as conn: 
            conn.executescript(schema)
            # 插入默认配置
            default_configs = [
                ('/inventory', 1, 'user', 'storage', 500, 5000, 'shadow-blue-200', '元器件管理', 'bg-blue-500'),
                ('/lvgl_image', 1, 'user', 'request', 20, 200, 'shadow-emerald-200', 'LVGL 图像处理', 'bg-emerald-500'),
                ('/serial', 1, 'user', 'request', 100, 1000, 'shadow-indigo-200', '云端串口调试', 'bg-indigo-500')
            ]
            for cfg in default_configs:
                conn.execute("INSERT OR IGNORE INTO tool_configs (path, is_public, required_role, limit_type, daily_limit_free, daily_limit_pro, shadow, label, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", cfg)
            conn.commit()

    def execute_multi(self, queries):
        """
        真正的批量查询：一次请求返回多个结果集。
        queries: [(sql, params), (sql, params), ...]
        """
        if self.env == 'local':
            results = []
            with sqlite3.connect(Config.LOCAL_DB_PATH) as conn:
                conn.row_factory = sqlite3.Row
                for sql, params in queries:
                    res = conn.execute(sql, params or []).fetchall()
                    results.append({'success': True, 'results': [dict(r) for r in res]})
                conn.commit()
            return results
        else:
            # 构造 D1 批量请求体
            payload = [{"sql": sql, "params": params or []} for sql, params in queries]
            try:
                resp = requests.post(self.url, headers=self.headers, json=payload, timeout=20, verify=False, proxies={"http": None, "https": None})
                data = resp.json()
                if data.get('success'):
                    # D1 批量查询会返回一个数组，每个元素包含 {success: true, results: [...]}
                    # 增加打印以确认结构
                    # print(f"D1 Batch Result: {data['result']}")
                    return data['result']
                print(f"D1 Batch Error: {resp.text}")
                return [{'success': False, 'results': [], 'error': 'Batch failed'}] * len(queries)
            except Exception as e:
                print(f"D1 Batch Exception: {e}")
                return [{'success': False, 'results': [], 'error': str(e)}] * len(queries)

    def execute(self, sql, params=None):
        if self.env == 'local': return self._execute_local(sql, params)
        else: return self._execute_d1(sql, params)

    def execute_batch(self, batch_data):
        """修复版：使用长连接复用，规避 D1 7400 格式错误"""
        if self.env == 'local':
            with sqlite3.connect(Config.LOCAL_DB_PATH) as conn:
                for sql, params in batch_data: conn.execute(sql, params or [])
                conn.commit()
            return {'success': True}
        else:
            session = requests.Session()
            session.headers.update(self.headers)
            try:
                for sql, params in batch_data:
                    resp = session.post(self.url, json={"sql": sql, "params": params or []}, timeout=20, verify=False, proxies={"http": None, "https": None})
                    if not resp.json().get('success'): print(f"⚠️ [DB] Batch item fail: {resp.text}")
                return {'success': True}
            except Exception as e: return {'success': False, 'error': str(e)}
            finally: session.close()

    def _execute_local(self, sql, params):
        with sqlite3.connect(Config.LOCAL_DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            res = conn.execute(sql, params or []).fetchall()
            conn.commit()
            return {'success': True, 'results': [dict(r) for r in res]}

    def _execute_d1(self, sql, params):
        try:
            resp = requests.post(self.url, headers=self.headers, json={"sql": sql, "params": params or []}, timeout=3, verify=False, proxies={"http": None, "https": None})
            data = resp.json()
            return data['result'][0] if data.get('success') else None
        except: return None

d1 = Database()