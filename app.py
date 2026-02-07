from flask import Flask, jsonify
from flask_cors import CORS

app = Flask(__name__)
# 这一行非常重要，允许你的 618002.xyz 访问它
CORS(app)

@app.route('/')
def home():
    return jsonify({"status": "ok", "message": "Hugging Face 后端连接成功！"})

@app.route('/predict', methods=['POST'])
def predict():
    # 模拟图像识别的延迟和返回
    return jsonify({"result": "识别功能测试正常", "detail": "后端已收到请求"})

if __name__ == '__main__':
    # 端口必须是 7860
    app.run(host='0.0.0.0', port=7860)