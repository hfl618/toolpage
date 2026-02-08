import boto3
from botocore.config import Config as BotoConfig
import os
import sys

# 尝试导入项目配置
sys.path.append(os.getcwd())
try:
    from tools.config import Config
except ImportError:
    print("❌ 无法加载配置文件，请在项目根目录运行此脚本。")
    sys.exit(1)

def cleanup_r2():
    print("🧹 开始清理 R2 多余文件...")
    
    # 1. 初始化客户端
    access_key = Config.R2_ACCESS_KEY or os.getenv('R2_ACCESS_KEY')
    secret_key = Config.R2_SECRET_KEY or os.getenv('R2_SECRET_KEY')
    endpoint = Config.R2_ENDPOINT or os.getenv('R2_ENDPOINT')
    bucket_name = Config.R2_BUCKET
    
    if not all([access_key, secret_key, endpoint]):
        print("❌ 缺失 R2 凭据，请确保环境变量已设置。")
        return

    s3 = boto3.client(
        service_name='s3',
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name='auto',
        config=BotoConfig(signature_version='s3v4'),
        verify=False
    )

    # 2. 定义需要清理的冗余前缀 (注意：这些是不带 user_{id} 的旧路径)
    redundant_prefixes = [
        'inventory/images/',
        'inventory/qrcodes/'
    ]

    for prefix in redundant_prefixes:
        print(f"
🔎 正在扫描冗余路径: {prefix}")
        try:
            # 列出该路径下的所有文件
            paginator = s3.get_paginator('list_objects_v2')
            pages = paginator.paginate(Bucket=bucket_name, Prefix=prefix)
            
            delete_keys = []
            for page in pages:
                if 'Contents' in page:
                    for obj in page['Contents']:
                        delete_keys.append({'Key': obj['Key']})
            
            if not delete_keys:
                print(f"✅ 路径 {prefix} 已经是空的。")
                continue

            # 执行批量删除
            print(f"🗑️ 发现 {len(delete_keys)} 个冗余文件，正在删除...")
            # S3 每次最多删除 1000 个
            for i in range(0, len(delete_keys), 1000):
                batch = delete_keys[i:i + 1000]
                s3.delete_objects(Bucket=bucket_name, Delete={'Objects': batch})
            
            print(f"✨ 路径 {prefix} 清理完成。")
            
        except Exception as e:
            print(f"❌ 清理 {prefix} 失败: {e}")

    print("
🏁 R2 清理任务结束。")

if __name__ == "__main__":
    cleanup_r2()
