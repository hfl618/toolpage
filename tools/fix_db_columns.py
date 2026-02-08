import sys
import os
# 将根目录加入路径以找到 config.py
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database import d1

print("Adding qrcode_path...")
res1 = d1.execute('ALTER TABLE components ADD COLUMN qrcode_path TEXT')
print(res1)

print("Adding doc_path...")
res2 = d1.execute('ALTER TABLE components ADD COLUMN doc_path TEXT')
print(res2)
