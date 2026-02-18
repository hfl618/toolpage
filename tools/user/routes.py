import datetime
import jwt
import time
import os
from flask import Blueprint, request, jsonify, make_response, render_template, send_from_directory, redirect
from werkzeug.security import generate_password_hash, check_password_hash
from tools.database import d1
from tools.config import Config
from tools.r2_client import upload_to_r2

# 获取项目根目录下的 frontend 路径
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FRONTEND_DIR = os.path.join(BASE_DIR, 'frontend')

user_bp = Blueprint('user', __name__)

from functools import lru_cache

# --- 1. 性能优化：缓存高频配置 (5分钟有效期模拟) ---
@lru_cache(maxsize=128)
def get_cached_tool_config(path, role):
    """
    缓存工具限额配置，减少数据库读取压力
    注意：在真实生产中，如果配置更改需清除缓存或使用 Redis
    """
    res = d1.execute("SELECT * FROM tool_configs WHERE path = ?", [path])
    cfg = res.get('results', [])[0] if res and res.get('results') else None
    if not cfg: return None
    
    limit = cfg['daily_limit_pro'] if role == 'pro' else cfg['daily_limit_free']
    return {
        "limit": limit,
        "label": cfg.get('label', path),
        "color": cfg.get('color', 'bg-blue-500'),
        "limit_type": cfg['limit_type']
    }

# --- 辅助工具：获取当前登录 UID ---
def get_uid_from_request():
    uid = request.headers.get('X-User-Id')
    if uid: return uid
    token = request.cookies.get('auth_token')
    if token:
        try:
            payload = jwt.decode(token, Config.SECRET_KEY, algorithms=["HS256"])
            return str(payload.get('uid'))
        except: pass
    return None

# ==========================================
# 🔐 身份验证 API (仅保留逻辑接口)
# ==========================================

@user_bp.route('/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    if not username or not password: return jsonify({"error": "请输入账号密码"}), 400

    sql = "SELECT id, username, password_hash, role, avatar FROM users WHERE username = ?"
    res = d1.execute(sql, [username])
    user = res['results'][0] if res and res.get('results') else None

    if user:
        if check_password_hash(user['password_hash'], password) or user['password_hash'] == password:
            if not user['password_hash'].startswith('pbkdf2:sha256:'):
                d1.execute("UPDATE users SET password_hash = ? WHERE id = ?", [generate_password_hash(password), user['id']])
            
            payload = {
                "uid": user['id'],
                "username": user['username'],
                "role": user.get('role', 'free'),
                "avatar": user.get('avatar') or '',
                "exp": datetime.datetime.utcnow() + datetime.timedelta(seconds=Config.JWT_EXP_DELTA)
            }
            token = jwt.encode(payload, Config.SECRET_KEY, algorithm="HS256")
            resp = make_response(jsonify({"success": True, "msg": "登录成功"}))
            
            # --- 🛡️ Cookie 核心加固 ---
            resp.set_cookie(
                'auth_token', 
                token, 
                httponly=True,           # ❌ JS 无法读取，防御 XSS
                secure=True,             # ✅ 仅限 HTTPS 传输
                samesite='Lax',          # 🛡️ 防御 CSRF 跨站请求
                max_age=Config.JWT_EXP_DELTA,
                path='/'
            )
            return resp
    return jsonify({"error": "用户名或密码错误"}), 401

@user_bp.route('/register', methods=['POST'])
def register():
    import re
    data = request.json
    u, p = data.get('username', '').strip(), data.get('password', '')
    
    if not u or not p: return jsonify({"error": "账号密码不能为空"}), 400
    if not re.match(r'^(?!\d+$)[a-zA-Z0-9_]{4,20}$', u):
        return jsonify({"error": "用户名需4位以上字母/数字/下划线组合，且不能为纯数字"}), 400
    if len(p) < 6:
        return jsonify({"error": "密码长度不能少于 6 位"}), 400

    try:
        check = d1.execute("SELECT id FROM users WHERE username = ?", [u])
        if check and check.get('results'): return jsonify({"error": "用户名已被占用"}), 409
        d1.execute("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)", [u, generate_password_hash(p), 'free'])
        return jsonify({"success": True})
    except Exception as e: return jsonify({"error": str(e)}), 500

@user_bp.route('/update_profile', methods=['POST'])
def update_profile():
    import re
    uid = get_uid_from_request()
    if not uid: return jsonify(success=False, error="Unauthorized"), 401
    data = request.json
    new_u, new_p = data.get('username', '').strip(), data.get('password', '')
    fields, params = [], []
    
    if new_u:
        if not re.match(r'^(?!\d+$)[a-zA-Z0-9_]{4,20}$', new_u):
            return jsonify(success=False, error="用户名需4位以上字母/数字/下划线组合，且不能为纯数字"), 400
        exists = d1.execute("SELECT id FROM users WHERE username = ? AND id != ?", [new_u, uid]);
        if exists and exists.get('results'): return jsonify(success=False, error="用户名已存在"), 400
        fields.append("username = ?"); params.append(new_u)
    
    if new_p:
        if len(new_p) < 6: return jsonify(success=False, error="密码至少 6 位"), 400
        fields.append("password_hash = ?"); params.append(generate_password_hash(new_p))
    
    if not fields: return jsonify(success=False, error="无修改内容")
    params.append(uid)
    d1.execute(f"UPDATE users SET {', '.join(fields)} WHERE id = ?", params)
    return jsonify(success=True)

@user_bp.route('/upload_avatar', methods=['POST'])
def upload_avatar():
    uid = get_uid_from_request()
    file = request.files.get('file')
    if not uid or not file: return jsonify(success=False), 400
    url = upload_to_r2(file, "avatars", fixed_name=f"avatar_{uid}", app_name="users")
    if url:
        d1.execute("UPDATE users SET avatar = ? WHERE id = ?", [url, uid])
        return jsonify(success=True, url=url)
    return jsonify(success=False), 500

@user_bp.route('/profile_api')
def profile_api():
    uid = get_uid_from_request()
    if not uid: return jsonify(success=False, error="Unauthorized"), 401
    
    from_arg = request.args.get('from', '')
    referrer = request.referrer or ''
    from_path = ''
    source = from_arg if from_arg else referrer
    
    if 'inventory' in source: from_path = '/inventory'
    elif 'lvgl_image' in source: from_path = '/lvgl_image'
    elif 'projects' in source: from_path = '/projects'
    
    try:
        user_res = d1.execute("SELECT username, role, avatar, created_at FROM users WHERE id = ?", [uid])
        u = user_res['results'][0] if user_res and user_res.get('results') else {}
        if not u: return jsonify(success=False, error="User not found"), 404
        
        role = u.get('role', 'free')
        
        # 1. 获取工具配置与配额统计 (GROUP BY 优化)
        if from_path:
            config_res = d1.execute("SELECT * FROM tool_configs WHERE path = ?", [from_path])
        else:
            config_res = d1.execute("SELECT * FROM tool_configs WHERE is_public = 1")
        configs = config_res.get('results', []) if config_res else []

        usage_res = d1.execute("SELECT path, COUNT(*) as cnt FROM usage_logs WHERE user_id = ? AND request_date = DATE('now') GROUP BY path", [uid])
        usage_map = {item['path']: item['cnt'] for item in usage_res.get('results', [])} if usage_res else {}

        quotas = []
        for cfg in configs:
            path = cfg['path']
            limit = cfg['daily_limit_pro'] if role == 'pro' else cfg['daily_limit_free']
            used = 0
            if path == '/inventory':
                c_res = d1.execute("SELECT COUNT(*) as count FROM components WHERE user_id = ?", [uid])
                used = c_res['results'][0]['count'] if c_res and c_res.get('results') else 0
                unit = "个"
            else:
                used = sum(count for p, count in usage_map.items() if p.startswith(path))
                unit = "次"
            
            quotas.append({
                "path": path, "label": cfg.get('label', path), "shadow": cfg.get('shadow', 'shadow-blue-200'),
                "color": cfg.get('color', 'bg-blue-500'), "used": used, "limit": limit, "unit": unit, "type": cfg['limit_type']
            })

        # 2. 统计入驻天数与总调用量
        days = 1
        if u.get('created_at'):
            from datetime import datetime
            try: delta = datetime.utcnow() - datetime.strptime(u['created_at'][:10], '%Y-%m-%d'); days = max(1, delta.days)
            except: pass
            
        total_api_res = d1.execute("SELECT COUNT(*) as count FROM usage_logs WHERE user_id = ?", [uid])
        total_calls = total_api_res['results'][0]['count'] if total_api_res else 0

        # 3. 动态记录：5 分钟去重逻辑
        tools_cfg_res = d1.execute("SELECT path, label FROM tool_configs")
        path_map = {cfg['path']: cfg['label'] for cfg in tools_cfg_res.get('results', [])} if tools_cfg_res else {}

        logs_res = d1.execute("SELECT path, created_at, status FROM usage_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50", [uid])
        activities = []
        raw_logs = logs_res.get('results', [])
        last_log = None
        from datetime import timedelta

        for log in raw_logs:
            try:
                curr_time = datetime.strptime(log['created_at'], '%Y-%m-%d %H:%M:%S')
                if last_log:
                    last_time = datetime.strptime(last_log['created_at'], '%Y-%m-%d %H:%M:%S')
                    if log['path'] == last_log['path'] and abs((last_time - curr_time).total_seconds()) < 300:
                        continue
                
                local_time = curr_time + timedelta(hours=8)
                p = log['path']
                display_name = '系统页面'
                if p == '/': display_name = '首页'
                else:
                    for t_path, t_label in path_map.items():
                        if p.startswith(t_path): display_name = t_label; break
                
                activities.append({
                    "text": f"访问了 {display_name}", 
                    "time": local_time.strftime('%H:%M'), 
                    "date": local_time.strftime('%m-%d'),
                    "icon": "ri-history-line", "bg": "bg-slate-50", "color": "text-slate-400"
                })
                last_log = log
                if len(activities) >= 20: break
            except: continue

        if not activities:
            activities = [{"text": "本地系统就绪", "time": "刚刚", "icon": "ri-check-double-line", "bg": "bg-green-50", "color": "text-green-600"}]

        return jsonify({
            "success": True,
            "user": {"username": u.get('username', 'User'), "role": role, "avatar": u.get('avatar', '')},
            "stats": { "days": days, "total_calls": total_calls },
            "quotas": quotas,
            "is_single": bool(from_path),
            "activities": activities
        })
    except Exception as e: return jsonify(success=False, error=str(e)), 500

@user_bp.route('/info')
def user_info():
    uid = get_uid_from_request()
    if not uid: return jsonify(user=None)
    res = d1.execute("SELECT username, role, avatar FROM users WHERE id = ?", [uid])
    if res and res.get('results'):
        u = res['results'][0]
        return jsonify(user={"uid": uid, "username": u['username'], "role": u['role'], "avatar": u['avatar']})
    return jsonify(user=None)

@user_bp.route('/logout')
def logout():
    resp = make_response(redirect('/login'))
    resp.set_cookie('auth_token', '', expires=0, path='/')
    return resp

import hmac
import hashlib

@user_bp.route('/webhook/payment', methods=['POST'])
def payment_webhook():
    """
    生产级：Lemon Squeezy 支付回调接口 (带签名校验)
    """
    # 1. 获取原始请求体和签名头
    raw_payload = request.get_data()
    signature = request.headers.get('X-Lsq-Signature')
    
    if not signature:
        return jsonify(success=False, error="Missing signature"), 401

    # 2. 验证签名 (HMAC-SHA256)
    secret = Config.LS_WEBHOOK_SECRET.encode('utf-8')
    digest = hmac.new(secret, raw_payload, hashlib.sha256).hexdigest()
    
    if not hmac.compare_digest(digest, signature):
        return jsonify(success=False, error="Invalid signature"), 401

    # 3. 签名验证成功，解析业务逻辑
    data = request.json
    event_name = data.get('meta', {}).get('event_name')
    
    # 支付成功或订阅成功事件
    if event_name in ['order_created', 'subscription_created']:
        # 尝试从自定义数据中提取 user_id
        custom_data = data.get('meta', {}).get('custom', {})
        uid = custom_data.get('user_id')
        
        if uid:
            try:
                # 🚀 执行升级
                d1.execute("UPDATE users SET role = 'pro' WHERE id = ?", [uid])
                # 记录日志或通知用户
                print(f"User {uid} upgraded via Lemon Squeezy.")
                return jsonify(success=True, message="Upgraded"), 200
            except Exception as e:
                return jsonify(success=False, error=str(e)), 500
                
    return jsonify(success=True), 200

@user_bp.route('/check_username')
def check_username():
    import re
    u = request.args.get('username', '').strip()
    if not u: return jsonify(status="empty", msg="")
    if len(u) < 4: return jsonify(status="error", msg="至少4位")
    if not re.match(r'^[a-zA-Z0-9_]+$', u): return jsonify(status="error", msg="仅限字母/数字/_")
    if u.isdigit(): return jsonify(status="error", msg="不能纯数字")
    
    try:
        res = d1.execute("SELECT id FROM users WHERE username = ?", [u])
        if res and res.get('results'):
            return jsonify(status="error", msg="已被占用")
        return jsonify(status="success", msg="可用")
    except:
        return jsonify(status="error", msg="检测失败")
