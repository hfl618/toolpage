# 这里的变量名要和 app.py 里的对应
WORKER_LOGIN_HTML = """
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8"><title>身份验证 | 618002.xyz</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/remixicon@3.5.0/fonts/remixicon.css" rel="stylesheet">
    <style>
        body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f5f5f7; }
        .login-card { background: rgba(255, 255, 255, 0.65); backdrop-filter: blur(24px); border-radius: 32px; width: 90%; max-width: 420px; padding: 48px; box-shadow: 0 20px 40px -10px rgba(0,0,0,0.08); }
    </style>
</head>
<body>
    <div class="login-card">
        <h1 id="title" class="text-3xl font-bold mb-6 text-center">欢迎回来</h1>
        <form id="authForm" class="space-y-5">
            <input type="text" id="username" required class="w-full px-5 py-4 rounded-2xl border" placeholder="用户名">
            <input type="password" id="password" required class="w-full px-5 py-4 rounded-2xl border" placeholder="密码">
            <button type="submit" id="submitBtn" class="w-full bg-black text-white py-4 rounded-2xl font-bold">立即登录</button>
        </form>
        <p class="mt-6 text-center text-sm text-gray-400">还没有账号？<a href="javascript:toggleMode()" id="toggleBtn" class="text-blue-600 font-bold">创建新账户</a></p>
    </div>
    <script>
        let isLogin = true;
        function toggleMode() {
            isLogin = !isLogin;
            document.getElementById('title').innerText = isLogin ? '欢迎回来' : '创建账户';
            document.getElementById('submitBtn').innerText = isLogin ? '立即登录' : '立即注册';
            document.getElementById('toggleBtn').innerText = isLogin ? '创建新账户' : '返回登录';
        }
        document.getElementById('authForm').onsubmit = async (e) => {
            e.preventDefault();
            const btn = document.getElementById('submitBtn');
            btn.disabled = true;
            const endpoint = isLogin ? '/auth/login' : '/auth/register';
            const resp = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: document.getElementById('username').value,
                    password: document.getElementById('password').value
                })
            });
            if (resp.ok) {
                const next = new URLSearchParams(window.location.search).get('next') || '/';
                location.href = next;
            } else {
                alert("失败");
                btn.disabled = false;
            }
        };
    </script>
</body>
</html>
"""

WORKER_DASHBOARD_HTML = """
<!DOCTYPE html>
<html>
<head>
    <title>Hub | 618002.xyz</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/remixicon@3.5.0/fonts/remixicon.css" rel="stylesheet">
    <style>
        .bento-card { background: white; border-radius: 24px; padding: 2rem; border: 1px solid #f1f5f9; transition: 0.3s; }
        .bento-card:hover { transform: translateY(-5px); box-shadow: 0 10px 30px rgba(0,0,0,0.05); }
    </style>
</head>
<body class="bg-[#fbfbfd] p-8">
    <nav class="flex justify-between items-center mb-12">
        <div class="text-2xl font-bold">618002.xyz</div>
        <div>
            {% if user %}
                <div class="flex items-center gap-3">
                    <span class="font-bold">{{ user.username }}</span>
                    <a href="/profile" class="text-blue-600">个人中心</a>
                </div>
            {% else %}
                <a href="/login" class="bg-black text-white px-6 py-2 rounded-full font-bold">登录</a>
            {% endif %}
        </div>
    </nav>
    <div class="grid grid-cols-3 gap-6">
        <div class="bento-card cursor-pointer" onclick="location.href='/inventory/'">
            <div class="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center text-2xl mb-4"><i class="ri-cpu-line"></i></div>
            <h3 class="text-xl font-bold">元器件管理</h3>
            <p class="text-gray-400">库存与BOM系统</p>
        </div>
        <div class="bento-card">
            <div class="w-12 h-12 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center text-2xl mb-4"><i class="ri-eye-line"></i></div>
            <h3 class="text-xl font-bold">AI 识别</h3>
            <p class="text-gray-400">视觉处理终端</p>
        </div>
    </div>
</body>
</html>
"""

WORKER_PROFILE_HTML = """
<!DOCTYPE html>
<html>
<head>
    <title>个人中心 | 618002.xyz</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/remixicon@3.5.0/fonts/remixicon.css" rel="stylesheet">
</head>
<body class="bg-[#fbfbfd]">
    <div class="max-w-4xl mx-auto pt-20 px-6">
        <a href="/" class="text-gray-400 mb-8 block"><i class="ri-arrow-left-line"></i> 返回首页</a>
        <div class="bg-white rounded-[32px] p-10 border border-gray-100 shadow-sm flex items-center gap-8">
            <img src="https://api.dicebear.com/7.x/avataaars/svg?seed={{ user.username }}" class="w-24 h-24 rounded-full bg-gray-50">
            <div>
                <h1 class="text-3xl font-black">{{ user.username }}</h1>
                <p class="text-blue-600 font-bold uppercase text-xs mt-2">{{ user.role }} Member</p>
            </div>
        </div>
        
        <div class="grid grid-cols-2 gap-6 mt-8">
            <div class="bg-white rounded-[32px] p-8 border border-gray-100">
                <h3 class="font-bold text-gray-400 uppercase text-xs mb-4">库存统计</h3>
                <p class="text-4xl font-black" id="storage-used">...</p>
            </div>
            <div class="bg-white rounded-[32px] p-8 border border-gray-100">
                <h3 class="font-bold text-gray-400 uppercase text-xs mb-4">今日 API</h3>
                <p class="text-4xl font-black" id="api-today">...</p>
            </div>
        </div>

        <div class="bg-white rounded-[32px] p-10 border border-gray-100 shadow-sm mt-8">
            <h3 class="font-bold mb-6">最近活动</h3>
            <div id="activity-list" class="space-y-4">加载中...</div>
        </div>
    </div>
    <script>
        async function loadData() {
            const res = await fetch('/api/user/profile');
            const data = await res.json();
            if (data.success) {
                document.getElementById('storage-used').innerText = data.stats.storage_used;
                document.getElementById('api-today').innerText = data.stats.api_today;
                document.getElementById('activity-list').innerHTML = data.activities.map(a => `
                    <div class="flex items-center gap-4">
                        <div class="w-2 h-2 bg-blue-500 rounded-full"></div>
                        <span class="font-bold text-sm">${a.text}</span>
                        <span class="text-gray-300 text-xs">${a.time}</span>
                    </div>
                `).join('');
            }
        }
        loadData();
    </script>
</body>
</html>
"""
