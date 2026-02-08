# 1. 使用官方轻量级 Python 镜像
FROM python:3.9-slim

# 2. 设置环境变量 (防止 Python 生成 .pyc 文件，强制日志输出到控制台)
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# 3. 创建非 root 用户 (Hugging Face 强制要求 ID 为 1000)
RUN useradd -m -u 1000 user

# 4. 切换到该用户
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

# 5. 设置工作目录 (在该用户的主目录下)
WORKDIR $HOME/app

# 6. 复制依赖清单 (使用 --chown 确保用户有权读取)
COPY --chown=user requirements.txt .

# 7. 安装依赖
# 注意：确保 requirements.txt 里包含 gunicorn
RUN pip install --no-cache-dir --upgrade -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# 8. 复制所有项目文件 (关键：赋予 user 用户权限)
COPY --chown=user . .

# 9. 暴露 Hugging Face 默认端口
EXPOSE 7860

# 10. 启动命令
# run:app 的意思是：加载 run.py 文件，寻找其中的 app 对象
CMD ["gunicorn", "-b", "0.0.0.0:7860", "run:app"]