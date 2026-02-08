import sqlite3
import os

def generate_report():
    # 自动识别根目录下的数据库
    db_path = '../local_debug.sqlite'
    if not os.path.exists(db_path):
        # 尝试当前目录
        db_path = 'local_debug.sqlite'
        
    print(f"📖 Reading: {os.path.abspath(db_path)}")
    
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        html = """
        <html><head><meta charset='utf-8'><title>DB Debug Report</title>
        <style>
            body { font-family: sans-serif; padding: 40px; background: #f4f7f6; }
            h2 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 40px; background: white; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
            th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
            th { background-color: #3498db; color: white; }
            tr:nth-child(even) { background-color: #f9f9f9; }
        </style></head><body>
        """

        # 遍历所有表
        tables = cursor.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        for t in tables:
            t_name = t['name']
            if t_name == 'sqlite_sequence': continue
            
            html += f"<h2>Table: {t_name}</h2><table><thead><tr>"
            
            # 获取列名
            data = cursor.execute(f"SELECT * FROM {t_name}").fetchall()
            if data:
                columns = data[0].keys()
                for col in columns: html += f"<th>{col}</th>"
                html += "</tr></thead><tbody>"
                for row in data:
                    html += "<tr>"
                    for cell in row: html += f"<td>{cell}</td>"
                    html += "</tr>"
            else:
                html += "<th>(Empty Table)</th></tr></thead><tbody>"
            
            html += "</tbody></table>"

        html += "</body></html>"
        
        report_file = "db_report.html"
        with open(report_file, "w", encoding="utf-8") as f:
            f.write(html)
            
        print(f"✅ Success! Report generated: {os.path.abspath(report_file)}")
        print("👉 Just double-click 'db_report.html' to view your data in Chrome/Edge.")
        
        conn.close()
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    generate_report()
