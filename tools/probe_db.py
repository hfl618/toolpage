import sqlite3

def probe():
    db_file = 'local_debug.sqlite'
    print(f"Probing database: {db_file}")
    try:
        conn = sqlite3.connect(db_file)
        cursor = conn.cursor()
        
        # 获取所有表名
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        print(f"Tables found: {[t[0] for t in tables]}")
        
        for table in tables:
            t_name = table[0]
            cursor.execute(f"SELECT count(*) FROM {t_name}")
            count = cursor.fetchone()[0]
            print(f" - Table '{t_name}' has {count} rows.")
            
        conn.close()
    except Exception as e:
        print(f"Probe Error: {e}")

if __name__ == "__probe__":
    probe()

probe()
