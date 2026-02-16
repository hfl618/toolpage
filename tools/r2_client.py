import boto3
from botocore.config import Config as BotoConfig
from datetime import datetime
import io
import os
from tools.config import Config

# R2 配置信息
def get_s3_client():
    access_key = Config.R2_ACCESS_KEY
    secret_key = Config.R2_SECRET_KEY
    endpoint = Config.R2_ENDPOINT
    
    if not all([access_key, secret_key, endpoint]):
        return None

    # 这里的配置必须与您上传头像成功的配置完全一致
    return boto3.client(
        service_name='s3',
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name='auto',
        verify=False
    )

def get_content_type(ext):
    types = {
        'bin': 'application/octet-stream',
        'pdf': 'application/pdf',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'json': 'application/json'
    }
    return types.get(ext, 'application/octet-stream')

_s3_client = None

def upload_to_r2(file_obj, folder, prefix="file", fixed_name=None, app_name="unsorted"):
    global _s3_client
    if _s3_client is None:
        _s3_client = get_s3_client()
    
    if not _s3_client:
        return ""
    
    if not file_obj: return ""
    
    # 处理后缀
    ext = "bin"
    if hasattr(file_obj, 'filename') and file_obj.filename:
        ext = file_obj.filename.rsplit('.', 1)[-1].lower()
    
    # 生成文件名
    if fixed_name:
        filename = f"{app_name}/{folder}/{fixed_name}.{ext}"
    else:
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
        filename = f"{app_name}/{folder}/{prefix}_{timestamp}.{ext}"
    
    try:
        content_type = get_content_type(ext)
        bucket = Config.R2_BUCKET
        
        # 针对大文件使用 upload_fileobj 提高稳定性
        if hasattr(file_obj, 'seek'):
            file_obj.seek(0)
            
        _s3_client.upload_fileobj(
            file_obj, 
            bucket, 
            filename, 
            ExtraArgs={'ContentType': content_type}
        )
            
        print(f"✨ [R2] Upload Success: {filename}")
        return f"{Config.R2_PUBLIC_URL}/{filename}"
    except Exception as e:
        print(f"❌ [R2] Upload Failed: {e}")
        return ""

def delete_from_r2(url):
    global _s3_client
    if _s3_client is None: _s3_client = get_s3_client()
    if not _s3_client or not url: return
    
    try:
        # 兼容处理：无论 URL 是 pub-xxx.r2.dev 还是 hhhtool.cc.cd
        # 只要提取 /ota/ 之后的部分即可拿到 Key
        if "/ota/" in url:
            key = "ota/" + url.split("/ota/")[1]
            _s3_client.delete_object(Bucket=Config.R2_BUCKET, Key=key)
            print(f"🗑️ [R2] Deleted: {key}")
    except Exception as e:
        print(f"删除 R2 失败: {e}")

def get_json_from_r2(key):
    """从 R2 读取并解析 JSON"""
    global _s3_client
    import json
    if _s3_client is None: _s3_client = get_s3_client()
    if not _s3_client: return None
    try:
        resp = _s3_client.get_object(Bucket=Config.R2_BUCKET, Key=key)
        return json.loads(resp['Body'].read().decode('utf-8'))
    except Exception:
        return None

def put_json_to_r2(key, data):
    """将字典对象作为 JSON 上传到 R2"""
    global _s3_client
    import json
    if _s3_client is None: _s3_client = get_s3_client()
    if not _s3_client: return False
    try:
        _s3_client.put_object(
            Body=json.dumps(data, ensure_ascii=False, indent=2),
            Bucket=Config.R2_BUCKET,
            Key=key,
            ContentType="application/json"
        )
        return True
    except Exception as e:
        print(f"写入 R2 JSON 失败 [{key}]: {e}")
        return False
