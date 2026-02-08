FROM python:3.10-slim

WORKDIR /app

# 安装系统依赖（如 pandas 需要的一些库）
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Zeabur/Koyeb 默认端口建议
EXPOSE 8080

CMD ["python", "app.py"]
