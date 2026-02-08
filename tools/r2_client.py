import boto3
from botocore.config import Config as BotoConfig
from datetime import datetime
import io
from tools.config import Config

# R2 配置信息 (从 Config 动态加载)
def get_s3_client():
    access_key = Config.R2_ACCESS_KEY
    secret_key = Config.R2_SECRET_KEY
    endpoint = Config.R2_ENDPOINT
    
    if not all([access_key, secret_key, endpoint]):
        print(f"⚠️ [R2] Missing credentials: KEY={bool(access_key)}, SECRET={bool(secret_key)}, ENDPOINT={bool(endpoint)}")
        return None

    return boto3.client(
        service_name='s3',
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name='auto',
        config=BotoConfig(
            signature_version='s3v4',
            proxies={}
        ),
        verify=False
    )

def get_content_type(ext):
    types = {
        'pdf': 'application/pdf',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'svg': 'image/svg+xml',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'csv': 'text/csv'
    }
    return types.get(ext, 'application/octet-stream')

# 全局单例，但在使用时检查
_s3_client = None

def upload_to_r2(file_obj, folder, prefix="file", fixed_name=None, app_name="unsorted"):
    global _s3_client
    if _s3_client is None:
        _s3_client = get_s3_client()
    
    if not _s3_client:
        print("❌ [R2] Cannot upload: S3 client not initialized")
        return ""
    
    if not file_obj: return ""
    
    # ... 后续逻辑保持不变 ...

    
    # 1. 自动处理后缀
    ext = "png"
    if hasattr(file_obj, 'filename') and file_obj.filename:
        ext = file_obj.filename.rsplit('.', 1)[-1].lower()
    elif hasattr(file_obj, 'getvalue'):
        # 检查是否是 SVG (qrcode 生成的)
        content_start = file_obj.getvalue()[:100].decode('utf-8', errors='ignore')
        if '<svg' in content_start: ext = "svg"
    
    # 2. 生成文件名 (路径结构: app_name/folder/filename)
    if fixed_name:
        filename = f"{app_name}/{folder}/{fixed_name}.{ext}"
    else:
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
        filename = f"{app_name}/{folder}/{prefix}_{timestamp}.{ext}"
    
    try:
        # 3. 上传到 R2
        content_type = get_content_type(ext)
        bucket = Config.R2_BUCKET
        if hasattr(file_obj, 'read'):
            _s3_client.upload_fileobj(file_obj, bucket, filename, ExtraArgs={'ContentType': content_type})
        else:
            _s3_client.put_object(Body=file_obj, Bucket=bucket, Key=filename, ContentType=content_type)
            
        return f"{Config.R2_PUBLIC_URL}/{filename}"
    except Exception as e:
        print(f"上传 {folder} 失败: {e}")
        return ""

def delete_from_r2(url):
    """根据 URL 删除 R2 上的文件"""
    global _s3_client
    if _s3_client is None: _s3_client = get_s3_client()
    if not _s3_client or not url or Config.R2_PUBLIC_URL not in url:
        return
    try:
        key = url.replace(f"{Config.R2_PUBLIC_URL}/", "")
        _s3_client.delete_object(Bucket=Config.R2_BUCKET, Key=key)
    except Exception as e:
        print(f"删除 R2 文件失败: {e}")