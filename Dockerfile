FROM python:3.9

WORKDIR /code

# 复制依赖文件
COPY requirements.txt .

# 增加构建时的日志输出
RUN echo "Step: Installing dependencies..."
RUN pip install --no-cache-dir --upgrade -r requirements.txt
RUN echo "Step: Dependencies installed successfully."

# 复制所有文件
COPY . .
RUN echo "Step: Files copied to container."

# 环境变量：确保日志不被缓存，直接输出
ENV PYTHONUNBUFFERED=1

EXPOSE 7860

# 启动
CMD ["python", "app.py"]
