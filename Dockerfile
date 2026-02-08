FROM python:3.9-slim

WORKDIR /app

# 安装系统依赖（如 pandas 需要的一些库）
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Zeabur 默认会自动识别 PORT 环境变量，Flask 已在代码中适配
EXPOSE 7860

CMD ["python", "app.py"]
