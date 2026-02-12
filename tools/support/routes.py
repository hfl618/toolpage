from flask import Blueprint, request, jsonify
from tools.database import d1
from tools.r2_client import upload_to_r2

support_bp = Blueprint('support', __name__)

def get_visitor_id():
    uid = request.headers.get('X-User-Id')
    if uid: return uid
    ip = request.headers.get('X-Forwarded-For', request.remote_addr)
    return f"guest_{ip.split(',')[0]}"

@support_bp.route('/report_bug', methods=['POST'])
def report_bug():
    content = request.form.get('content')
    page_url = request.form.get('page_url')
    device_info = request.form.get('device_info', '')
    img_files = request.files.getlist('image')
    
    if not content:
        return jsonify(success=False, error="内容不能为空"), 400
    
    visitor_id = get_visitor_id()
    img_urls = []
    
    if img_files:
        for f in img_files:
            if f.filename:
                try:
                    url = upload_to_r2(f, "bug_imgs", app_name="support")
                    if url: img_urls.append(url)
                except: pass

    img_path_str = ",".join(img_urls)

    try:
        sql = "INSERT INTO bug_reports (user_id, page_url, content, device_info, img_path) VALUES (?, ?, ?, ?, ?)"
        d1.execute(sql, [visitor_id, page_url, content, device_info, img_path_str])
        return jsonify(success=True, message="感谢您的反馈！")
    except Exception as e:
        return jsonify(success=False, error=str(e)), 500

@support_bp.route('/reports')
def view_reports():
    # 暂时注释掉权限检查
    # role = request.headers.get('X-User-Role', '').lower()
    # if role != 'admin': return "权限不足", 403
    
    try:
        res = d1.execute("SELECT * FROM bug_reports ORDER BY created_at DESC")
        items = res.get('results', [])
        
        html = """
        <html>
        <head>
            <title>Bug 看板</title>
            <style>
                body { font-family: sans-serif; padding: 40px; background: #f8fafc; }
                table { width: 100%; border-collapse: collapse; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
                th, td { padding: 15px; text-align: left; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
                th { background: #0f172a; color: white; }
                .screenshot-group { display: flex; gap: 4px; flex-wrap: wrap; }
                .screenshot { width: 50px; height: 50px; object-fit: cover; border-radius: 6px; cursor: pointer; border: 1px solid #eee; transition: transform 0.2s; }
                .screenshot:hover { transform: scale(1.1); }
            </style>
        </head>
        <body>
            <div style="max-width: 1200px; margin: 0 auto;">
                <h2 style="font-weight: 800; color: #0f172a; margin-bottom: 24px;">Bug 反馈看板</h2>
                <table>
                    <tr><th>ID</th><th>时间</th><th>截图 (点击预览)</th><th>反馈内容</th><th>来源页面</th><th>用户 ID</th></tr>
        """
        for item in items:
            img_html = ""
            if item.get('img_path'):
                urls = item['img_path'].split(',')
                img_html = '<div class="screenshot-group">'
                for u in urls:
                    if u: img_html += f"<a href='{u}' target='_blank'><img src='{u}' class='screenshot'></a>"
                img_html += '</div>'
            else:
                img_html = "<span style='color:#ccc'>无图</span>"
            
            html += f"<tr><td>{item['id']}</td><td>{item['created_at']}</td><td>{img_html}</td><td><div style='max-width:300px; word-break:break-all;'>{item['content']}</div></td><td><a href='{item['page_url']}' target='_blank' style='color:#3b82f6; text-decoration:none;'>🔗 访问</a></td><td><code style='background:#f1f5f9; padding:2px 6px; border-radius:4px;'>{item['user_id']}</code></td></tr>"
        
        html += "</table></div></body></html>"
        return html
    except Exception as e: return f"Error: {e}"
