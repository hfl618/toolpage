import os
import io
import uuid
import shutil
from flask import Blueprint, render_template, request, send_file, jsonify, current_app
from werkzeug.utils import secure_filename
from .lvgl_utils import LVGLImage, ColorFormat, OutputFormat, CompressMethod
from PIL import Image
from tools.database import d1
from datetime import datetime

lvgl_image_bp = Blueprint('lvgl_image', __name__, 
                          template_folder='templates', 
                          static_folder='static')

def get_visitor_id():
    """获取访问者 ID 和 角色"""
    uid = request.headers.get('X-User-Id')
    role = request.headers.get('X-User-Role', 'guest')
    if uid:
        return uid, True, role
    # 游客身份
    ip = request.headers.get('X-Forwarded-For', request.remote_addr)
    return f"guest_{ip.split(',')[0]}", False, 'guest'

@lvgl_image_bp.route('/')
def index():
    return render_template('lvgl_image.html')

def get_tool_config():
    """从数据库获取工具配置"""
    try:
        res = d1.execute("SELECT * FROM tool_configs WHERE path = '/lvgl_image'")
        if res and res.get('results'):
            return res['results'][0]
    except: pass
    return {"daily_limit_free": 5, "daily_limit_pro": 50, "is_public": 1} # 默认保底

@lvgl_image_bp.route('/usage')
def get_usage():
    visitor_id, is_logged_in, role = get_visitor_id()
    config = get_tool_config()
    
    # 确定限额逻辑
    if role == 'pro':
        limit = config.get('daily_limit_pro', 100)
    elif role == 'free':
        limit = config.get('daily_limit_free', 20)
    else: # guest
        # 游客额度设定为 free 用户额度的 1/4
        limit = config.get('daily_limit_free', 20) // 4 
    
    try:
        sql = "SELECT COUNT(*) as count FROM usage_logs WHERE user_id = ? AND path = '/lvgl_image/convert' AND request_date = DATE('now')"
        res = d1.execute(sql, [visitor_id])
        count = res['results'][0]['count'] if res and res.get('results') else 0
        return jsonify(success=True, is_logged_in=is_logged_in, role=role, remaining=max(0, limit - count), total=limit)
    except:
        return jsonify(success=False)

@lvgl_image_bp.route('/convert', methods=['POST'])
def convert():
    visitor_id, is_logged_in, role = get_visitor_id()
    config = get_tool_config()
    
    # 确定当前角色的限额
    if role == 'pro':
        limit = config.get('daily_limit_pro', 100)
    elif role == 'free':
        limit = config.get('daily_limit_free', 20)
    else:
        limit = config.get('daily_limit_free', 20) // 4
    
    # 统一拦截逻辑
    try:
        sql = "SELECT COUNT(*) as count FROM usage_logs WHERE user_id = ? AND path = '/lvgl_image/convert' AND request_date = DATE('now')"
        res = d1.execute(sql, [visitor_id])
        usage_count = res['results'][0]['count'] if res and res.get('results') else 0
        
        if usage_count >= limit:
            msg = "游客试用次数已用完，请登录后继续。" if role == 'guest' else "今日额度已用完。"
            return jsonify(success=False, error=msg), 403
    except: pass

    if 'file' not in request.files:
        return jsonify(success=False, error="未上传文件")
    
    file = request.files['file']
    if file.filename == '':
        return jsonify(success=False, error="未选择文件")
    
    # 允许的格式检查
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ['.png', '.jpg', '.jpeg', '.bmp']:
        return jsonify(success=False, error="暂不支持此格式，请上传 PNG, JPG 或 BMP")

    cf_str = request.form.get('cf', 'AUTO')
    ofmt_str = request.form.get('ofmt', 'C')
    compress_str = request.form.get('compress', 'NONE')
    dither = request.form.get('dither') == 'true'
    premultiply = request.form.get('premultiply') == 'true'
    target_w = request.form.get('target_w')
    target_h = request.form.get('target_h')
    lv_version = request.form.get('lv_version', 'v9')
    custom_name = request.form.get('output_name', '').strip()
    
    temp_base = os.path.join(os.getcwd(), 'temp_lvgl')
    if not os.path.exists(temp_base): os.makedirs(temp_base)
    
    task_id = str(uuid.uuid4())
    task_dir = os.path.join(temp_base, task_id)
    os.makedirs(task_dir)
    
    try:
        filename = secure_filename(file.filename)
        # 内部统一转为 .png 处理
        internal_filename = "source.png"
        input_path = os.path.join(task_dir, internal_filename)
        
        # 使用 Pillow 统一转换输入格式为 RGBA PNG
        with Image.open(file) as img_input:
            img_rgba = img_input.convert("RGBA")
            img_rgba.save(input_path, "PNG")

        # --- 缩放逻辑 ---
        if target_w or target_h:
            with Image.open(input_path) as img_obj:
                orig_w, orig_h = img_obj.size
                w = int(target_w) if target_w else int(orig_w * (int(target_h)/orig_h))
                h = int(target_h) if target_h else int(orig_h * (int(target_w)/orig_w))
                img_obj = img_obj.resize((w, h), Image.Resampling.LANCZOS)
                img_obj.save(input_path)

        cf = None if cf_str == "AUTO" else ColorFormat[cf_str]
        ofmt = OutputFormat.C_ARRAY if ofmt_str == 'C' else OutputFormat.BIN_FILE
        compress = CompressMethod[compress_str]
        
        img = LVGLImage().from_png(input_path, cf=cf, rgb565_dither=dither)
        if premultiply and img.cf.has_alpha:
            img.premultiply()
            
        # 确定输出文件名与变量名
        out_base_name = custom_name if custom_name else os.path.splitext(filename)[0]
        output_path = os.path.join(task_dir, f"out_{out_base_name}")
        
        if ofmt == OutputFormat.C_ARRAY:
            output_path += ".c"
            # 传递 outputname 参数，这将影响 C 文件内部的变量名
            img.to_c_array(output_path, compress=compress, outputname=out_base_name)
            
            # --- 版本兼容处理 ---
            if lv_version == 'v8':
                with open(output_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                # 替换 v9 的数据结构为 v8 的
                content = content.replace('lv_image_dsc_t', 'lv_img_dsc_t')
                content = content.replace('LV_COLOR_FORMAT_', 'LV_IMG_CF_TRUE_COLOR') # 简化处理
                with open(output_path, 'w', encoding='utf-8') as f:
                    f.write(content)
            
            download_name = out_base_name + ".c"
            mimetype = 'text/x-csrc'
        else:
            output_path += ".bin"
            img.to_bin(output_path, compress=compress)
            download_name = out_base_name + ".bin"
            mimetype = 'application/octet-stream'
            
        return_data = io.BytesIO()
        with open(output_path, 'rb') as f:
            return_data.write(f.read())
        return_data.seek(0)
        
        shutil.rmtree(task_dir)
        
        # 转换成功，记录日志
        try:
            d1.execute("INSERT INTO usage_logs (user_id, path, status) VALUES (?, ?, ?)", 
                       [visitor_id, '/lvgl_image/convert', 200])
        except: pass

        return send_file(return_data, as_attachment=True, download_name=download_name, mimetype=mimetype)
    
    except Exception as e:
        if os.path.exists(task_dir): shutil.rmtree(task_dir)
        return jsonify(success=False, error=str(e))
