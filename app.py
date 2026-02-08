import sys
import os
from flask import Flask

# 强制刷新日志
sys.stdout.reconfigure(line_buffering=True)

app = Flask(__name__)

@app.route('/')
def hello():
    return "Hello from Minimal App! The environment is working."

@app.route('/health')
def health():
    return {"status": "ok"}, 200

if __name__ == '__main__':
    print("--- Starting Minimal App ---")
    app.run(host='0.0.0.0', port=7860)
