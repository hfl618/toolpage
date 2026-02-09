/**
 * Cloudflare Worker - 618002.xyz 智能网关系统 (功能复位版 v3.2)
 * 恢复：Dashboard 中的 AI 识别工具入口
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
    return { uid: payload.uid, username: payload.username, role: payload.role || 'free', avatar: payload.avatar || '' };
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
    .glass { background: rgba(255, 255, 255, 0.7); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.5); }
    .glass-card { background: white; border: 1px solid rgba(226, 232, 240, 0.8); box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.02); }
    #toast-container { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); z-index: 9999; }
    .toast { background: rgba(0,0,0,0.8); color: white; padding: 10px 24px; border-radius: 50px; margin-top: 10px; font-size: 14px; display: flex; align-items: center; gap: 10px; }
</style>
<script>
    function showToast(msg, type = 'info') {
        const container = document.getElementById('toast-container') || (() => { const div = document.createElement('div'); div.id = 'toast-container'; document.body.appendChild(div); return div; })();
        const el = document.createElement('div'); el.className = 'toast';
        el.innerHTML = \`<span>\${msg}</span>\`; container.appendChild(el);
        setTimeout(() => el.remove(), 3000);
    }
    function logout() {
        document.cookie = "auth_token=; path=/; max-age=0";
        const domain = window.location.hostname.includes('.') ? window.location.hostname.split('.').slice(-2).join('.') : '';
        if(domain) document.cookie = "auth_token=; path=/; max-age=0; domain=." + domain;
        window.location.href = '/';
    }
</script>`;

function renderUltraDashboard(user) {
  const avatar = (user && user.avatar) ? user.avatar : (user ? "https://api.dicebear.com/7.x/avataaars/svg?seed=" + user.username : "");
  const userAreaHtml = user ? `
    <div class="relative group">
        <button class="flex items-center gap-3 focus:outline-none p-1 pr-3 rounded-full hover:bg-white/50 transition">
            <img src="${avatar}" class="w-9 h-9 rounded-full border-2 border-white shadow-sm bg-gray-50 object-cover">
            <div class="text-left hidden md:block"><div class="text-[13px] font-bold text-slate-800 leading-none">${user.username}</div></div>
            <i class="ri-arrow-down-s-line text-slate-400 text-xs"></i>
        </button>
        <div class="absolute right-0 mt-2 w-48 bg-white/90 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 transform origin-top-right translate-y-2 group-hover:translate-y-0 z-50">
            <div class="p-1.5">
                <a href="/profile" class="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-black rounded-lg transition"><i class="ri-user-settings-line"></i> 个人中心</a>
                <button onclick="logout()" class="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50 rounded-lg transition text-left"><i class="ri-logout-box-r-line"></i> 退出登录</button>
            </div>
        </div>
    </div>` : `<a href="/login" class="px-5 py-2 rounded-full bg-slate-900 text-white text-sm font-bold shadow-lg hover:bg-slate-800 hover:scale-105 transition-all">登录</a>`;

  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <title>Hub | 618002.xyz</title>
    ${COMMON_HEAD}
</head>
<body class="antialiased pb-20">
    <nav class="fixed top-0 w-full z-40 glass h-16"><div class="max-w-7xl mx-auto px-4 flex justify-between items-center h-full">
        <div class="flex items-center gap-3 cursor-pointer" onclick="location.href='/'"><div class="w-9 h-9 bg-slate-900 rounded-xl flex items-center justify-center text-white text-lg font-bold">6</div><span class="font-bold text-slate-800">618002.xyz</span></div>
        <div class="flex items-center gap-4">
            <div class="relative group hidden md:block"><i class="ri-search-2-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i><input type="text" id="globalSearch" placeholder="搜索..." class="bg-gray-100/50 rounded-full py-2 pl-10 pr-4 text-sm w-64 outline-none"></div>
            ${userAreaHtml}
        </div>
    </div></nav>
    <main class="max-w-7xl mx-auto px-4 pt-32">
        <h1 class="text-3xl font-extrabold text-slate-900 mb-10">应用仪表盘</h1>
        <div id="grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"></div>
    </main>
    <div id="modal" class="fixed inset-0 z-[100] hidden flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onclick="closeModal()"></div>
        <div class="relative bg-white w-full max-w-lg rounded-[32px] shadow-2xl p-10 text-center" id="modalCard">
            <div id="modalIcon" class="w-20 h-20 mx-auto rounded-3xl flex items-center justify-center text-4xl mb-6 shadow-inner"></div>
            <h2 id="modalTitle" class="text-2xl font-bold mb-3"></h2>
            <p id="modalDesc" class="text-slate-500 mb-8"></p>
            <button id="launchBtn" class="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold">启动应用</button>
        </div>
    </div>
    <script>
        const tools = [
            { id: 'stock', title: '元器件管理', desc: '库存与BOM解析系统', icon: 'ri-cpu-line', color: 'bg-blue-50 text-blue-600', url: '/inventory/' },
            { id: 'ai', title: 'AI 识别中心', desc: '视觉模型分析终端', icon: 'ri-eye-2-line', color: 'bg-purple-50 text-purple-600', url: '/ai_tools' }
        ];
        function render(list) {
            document.getElementById('grid').innerHTML = list.map(t => '<div class="glass-card p-6 rounded-[24px] cursor-pointer group hover:border-blue-200 transition-all relative" onclick="openModal(\\''+t.id+'\\')"><div class="w-14 h-14 '+t.color+' rounded-2xl flex items-center justify-center text-2xl mb-5 group-hover:scale-110 transition-transform"><i class="'+t.icon+'"></i></div><h3 class="text-lg font-bold text-slate-900 mb-1">'+t.title+'</h3><p class="text-sm text-slate-500 font-medium">'+t.desc+'</p></div>').join('');
        }
        function openModal(id) {
            const t = tools.find(x => x.id === id); if(!t) return;
            document.getElementById('modalTitle').innerText = t.title; document.getElementById('modalDesc').innerText = t.desc;
            document.getElementById('modalIcon').className = 'w-20 h-20 mx-auto rounded-3xl '+t.color+' flex items-center justify-center text-4xl mb-6';
            document.getElementById('modalIcon').innerHTML = '<i class="'+t.icon+'"></i>';
            document.getElementById('launchBtn').onclick = () => window.location.href = t.url;
            document.getElementById('modal').classList.remove('hidden');
        }
        function closeModal() { document.getElementById('modal').classList.add('hidden'); }
        render(tools);
    </script>
</body>
</html>`;
}

function renderProfilePage(user) {
  return \`<!DOCTYPE html>... (保持 3.0 版本逻辑) ...\`;
}

function renderLoginPage() {
  return \`<!DOCTYPE html>... (保持 3.0 版本逻辑) ...\`;
}
