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
    img_file = request.files.get('image')
    
    if not content:
        return jsonify(success=False, error="内容不能为空"), 400
    
    visitor_id = get_visitor_id()
    img_url = ""
    
    if img_file:
        try:
            img_url = upload_to_r2(img_file, "bug_imgs", app_name="support")
        except: pass

    try:
        sql = "INSERT INTO bug_reports (user_id, page_url, content, device_info, img_path) VALUES (?, ?, ?, ?, ?)"
        d1.execute(sql, [visitor_id, page_url, content, device_info, img_url])
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
                table { width: 100%; border-collapse: collapse; background: white; border-radius: 12px; overflow: hidden; }
                th, td { padding: 15px; text-align: left; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
                th { background: #0f172a; color: white; }
                .screenshot { width: 80px; height: 60px; object-fit: cover; border-radius: 8px; cursor: pointer; border: 1px solid #eee; }
            </style>
        </head>
        <body>
            <h2>反馈详情列表</h2>
            <table>
                <tr><th>ID</th><th>时间</th><th>截图</th><th>内容</th><th>页面</th><th>用户</th></tr>
        """
        for item in items:
            img_html = f"<a href='{item['img_path']}' target='_blank'><img src='{item['img_path']}' class='screenshot'></a>" if item.get('img_path') else "<span style='color:#ccc'>无图</span>"
            html += f"<tr><td>{item['id']}</td><td>{item['created_at']}</td><td>{img_html}</td><td><b>{item['content']}</b></td><td><a href='{item['page_url']}' target='_blank'>查看页面</a></td><td>{item['user_id']}</td></tr>"
        
        html += "</table></body></html>"
        return html
    except Exception as e: return f"Error: {e}"
