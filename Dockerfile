FROM python:3.9

# 1. 设置环境变量
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

# 2. 创建非 root 用户 (UID 1000)
RUN useradd -m -u 1000 user

# 3. 设置工作目录
WORKDIR $HOME/app

# 4. 只有这一行安装
RUN pip install --no-cache-dir flask

# 5. 拷贝文件并修改权限
COPY --chown=user . .

# 6. 给启动脚本执行权限
RUN chmod +x entrypoint.sh

# 7. 切换用户
USER user

# 8. 暴露端口
EXPOSE 7860

# 9. 启动命令
CMD ["./entrypoint.sh"]
