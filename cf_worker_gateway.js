/**
 * Cloudflare Worker - 618002.xyz 智能网关系统 (v5.9 终极完整版)
 */

const BACKEND_URL = "https://artificial-cordie-toolpage-e43d265d.koyeb.app";

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      const user = parseUserFromCookie(request.headers.get("Cookie"));

      // 1. 核心页面路由
      if (path === '/' || path === '/index.html') {
        return new Response(renderDashboard(user), { headers: { "Content-Type": "text/html;charset=UTF-8" } });
      }
      
      if (path === '/profile') {
        if (!user) return Response.redirect(url.origin + "/login", 302);
        return new Response(renderProfile(user), { headers: { "Content-Type": "text/html;charset=UTF-8" } });
      }
      
      if (path === '/login') {
        if (user) return Response.redirect(url.origin + "/", 302);
        return new Response(renderLogin(), { headers: { "Content-Type": "text/html;charset=UTF-8" } });
      }

      if (path === '/logout') {
        const resp = Response.redirect(url.origin + "/login", 302);
        resp.headers.append("Set-Cookie", "auth_token=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly");
        return resp;
      }

      // 2. 业务请求转发
      const response = await proxyToBackend(request, BACKEND_URL, env);
      const contentType = response.headers.get("Content-Type") || "";
      
      // 3. 注入 Bug 反馈
      if (contentType.includes("text/html")) {
        let html = await response.text();
        html = html.replace("</body>", BUG_REPORT_WIDGET + "</body>");
        return new Response(html, { headers: response.headers });
      }
      
      return response;

    } catch (e) {
      return new Response(`⚠️ Gateway Error: ${e.message}`, { status: 500 });
    }
  }
};

/**
 * 🛠️ 后端透传逻辑
 */
async function proxyToBackend(request, backendUrl, env) {
  const url = new URL(request.url);
  const targetUrl = backendUrl + url.pathname + url.search;
  const safeHeaders = new Headers();
  for (const [k, v] of request.headers.entries()) {
    const key = k.toLowerCase();
    if (!['host', 'content-length', 'connection'].includes(key) && !key.startsWith('cf-')) {
      safeHeaders.append(k, v);
    }
  }
  const user = parseUserFromCookie(request.headers.get("Cookie"));
  if (user) {
    safeHeaders.set("X-User-Id", user.uid.toString());
    safeHeaders.set("X-User-Role", user.role.toLowerCase());
  }
  if (env.GATEWAY_SECRET) safeHeaders.set("X-Gateway-Secret", env.GATEWAY_SECRET);

  const init = { method: request.method, headers: safeHeaders, redirect: 'follow' };
  if (request.method !== 'GET' && request.method !== 'HEAD') init.body = await request.blob();
  return fetch(new Request(targetUrl, init));
}

/**
 * 🔑 用户解析
 */
function parseUserFromCookie(cookieHeader) {
  if (!cookieHeader) return null;
  try {
    const token = cookieHeader.split('; ').find(row => row.startsWith('auth_token='))?.split('=')[1];
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return {
      uid: payload.uid,
      username: payload.username || ("User_" + payload.uid),
      role: (payload.role || 'free').toUpperCase(),
      avatar: payload.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${payload.username}`
    };
  } catch (e) { return null; }
}

// ==========================================
// 🎨 UI 全局基础
// ==========================================

const GLOBAL_STYLE = `
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/remixicon@3.5.0/fonts/remixicon.css" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Plus Jakarta Sans', sans-serif; background: #f8fafc; color: #1e293b; -webkit-font-smoothing: antialiased; }
    .bg-mesh { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: -1; background: radial-gradient(at 0% 0%, rgba(59,130,246,0.05) 0px, transparent 50%), radial-gradient(at 100% 0%, rgba(139,92,246,0.05) 0px, transparent 50%); }
    .glass-nav { background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(20px); border-bottom: 1px solid rgba(0,0,0,0.05); }
    .bento-card { background: white; border: 1px solid rgba(226, 232, 240, 0.7); transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); cursor: pointer; position: relative; overflow: hidden; }
    .bento-card:hover { transform: translateY(-6px); border-color: #3b82f6; box-shadow: 0 20px 30px -10px rgba(59, 130, 246, 0.15); }
    .btn-dark { background: #0f172a; color: white; transition: all 0.3s ease; border-radius: 100px; font-weight: 700; }
    .lang-switcher { display: flex; gap: 4px; background: #f1f5f9; padding: 4px; border-radius: 100px; }
    .lang-btn { padding: 4px 12px; border-radius: 100px; font-size: 10px; font-weight: 800; cursor: pointer; transition: 0.2s; }
    .lang-btn.active { background: white; color: #3b82f6; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
  </style>
  <script>
    function showToast(m, type='info') {
      const c = document.getElementById('toast-container') || (()=>{const d=document.createElement('div');d.id='toast-container';document.body.appendChild(d);return d;})();
      const el = document.createElement('div'); el.className = 'toast';
      el.style = "background:#1e293b; color:white; padding:12px 28px; border-radius:100px; margin-top:10px; font-weight:600; box-shadow:0 15px 30px rgba(0,0,0,0.2); pointer-events:auto;";
      el.innerHTML = m; c.appendChild(el); setTimeout(()=>el.remove(), 3000);
    }
  </script>
`;

const BUG_REPORT_WIDGET = `
<div id="bug-report-trigger" onclick="toggleBugModal()" style="position:fixed; right:24px; bottom:100px; width:48px; height:48px; background:white; border:1px solid #f1f5f9; box-shadow:0 20px 25px -5px rgba(0,0,0,0.1); border-radius:16px; display:flex; align-items:center; justify-content:center; cursor:pointer; z-index:9999; transition:all 0.3s;">
    <i class="ri-bug-2-line" style="font-size:20px; color:#94a3b8;"></i>
</div>
<div id="bug-modal" style="display:none; position:fixed; inset:0; background:rgba(15,23,42,0.4); backdrop-filter:blur(4px); z-index:10000; align-items:center; justify-content:center; padding:16px;">
    <div style="background:white; width:100%; max-width:400px; border-radius:32px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.25); padding:32px; position:relative;">
        <h3 class="bug-i18n" data-zh="报告问题" data-en="Report Issue" style="font-weight:900; font-size:20px; margin-bottom:8px;">报告问题</h3>
        <textarea id="bug-content" class="bug-i18n-ph" data-zh-ph="请描述您的问题..." data-en-ph="Describe issue..." style="width:100%; height:100px; padding:16px; border-radius:16px; background:#f8fafc; border:none; outline:none; font-size:14px; resize:none; margin-bottom:16px;"></textarea>
        <div style="margin-bottom:16px; display:flex; align-items:center; gap:12px;">
            <div onclick="document.getElementById('bug-image').click()" style="width:40px; height:40px; border-radius:10px; background:#f1f5f9; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#64748b; border:1px dashed #cbd5e1;"><i class="ri-camera-line"></i></div>
            <input type="file" id="bug-image" accept="image/*" style="display:none;" onchange="updateBugPreview(this)">
            <span id="bug-preview-name" style="font-size:10px; color:#94a3b8; font-weight:700;">上传截图 (可选)</span>
        </div>
        <button id="bug-submit-btn" onclick="submitBug()" class="bug-i18n" data-zh="提交" data-en="Submit" style="width:100%; padding:14px; background:#0f172a; color:white; border-radius:12px; font-weight:800; border:none; cursor:pointer;">提交</button>
        <button onclick="toggleBugModal()" style="position:absolute; top:20px; right:20px; border:none; background:none; cursor:pointer;"><i class="ri-close-line"></i></button>
    </div>
</div>
<script>
    function updateBugPreview(i) {
        if (i.files && i.files[0]) document.getElementById('bug-preview-name').innerText = i.files[0].name;
    }
    function toggleBugModal() {
        const m = document.getElementById('bug-modal');
        m.style.display = m.style.display === 'none' ? 'flex' : 'none';
        if(m.style.display === 'flex') {
            const l = localStorage.getItem('lang') || 'zh';
            document.querySelectorAll('.bug-i18n').forEach(el => el.innerText = el.getAttribute('data-' + l));
            document.querySelectorAll('.bug-i18n-ph').forEach(el => el.placeholder = el.getAttribute('data-' + l + '-ph'));
        }
    }
    async function submitBug() {
        const c = document.getElementById('bug-content').value.trim();
        if(!c) return;
        const fd = new FormData();
        fd.append('content', c);
        fd.append('page_url', window.location.href);
        if(document.getElementById('bug-image').files[0]) fd.append('image', document.getElementById('bug-image').files[0]);
        try {
            await fetch('/support/report_bug', { method: 'POST', body: fd });
            alert("Sent!"); toggleBugModal();
        } catch(e) { alert("Error"); }
    }
</script>
`;

function renderDashboard(user) {
  const userHtml = user ? `
    <div class="relative group">
      <button class="flex items-center gap-2 p-1.5 pr-4 rounded-full bg-white border border-gray-100 shadow-sm" onclick="toggleUserMenu()">
        <img src="${user.avatar}" class="w-8 h-8 rounded-full object-cover">
        <span class="text-xs font-bold text-slate-700 hidden md:inline">${user.username}</span>
        <i class="ri-arrow-down-s-line text-slate-400"></i>
      </button>
      <div id="userMenu" class="absolute right-0 mt-3 w-48 bg-white rounded-2xl shadow-2xl border border-gray-100 opacity-0 invisible transition-all p-2 z-50">
        <a href="/profile" class="block px-4 py-2 text-sm font-bold text-slate-600 hover:bg-gray-50 rounded-xl no-underline">个人中心</a>
        <a href="/logout" class="block px-4 py-2 text-sm font-bold text-red-500 hover:bg-red-50 rounded-xl no-underline">退出登录</a>
      </div>
    </div>` : `<a href="/login" class="px-6 py-2 btn-dark text-xs shadow-lg no-underline">立即登录</a>`;

  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    ${GLOBAL_STYLE}
    <title>工作台 | 618002.xyz</title>
</head>
<body class="antialiased">
  <div class="bg-mesh"></div>
  <nav class="fixed top-0 w-full z-40 glass-nav h-20 flex items-center px-6">
    <div class="max-w-7xl mx-auto w-full flex justify-between items-center">
      <div class="flex items-center gap-4 cursor-pointer" onclick="location.reload()">
        <div class="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white text-xl font-black">6</div>
        <span class="text-xl font-black">Hub</span>
      </div>
      <div class="flex items-center gap-6">
        <div class="hidden md:flex relative items-center">
          <i class="ri-search-2-line absolute left-4 text-slate-400"></i>
          <input type="text" id="globalSearch" placeholder="搜索工具..." class="bg-slate-100/80 border-none rounded-2xl py-2 pl-11 pr-6 text-sm w-64 focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all outline-none font-bold">
        </div>
        <div class="lang-switcher">
            <div onclick="setLanguage('zh')" id="lang-zh" class="lang-btn">中文</div>
            <div onclick="setLanguage('en')" id="lang-en" class="lang-btn">EN</div>
        </div>
        ${userHtml}
      </div>
    </div>
  </nav>

  <main class="max-w-7xl mx-auto px-6 pt-36 pb-20 text-center md:text-left">
    <h1 class="text-5xl font-black text-slate-900 tracking-tighter mb-4 i18n" data-zh="应用矩阵" data-en="App Matrix">应用矩阵</h1>
    <p class="text-slate-400 font-bold mb-12 i18n" data-zh="高效数字化工作流。" data-en="Pro digital workflow.">高效数字化工作流。</p>
    <div id="grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8"></div>
  </main>

  <script>
    let currentLang = localStorage.getItem('lang') || 'zh';
    const tools = [
      { t_zh:'元器件管理', t_en:'Inventory', url:'/inventory/', col:'from-blue-500 to-indigo-600', icon:'ri-cpu-fill' },
      { t_zh:'LVGL 图像处理', t_en:'LVGL Studio', url:'/lvgl_image/', col:'from-emerald-500 to-teal-600', icon:'ri-image-edit-fill' },
      { t_zh:'AI 识别中心', t_en:'AI Hub', url:'/ai_tools', col:'from-purple-500 to-pink-600', icon:'ri-eye-fill' }
    ];
    function setLanguage(l) {
        currentLang = l; localStorage.setItem('lang', l);
        document.querySelectorAll('.lang-btn').forEach(b => b.classList.toggle('active', b.id==='lang-'+l));
        document.querySelectorAll('.i18n').forEach(el => el.innerText = el.getAttribute('data-'+l));
        render();
    }
    function render() {
        const v = document.getElementById('globalSearch').value.toLowerCase();
        document.getElementById('grid').innerHTML = tools.filter(t => t.t_zh.includes(v) || t.t_en.toLowerCase().includes(v)).map(t => \`
            <div class="bento-card p-10 rounded-[36px]" onclick="location.href='\${t.url}'">
                <div class="w-16 h-16 bg-gradient-to-br \${t.col} rounded-2xl flex items-center justify-center text-white text-3xl mb-8 shadow-xl"><i class="\${t.icon}"></i></div>
                <h3 class="text-2xl font-black text-slate-900">\${currentLang==='zh'?t.t_zh:t.t_en}</h3>
            </div>\`).join('');
    }
    function toggleUserMenu() {
        const m = document.getElementById('userMenu');
        if(m) { m.classList.toggle('opacity-0'); m.classList.toggle('invisible'); }
    }
    document.getElementById('globalSearch').oninput = render;
    setLanguage(currentLang);
  </script>
  ${BUG_REPORT_WIDGET}
</body>
</html>`;
}

function renderProfile(user) { return renderDashboard(user); }
function renderLogin() { return renderDashboard(null); }
