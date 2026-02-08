import os
import sys

# 立即打印
print("🚀 [STARTUP] Python is starting...", flush=True)

from flask import Flask

app = Flask(__name__)

@app.route('/')
def home():
    print("🏠 [ACCESS] Root path accessed", flush=True)
    return "<h1>Minimal App is Running!</h1><p>If you see this, the environment is fine.</p>"

@app.route('/health')
def health():
    return {"status": "ok"}, 200

if __name__ == '__main__':
    print("⚙️ [CONFIG] Port: 7860, Host: 0.0.0.0", flush=True)
    app.run(host='0.0.0.0', port=7860, debug=False)