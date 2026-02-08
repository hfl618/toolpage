import boto3
from botocore.config import Config as BotoConfig
from datetime import datetime
import io

# R2 配置信息 (从 Config 动态加载)
R2_CONFIG = {
    "access_key": Config.R2_ACCESS_KEY,
    "secret_key": Config.R2_SECRET_KEY,
    "endpoint": Config.R2_ENDPOINT,
    "bucket_name": Config.R2_BUCKET,
    "public_url": Config.R2_PUBLIC_URL
}

# 初始化客户端
s3_client = boto3.client(
    service_name='s3',
    endpoint_url=R2_CONFIG["endpoint"],
    aws_access_key_id=R2_CONFIG["access_key"],
    aws_secret_access_key=R2_CONFIG["secret_key"],
    region_name='auto',
    config=BotoConfig(
        signature_version='s3v4',
        proxies={} # 强制忽略系统代理，防止连不上本地 7897 端口
    ),
    verify=False # 强制禁用 SSL 验证
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

def upload_to_r2(file_obj, folder, prefix="file", fixed_name=None, app_name="unsorted"):
    """
    通用上传函数
    app_name: 应用命名空间 (如 'inventory', 'project_hub')
    folder: 子文件夹 (如 'images', 'docs', 'qrcodes')
    """
    if not file_obj: return ""
    
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
        if hasattr(file_obj, 'read'):
            s3_client.upload_fileobj(file_obj, R2_CONFIG["bucket_name"], filename, ExtraArgs={'ContentType': content_type})
        else:
            s3_client.put_object(Body=file_obj, Bucket=R2_CONFIG["bucket_name"], Key=filename, ContentType=content_type)
            
        return f"{R2_CONFIG['public_url']}/{filename}"
    except Exception as e:
        print(f"上传 {folder} 失败: {e}")
        return ""

def delete_from_r2(url):
    """根据 URL 删除 R2 上的文件"""
    if not url or R2_CONFIG['public_url'] not in url:
        return
    try:
        key = url.replace(f"{R2_CONFIG['public_url']}/", "")
        s3_client.delete_object(Bucket=R2_CONFIG["bucket_name"], Key=key)
    except Exception as e:
        print(f"删除 R2 文件失败: {e}")