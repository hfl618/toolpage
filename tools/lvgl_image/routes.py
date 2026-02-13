import os
import io
import uuid
import shutil
from flask import Blueprint, render_template, request, send_file, jsonify, current_app
from werkzeug.utils import secure_filename
from .lvgl_utils import LVGLImage, ColorFormat, OutputFormat, CompressMethod, RAWImage
from PIL import Image
from tools.database import d1
from datetime import datetime

lvgl_image_bp = Blueprint('lvgl_image', __name__, 
                          template_folder='templates', 
                          static_folder='static')

def get_visitor_id():
    uid = request.headers.get('X-User-Id')
    role = request.headers.get('X-User-Role', 'guest')
    if uid: return uid, True, role
    ip = request.headers.get('X-Forwarded-For', request.remote_addr)
    return f"guest_{ip.split(',')[0]}", False, 'guest'

def get_tool_config():
    try:
        res = d1.execute("SELECT * FROM tool_configs WHERE path = '/lvgl_image'")
        if res and res.get('results'): return res['results'][0]
    except: pass
    return {"daily_limit_free": 20, "daily_limit_pro": 200, "is_public": 1}

import os
import io
import uuid
import shutil
import glob
from flask import Blueprint, render_template, request, send_file, jsonify, current_app
# ... (其余导入保持不变)

@lvgl_image_bp.route('/')
def index():
    return render_template('lvgl_image.html')

@lvgl_image_bp.route('/usage')
def get_usage():
    vid, logged, role = get_visitor_id()
    config = get_tool_config()
    limit = config.get('daily_limit_pro', 200) if role == 'pro' else (config.get('daily_limit_free', 20) if logged else config.get('daily_limit_free', 20) // 4)
    try:
        res = d1.execute("SELECT COUNT(*) as count FROM usage_logs WHERE user_id = ? AND path = '/lvgl_image/convert' AND request_date = DATE('now')", [vid])
        count = res['results'][0]['count'] if res and res.get('results') else 0
        return jsonify(success=True, remaining=max(0, limit - count))
    except: return jsonify(success=False)

@lvgl_image_bp.route('/convert', methods=['POST'])
def convert():
    vid, logged, role = get_visitor_id()
    config = get_tool_config()
    limit = config.get('daily_limit_pro', 200) if role == 'pro' else (config.get('daily_limit_free', 20) if logged else config.get('daily_limit_free', 20) // 4)
    
    try:
        res = d1.execute("SELECT COUNT(*) as count FROM usage_logs WHERE user_id = ? AND path = '/lvgl_image/convert' AND request_date = DATE('now')", [vid])
        if res and res['results'][0]['count'] >= limit: return jsonify(success=False, error="Quota exceeded"), 403
    except: pass

    file = request.files.get('file')
    if not file: return jsonify(success=False, error="No file"), 400

    cf_str = request.form.get('cf', 'AUTO')
    ofmt_str = request.form.get('ofmt', 'C')
    compress_str = request.form.get('compress', 'NONE')
    stride_align = int(request.form.get('align', 1))
    bg_color = int(request.form.get('background', '#000000').replace('#', ''), 16)
    target_w, target_h = request.form.get('target_w'), request.form.get('target_h')
    lv_version = request.form.get('lv_version', 'v9')
    custom_name = request.form.get('output_name', '').strip()
    
    task_dir = os.path.join(os.getcwd(), 'temp_lvgl', str(uuid.uuid4()))
    os.makedirs(task_dir, exist_ok=True)
    
    try:
        cf = None if cf_str == "AUTO" else ColorFormat[cf_str]
        out_name = secure_filename(custom_name if custom_name else os.path.splitext(file.filename)[0]).replace('-', '_').replace(' ', '_')
        
        if cf in [ColorFormat.RAW, ColorFormat.RAW_ALPHA]:
            ipath = os.path.join(task_dir, secure_filename(file.filename))
            file.save(ipath)
            img = RAWImage().from_file(ipath, cf=cf)
            opath = os.path.join(task_dir, f"{out_name}.c")
            img.to_c_array(opath, outputname=out_name)
        else:
            ipath = os.path.join(task_dir, "src.png")
            with Image.open(file) as img_in:
                img_rgba = img_in.convert("RGBA")
                if target_w or target_h:
                    tw = int(target_w) if (target_w and target_w.strip()) else None
                    th = int(target_h) if (target_h and target_h.strip()) else None
                    w, h = (tw, th) if (tw and th) else ((tw, int(img_rgba.height*(tw/img_rgba.width))) if tw else (int(img_rgba.width*(th/img_rgba.height)), th))
                    img_rgba = img_rgba.resize((w, h), Image.Resampling.LANCZOS)
                img_rgba.save(ipath, "PNG")
            
            img = LVGLImage().from_png(ipath, cf=cf, background=bg_color, rgb565_dither=(request.form.get('dither')=='true'), nema_gfx=(request.form.get('nemagfx')=='true'))
            img.adjust_stride(align=stride_align)
            if request.form.get('premultiply')=='true' and img.cf.has_alpha: img.premultiply()
            
            opath = os.path.join(task_dir, f"out_{out_name}")
            if ofmt_str == 'C':
                opath += ".c"
                img.to_c_array(opath, compress=CompressMethod[compress_str], outputname=out_name)
                if lv_version == 'v8':
                    with open(opath, 'r', encoding='utf-8') as f: content = f.read().replace('lv_image_dsc_t', 'lv_img_dsc_t').replace('LV_COLOR_FORMAT_', 'LV_IMG_CF_TRUE_COLOR')
                    with open(opath, 'w', encoding='utf-8') as f: f.write(content)
            else:
                opath += ".bin"
                img.to_bin(opath, compress=CompressMethod[compress_str])

        with open(opath, 'rb') as f: data = f.read()
        shutil.rmtree(task_dir)
        d1.execute("INSERT INTO usage_logs (user_id, path, status) VALUES (?, ?, ?)", [vid, '/lvgl_image/convert', 200])
        return send_file(io.BytesIO(data), as_attachment=True, download_name=os.path.basename(opath))
    except Exception as e:
        if os.path.exists(task_dir): shutil.rmtree(task_dir)
        return jsonify(success=False, error=str(e)), 500
