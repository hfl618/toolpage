FROM python:3.9

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

RUN useradd -m -u 1000 user
WORKDIR $HOME/app

# 安装 Flask
RUN pip install --no-cache-dir flask

# 拷贝文件
COPY --chown=user . .

USER user
EXPOSE 7860

# 直接执行 Python，不使用 shell 脚本，避免 CRLF 问题
CMD ["python", "app.py"]