FROM python:3.9-slim

WORKDIR /app

# 只有这一行安装
RUN pip install --no-cache-dir flask

# 拷贝 app.py
COPY app.py .

# 暴露端口
EXPOSE 7860

# 强制 Python 不缓存日志
ENV PYTHONUNBUFFERED=1

CMD ["python", "app.py"]