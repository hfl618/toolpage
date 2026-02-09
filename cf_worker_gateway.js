/**
 * Cloudflare Worker - 618002.xyz 智能网关系统 (生产完整版 v3.4)
 * 集成：账号设置集成 + 实时资源监控 + 极简登录页
 * 核心：接口逻辑完全对接哈希加密后端
 */

const BACKEND_URL = "https://artificial-cordie-toolpage-e43d265d.koyeb.app";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const user = parseUserFromCookie(request.headers.get("Cookie"));

    if (path === '/' || path === '/index.html') {
      return new Response(renderUltraDashboard(user), { headers: { "Content-Type": "text/html;charset=UTF-8" } });
    }
    if (path === '/profile') {
      if (!user) return Response.redirect(url.origin + "/login", 302);
      return new Response(renderProfilePage(user), { headers: { "Content-Type": "text/html;charset=UTF-8" } });
    }
    if (path === '/login') {
      if (user) return Response.redirect(url.origin + "/", 302);
      return new Response(renderLoginPage(), { headers: { "Content-Type": "text/html;charset=UTF-8" } });
    }
    return proxyToBackend(request, BACKEND_URL, env);
  }
};

function parseUserFromCookie(cookieHeader) {
  if (!cookieHeader) return null;
  const token = cookieHeader.split('; ').find(row => row.startsWith('auth_token='))?.split('=')[1];
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return { uid: payload.uid, username: payload.username, role: payload.role || 'free', avatar: payload.avatar || "" };
  } catch (e) { return null; }
}

async function proxyToBackend(request, backendUrl, env) {
  const url = new URL(request.url);
  const targetUrl = backendUrl + url.pathname + url.search;
  const newHeaders = new Headers(request.headers);
  newHeaders.set("Host", new URL(backendUrl).hostname);
  const user = parseUserFromCookie(request.headers.get("Cookie"));
  if (user) { newHeaders.set("X-User-Id", user.uid.toString()); newHeaders.set("X-User-Role", user.role); }
  if (env.GATEWAY_SECRET) newHeaders.set("X-Gateway-Secret", env.GATEWAY_SECRET);
  return fetch(new Request(targetUrl, { method: request.method, headers: newHeaders, body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.blob() : null, redirect: 'follow' }));
}

const COMMON_HEAD = `
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<script src="https://cdn.tailwindcss.com"></script>
<link href="https://cdn.jsdelivr.net/npm/remixicon@3.5.0/fonts/remixicon.css" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
    body { font-family: 'Plus Jakarta Sans', sans-serif; background: #f8f9fa; color: #1e293b; -webkit-font-smoothing: antialiased; }
    .glass { background: rgba(255, 255, 255, 0.7); backdrop-filter: blur(12px); border-bottom: 1px solid rgba(226, 232, 240, 0.6); }
    .glass-card { background: white; border: 1px solid rgba(226, 232, 240, 0.8); box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.02); }
    .fade-in { animation: fadeIn 0.5s ease-out forwards; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    #toast-container { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); z-index: 9999; }
    .toast { background: rgba(30, 41, 59, 0.95); color: white; padding: 12px 24px; border-radius: 50px; margin-top: 10px; font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 10px; box-shadow: 0 10px 30px rgba(0,0,0,0.15); animation: slideDown 0.3s ease-out; }
    @keyframes slideDown { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
</style>
<script>
    function showToast(msg, type = 'info') {
        const container = document.getElementById('toast-container') || (() => { const div = document.createElement('div'); div.id = 'toast-container'; document.body.appendChild(div); return div; })();
        const el = document.createElement('div'); el.className = 'toast';
        let icon = type === 'success' ? 'ri-checkbox-circle-fill text-green-400' : (type === 'error' ? 'ri-error-warning-fill text-red-400' : 'ri-information-fill text-blue-400');
        el.innerHTML = \`<i class="\${icon}"></i><span>\${msg}</span>\`; container.appendChild(el);
        setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3000);
    }
    function logout() { document.cookie = "auth_token=; path=/; max-age=0; domain=" + window.location.hostname; window.location.href = '/'; }
</script>`;

function renderUltraDashboard(user) {
  const avatar = (user && user.avatar) ? user.avatar : (user ? "https://api.dicebear.com/7.x/avataaars/svg?seed=" + user.username : "");
  const userAreaHtml = user ? `
    <div class="relative group">
        <button class="flex items-center gap-3 focus:outline-none p-1 pr-3 rounded-full hover:bg-white/50 transition">
            <img src="${avatar}" class="w-10 h-10 rounded-full border-2 border-white shadow-sm bg-gray-100 object-cover">
            <div class="text-left hidden md:block"><div class="text-[13px] font-bold text-slate-800 leading-none">${user.username}</div></div>
            <i class="ri-arrow-down-s-line text-slate-400 text-xs"></i>
        </button>
        <div class="absolute right-0 mt-4 w-56 bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 transform origin-top-right translate-y-2 group-hover:translate-y-0 z-50">
            <div class="p-1.5">
                <a href="/profile" class="flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-black rounded-xl transition"><i class="ri-user-settings-line text-lg"></i> 个人中心</a>
                <button onclick="logout()" class="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-red-500 hover:bg-red-50 rounded-xl transition text-left"><i class="ri-logout-box-r-line text-lg"></i> 退出登录</button>
            </div>
        </div>
    </div>` : `<a href="/login" class="px-5 py-2 rounded-full bg-slate-900 text-white text-sm font-bold shadow-lg hover:bg-slate-800 transition-all">登录</a>`;

  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <title>Dashboard | 618002.xyz</title>
    ${COMMON_HEAD}
</head>
<body class="antialiased">
    <nav class="fixed top-0 w-full z-40 glass h-16"><div class="max-w-7xl mx-auto px-4 flex justify-between items-center h-full">
        <div class="flex items-center gap-3 cursor-pointer" onclick="location.href='/'"><div class="w-9 h-9 bg-slate-900 rounded-xl flex items-center justify-center text-white text-lg font-bold shadow-md">6</div><span class="font-bold text-slate-800">618002.xyz</span></div>
        <div id="userArea" class="flex items-center gap-3">${userAreaHtml}</div>
    </div></nav>
    <main class="max-w-7xl mx-auto px-4 pt-32 text-center">
        <h1 class="text-4xl md:text-6xl font-extrabold text-slate-900 mb-12 tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-gray-900 to-gray-500">Dashboard</h1>
        <div id="grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 text-left"></div>
    </main>
    <script>
        const tools = [{ id: 'stock', title: '元器件管理', desc: '库存与BOM解析系统', icon: 'ri-cpu-line', color: 'bg-blue-50 text-blue-600', url: '/inventory/' }];
        function render(list) { document.getElementById('grid').innerHTML = list.map(t => '<div class="glass-card p-8 rounded-[24px] cursor-pointer group transition-all relative" onclick="location.href=\\''+t.url+'\\'"><div class="w-14 h-14 '+t.color+' rounded-2xl flex items-center justify-center text-2xl mb-6 shadow-sm"><i class="'+t.icon+'"></i></div><h3 class="text-xl font-bold text-slate-900 mb-2">'+t.title+'</h3><p class="text-gray-400 text-sm">'+t.desc+'</p></div>').join(''); }
        render(tools);
    </script>
</body>
</html>`;
}

function renderProfilePage(user) {
  const avatar = user.avatar || "https://api.dicebear.com/7.x/avataaars/svg?seed=" + user.username;
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <title>个人中心</title>
    ${COMMON_HEAD}
</head>
<body class="antialiased min-h-screen bg-[#f1f5f9] pb-20">
    <nav class="fixed top-0 w-full z-40 glass h-16"><div class="max-w-5xl mx-auto px-4 flex items-center h-full gap-4">
        <a href="/" class="w-9 h-9 bg-white rounded-lg flex items-center justify-center border text-slate-600"><i class="ri-arrow-left-s-line text-xl"></i></a>
        <h1 class="text-lg font-bold text-slate-800">个人中心</h1>
    </div></nav>
    <div class="max-w-5xl mx-auto px-4 pt-24 grid grid-cols-1 md:grid-cols-12 gap-6">
        <div class="md:col-span-4 space-y-6 text-center">
            <div class="glass-card p-8 rounded-[32px] relative overflow-hidden fade-in text-center shadow-lg">
                <div class="absolute top-0 left-0 w-full h-24 bg-slate-900"></div>
                <div class="relative z-10">
                    <img id="u-avatar" src="${avatar}" class="w-24 h-24 rounded-full border-4 border-white shadow-lg mx-auto bg-white object-cover">
                    <h2 id="u-name" class="text-2xl font-extrabold mt-4 text-slate-900">${user.username}</h2>
                    <span id="u-role" class="inline-block mt-2 px-3 py-1 bg-blue-50 text-blue-600 text-[10px] font-bold uppercase rounded-full border border-blue-100">${user.role.toUpperCase()} Member</span>
                    <div class="mt-8 grid grid-cols-2 gap-4 border-t border-gray-100 pt-6">
                        <div><div class="text-2xl font-bold text-slate-900" id="stat-days">-</div><div class="text-[10px] text-slate-400 font-bold uppercase">加入天数</div></div>
                        <div><div class="text-2xl font-bold text-slate-900" id="stat-count">-</div><div class="text-[10px] text-slate-400 font-bold uppercase">总调用</div></div>
                    </div>
                </div>
            </div>
            <button onclick="logout()" class="w-full py-3 bg-white text-red-500 font-bold rounded-2xl border border-gray-100 hover:bg-red-50 transition">退出登录</button>
        </div>
        <div class="md:col-span-8 space-y-6">
            <div class="glass-card p-8 rounded-[32px] fade-in shadow-sm">
                <h3 class="font-bold text-slate-900 mb-6 flex items-center gap-2"><i class="ri-settings-4-fill text-orange-500"></i> 账号设置</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
                    <div class="space-y-4">
                        <p class="text-xs font-bold text-slate-400 uppercase tracking-widest">修改显示名称</p>
                        <div class="flex gap-2"><input type="text" id="newName" placeholder="${user.username}" class="flex-1 px-4 py-2.5 bg-gray-50 border-0 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition text-sm font-bold"><button onclick="updateAccount({username: document.getElementById('newName').value})" class="px-4 bg-slate-900 text-white rounded-xl font-bold text-xs">保存</button></div>
                    </div>
                    <div class="space-y-4">
                        <p class="text-xs font-bold text-slate-400 uppercase tracking-widest">修改安全密码</p>
                        <input type="password" id="newPw" placeholder="输入新密码" class="w-full px-4 py-2.5 bg-gray-50 border-0 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition text-sm"><button onclick="updateAccount({password: document.getElementById('newPw').value})" class="w-full mt-2 py-2.5 bg-slate-100 text-slate-900 rounded-xl font-bold text-xs shadow-inner">更新密码</button>
                    </div>
                </div>
            </div>
            <div class="glass-card p-8 rounded-[32px] fade-in shadow-sm"><h3 class="font-bold text-slate-900 mb-6 flex items-center gap-2"><i class="ri-pie-chart-2-fill text-blue-500"></i> 资源使用情况</h3>
                <div class="space-y-6">
                    <div>
                        <div class="flex justify-between text-xs font-bold mb-2 text-slate-500"><span>元器件存储</span><span><span id="val-storage">0</span> / <span id="limit-storage">500</span></span></div>
                        <div class="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden"><div id="bar-storage" class="h-full bg-slate-900 rounded-full w-0 transition-all duration-1000"></div></div>
                    </div>
                    <div>
                        <div class="flex justify-between text-xs font-bold mb-2 text-slate-500"><span>今日 API 额度</span><span><span id="val-api">0</span> / <span id="limit-api">100</span></span></div>
                        <div class="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden"><div id="bar-api" class="h-full bg-blue-500 rounded-full w-0 transition-all duration-1000"></div></div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <script>
        async function updateAccount(payload) {
            if (payload.password && payload.password.length < 6) return showToast('密码至少6位', 'error');
            try {
                const r = await fetch('/auth/update_profile', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
                if(r.ok) { showToast('修改成功', 'success'); setTimeout(logout, 1500); }
                else { const d = await r.json(); showToast(d.error || '更新失败', 'error'); }
            } catch(e) { showToast('连接中心失败', 'error'); }
        }
        async function fetchProfile() {
            try {
                const r = await fetch('/auth/profile_api'); const data = await r.json();
                if(data.success) {
                    const s = data.stats; const u = data.user;
                    document.getElementById('u-name').innerText = u.username;
                    document.getElementById('stat-days').innerText = s.days; document.getElementById('stat-count').innerText = s.api_calls;
                    document.getElementById('val-storage').innerText = s.storage_used; document.getElementById('limit-storage').innerText = s.storage_limit;
                    document.getElementById('bar-storage').style.width = Math.min(100, (s.storage_used / s.storage_limit * 100)) + '%';
                    document.getElementById('val-api').innerText = s.api_today; document.getElementById('limit-api').innerText = s.api_limit;
                    document.getElementById('bar-api').style.width = Math.min(100, (s.api_today / s.api_limit * 100)) + '%';
                }
            } catch(e) { showToast('加载失败', 'error'); }
        }
        fetchProfile();
    </script>
</body>
</html>`;
}

function renderLoginPage() {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <title>身份验证</title>
    ${COMMON_HEAD}
    <style> .input-group { position: relative; } .input-group input { padding-left: 44px; } .input-group i { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: #94a3b8; } </style>
</head>
<body class="flex items-center justify-center min-h-screen bg-slate-50 text-center">
    <div class="glass-card p-10 rounded-[40px] shadow-2xl bg-white w-full max-w-md fade-in">
        <div class="w-16 h-16 bg-slate-900 text-white rounded-2xl flex items-center justify-center text-3xl font-bold mx-auto mb-6 shadow-xl cursor-pointer" onclick="location.href='/'">6</div>
        <h1 id="title" class="text-2xl font-extrabold text-slate-900 mb-10">欢迎回来</h1>
        <form id="authForm" class="space-y-5 text-left">
            <div class="input-group"><input type="text" id="username" placeholder="用户名" class="w-full px-5 py-4 rounded-2xl border border-gray-200 focus:border-blue-500 outline-none transition-all" required><i class="ri-user-line"></i></div>
            <div class="input-group"><input type="password" id="password" placeholder="密码" class="w-full px-5 py-4 rounded-2xl border border-gray-200 focus:border-blue-500 outline-none transition-all" required><i class="ri-lock-2-line"></i></div>
            <button type="submit" id="submitBtn" class="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold text-lg hover:bg-slate-800 transition-all flex items-center justify-center gap-2"><span>立即登录</span> <i class="ri-arrow-right-line"></i></button>
        </form>
        <p class="mt-8 text-sm text-slate-400 font-medium cursor-pointer" onclick="toggleMode()"><span id="toggleText">还没有账号？</span> <span class="text-blue-600 font-bold ml-1">点击注册</span></p>
    </div>
    <script>
        let isLogin = true;
        function toggleMode() { isLogin = !isLogin; document.getElementById('title').innerText = isLogin ? '欢迎回来' : '创建账户'; document.querySelector('#submitBtn span').innerText = isLogin ? '立即登录' : '立即注册'; document.getElementById('toggleText').innerText = isLogin ? '还没有账号？' : '已有账号？'; }
        document.getElementById('authForm').addEventListener('submit', async (e) => {
            e.preventDefault(); const btn = document.getElementById('submitBtn'); const icon = btn.querySelector('i');
            btn.disabled = true; icon.className = 'ri-loader-4-line animate-spin text-xl';
            const payload = { username: document.getElementById('username').value, password: document.getElementById('password').value };
            try {
                const r = await fetch(isLogin ? '/auth/login' : '/auth/register', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
                if(r.ok) { showToast(isLogin?'登录成功':'注册成功', 'success'); if(isLogin) location.href = '/'; else toggleMode(); }
                else { const res = await r.json(); throw new Error(res.error || '失败'); }
            } catch(err) { showToast(err.message, 'error'); } finally { btn.disabled = false; icon.className = 'ri-arrow-right-line'; }
        });
    </script>
</body>
</html>`;
}
