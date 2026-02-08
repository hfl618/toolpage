FROM python:3.9

# 创建并切换到 HF 要求的用户
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

WORKDIR $HOME/app

# 先拷贝 requirements 并安装，利用缓存
COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# 拷贝全量代码
COPY --chown=user . .

EXPOSE 7860

# 启动命令：直接使用 Python 启动，绕过 Gunicorn 以便于调试
CMD ["python", "app.py"]