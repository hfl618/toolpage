/**
 * Cloudflare Worker - 618002.xyz 智能网关系统 (功能全量补完版 v6.8)
 * 基于 v5.3 骨架，增加了：多图反馈、模态框详情、注册切换、实时查重、多语言过滤
 * 修复：通过标准字符串拼接彻底解决浏览器端 JS 语法报错问题
 */

const BACKEND_URL = "https://artificial-cordie-toolpage-e43d265d.koyeb.app";

// ==========================================
// 🐛 增加内容 1：Bug 反馈组件 (支持多图)
// ==========================================
const BUG_WIDGET_HTML = `
<div id="bug-report-trigger" onclick="toggleBugModal()" style="position:fixed; right:24px; bottom:100px; width:48px; height:48px; background:white; border:1px solid #f1f5f9; box-shadow:0 20px 25px -5px rgba(0,0,0,0.1); border-radius:16px; display:flex; align-items:center; justify-content:center; cursor:pointer; z-index:9999; transition:all 0.3s;" onmouseover="this.style.transform='scale(1.1)';" onmouseout="this.style.transform='scale(1)';">
    <i class="ri-bug-2-line" style="font-size:20px; color:#94a3b8;"></i>
</div>
<div id="bug-modal" style="display:none; position:fixed; inset:0; background:rgba(15,23,42,0.4); backdrop-filter:blur(4px); z-index:10000; align-items:center; justify-content:center; padding:16px;">
    <div style="background:white; width:100%; max-width:400px; border-radius:32px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.25); padding:32px; position:relative;">
        <h3 class="bug-i18n" data-zh="报告问题" data-en="Report Issue" style="font-weight:900; font-size:20px; margin-bottom:8px;">报告问题</h3>
        <p class="bug-i18n" data-zh="帮助我们改进系统" data-en="Help us improve" style="font-size:10px; color:#94a3b8; font-weight:800; text-transform:uppercase; margin-bottom:24px;">帮助我们改进系统</p>
        <textarea id="bug-content" class="bug-i18n-ph" data-zh-ph="请详细描述您遇到的问题..." data-en-ph="Please describe the issue in detail..." style="width:100%; height:120px; padding:16px; border-radius:16px; background:#f8fafc; border:none; outline:none; font-size:14px; resize:none; margin-bottom:16px; min-height:120px;"></textarea>
        <div style="margin-bottom:16px; display:flex; align-items:center; gap:12px;">
            <div onclick="document.getElementById('bug-image').click()" style="width:48px; height:48px; border-radius:12px; background:#f1f5f9; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#64748b; border:1px dashed #cbd5e1;"><i class="ri-camera-line" style="font-size:20px;"></i></div>
            <input type="file" id="bug-image" accept="image/*" multiple style="display:none;" onchange="updateBugPreview(this)">
            <div id="bug-preview-name" class="bug-i18n" data-zh="上传截图 (支持多选)" data-en="Upload Screenshots (Multiple)" style="font-size:11px; color:#94a3b8; font-weight:700;">上传截图 (支持多选)</div>
        </div>
        <button id="bug-submit-btn" onclick="submitBug()" class="bug-i18n" data-zh="提交反馈" data-en="Submit Feedback" style="width:100%; padding:16px; background:#0f172a; color:white; border-radius:16px; font-weight:800; border:none; cursor:pointer;">提交反馈</button>
        <button onclick="toggleBugModal()" style="position:absolute; top:24px; right:24px; border:none; background:none; cursor:pointer; color:#94a3b8;"><i class="ri-close-line" style="font-size:20px;"></i></button>
    </div>
</div>
<script>
    function updateBugPreview(i) {
        var l = document.getElementById('bug-preview-name');
        var lang = localStorage.getItem('lang') || 'zh';
        if (i.files && i.files.length > 0) { 
            l.innerText = (lang === 'en' ? "Selected: " : "已选择: ") + i.files.length + (lang === 'en' ? " images" : " 张图片");
            l.style.color = "#3b82f6"; 
        }
    }
    function toggleBugModal() {
        var m = document.getElementById('bug-modal');
        var isHidden = m.style.display === 'none';
        m.style.display = isHidden ? 'flex' : 'none';
        if(isHidden) {
            var lang = localStorage.getItem('lang') || 'zh';
            document.querySelectorAll('.bug-i18n').forEach(function(el){ el.innerText = el.getAttribute('data-' + lang); });
            document.querySelectorAll('.bug-i18n-ph').forEach(function(el){ el.placeholder = el.getAttribute('data-' + lang + '-ph'); });
        }
    }
    async function submitBug() {
        var btn = document.getElementById('bug-submit-btn');
        var content = document.getElementById('bug-content').value.trim();
        var fileInput = document.getElementById('bug-image');
        var lang = localStorage.getItem('lang') || 'zh';
        if(!content) return;
        btn.disabled = true; btn.innerText = "...";
        var fd = new FormData();
        fd.append('content', content);
        fd.append('page_url', window.location.href);
        fd.append('device_info', navigator.userAgent);
        for(var i=0; i<fileInput.files.length; i++) { fd.append('image', fileInput.files[i]); }
        try {
            var r = await fetch('/support/report_bug', { method: 'POST', body: fd });
            if(r.ok) { alert(lang === 'en' ? "Success!" : "反馈已提交"); toggleBugModal(); }
            else { alert("Error"); }
        } catch(e) { alert("Network Error"); }
        finally { btn.disabled = false; btn.innerText = "提交反馈"; }
    }
</script>
`;

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      const user = parseUserFromCookie(request.headers.get("Cookie"));

      if (path === '/' || path === '/index.html') {
        return new Response(renderIndex(user), { headers: { "Content-Type": "text/html;charset=UTF-8" } });
      }
      if (path === '/login' || path === '/login.html') {
        if (user) return Response.redirect(url.origin + "/", 302);
        return new Response(renderLogin(), { headers: { "Content-Type": "text/html;charset=UTF-8" } });
      }
      if (path === '/profile') {
        if (!user) return Response.redirect(url.origin + "/login", 302);
        return new Response(renderProfile(user), { headers: { "Content-Type": "text/html;charset=UTF-8" } });
      }
      if (path === '/logout') {
        const response = Response.redirect(url.origin + "/login", 302);
        response.headers.append("Set-Cookie", "auth_token=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly");
        return response;
      }
      return await proxyToBackend(request, BACKEND_URL, env);
    } catch (e) {
      return new Response(`⚠️ Gateway Error: ${e.message}`, { status: 500 });
    }
  }
};

function parseUserFromCookie(cookieHeader) {
  if (!cookieHeader) return null;
  try {
    const token = cookieHeader.split('; ').find(row => row.trim().startsWith('auth_token='))?.split('=')[1];
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return { 
      uid: payload.uid, username: payload.username || ("User_" + payload.uid), 
      role: payload.role || 'free', avatar: payload.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${payload.uid}`
    };
  } catch (e) { return null; }
}

async function proxyToBackend(request, backendUrl, env) {
  const url = new URL(request.url);
  const targetUrl = backendUrl + url.pathname + url.search;
  const newHeaders = new Headers();
  for (const [key, value] of request.headers.entries()) {
    const k = key.toLowerCase();
    if (k !== 'host' && k !== 'cf-connecting-ip' && k !== 'content-length') newHeaders.append(key, value);
  }
  const user = parseUserFromCookie(request.headers.get("Cookie"));
  if (user) { newHeaders.set("X-User-Id", user.uid.toString()); newHeaders.set("X-User-Role", user.role); }
  if (env && env.GATEWAY_SECRET) newHeaders.set("X-Gateway-Secret", env.GATEWAY_SECRET);
  const body = (request.method !== 'GET' && request.method !== 'HEAD') ? await request.arrayBuffer() : null;
  return fetch(new Request(targetUrl, { method: request.method, headers: newHeaders, body: body, redirect: 'follow' }));
}

/**
 * 渲染首页 (对应 frontend/index.html)
 */
function renderIndex(user) {
    const userHtml = user ? `
    <div class="flex items-center gap-2 p-1.5 pr-4 rounded-full bg-white border border-gray-100 shadow-sm cursor-pointer hover:bg-slate-50 transition-all" onclick="toggleUserMenu()">
        <img src="${user.avatar}" class="w-8 h-8 rounded-full object-cover">
        <span class="text-sm font-bold text-slate-700 hidden md:inline">${user.username}</span>
        <i class="ri-arrow-down-s-line text-slate-400"></i>
    </div>
    <div id="userMenu" class="absolute right-0 mt-3 w-48 bg-white rounded-2xl shadow-2xl border border-gray-100 opacity-0 invisible transition-all p-2 z-50 transform origin-top-right">
        <div class="px-4 py-2 border-b border-gray-50 mb-1 text-[10px] font-black text-blue-500 uppercase tracking-widest">${user.role.toUpperCase()} MEMBER</div>
        <a href="/profile" class="flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-blue-50 hover:text-blue-600 rounded-xl transition no-underline"><i class="ri-user-settings-fill"></i> 个人中心</a>
        <button onclick="location.href='/logout'" class="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-red-500 hover:bg-red-50 rounded-xl transition text-left border-0 bg-transparent"><i class="ri-logout-box-fill"></i> 退出登录</button>
    </div>` : `<a href="/login" class="px-6 py-2.5 bg-slate-900 text-white rounded-full text-sm font-bold shadow-lg">立即登录</a>`;

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>工作台 | 618002.xyz</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/remixicon@3.5.0/fonts/remixicon.css" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Plus Jakarta Sans', sans-serif; background: #f8fafc; color: #1e293b; -webkit-font-smoothing: antialiased; }
        .bg-mesh { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: -1; background: radial-gradient(at 0% 0%, rgba(59,130,246,0.05) 0px, transparent 50%), radial-gradient(at 100% 0%, rgba(139,92,246,0.05) 0px, transparent 50%); }
        .glass-nav { background: rgba(255, 255, 255, 0.85); backdrop-filter: saturate(180%) blur(20px); border-bottom: 1px solid rgba(0,0,0,0.05); }
        .bento-card { background: white; border: 1px solid rgba(226, 232, 240, 0.7); transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); cursor: pointer; }
        .bento-card:hover { transform: translateY(-6px); border-color: #3b82f6; box-shadow: 0 20px 30px -10px rgba(59, 130, 246, 0.15); }
        .lang-switcher { display: flex; gap: 4px; background: #f1f5f9; padding: 4px; border-radius: 100px; }
        .lang-btn { padding: 4px 12px; border-radius: 100px; font-size: 10px; font-weight: 800; cursor: pointer; transition: 0.2s; }
        .lang-btn.active { background: white; color: #3b82f6; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
    </style>
</head>
<body class="antialiased">
  <div class="bg-mesh"></div>
  <nav class="fixed top-0 w-full z-40 glass-nav h-20 flex items-center px-6">
    <div class="max-w-7xl mx-auto w-full flex justify-between items-center">
      <div class="flex items-center gap-4 cursor-pointer" onclick="location.reload()"><div class="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white text-xl font-black">6</div><span class="text-xl font-black tracking-tightest">Hub</span></div>
      <div class="flex items-center gap-6">
        <div class="hidden md:flex relative items-center"><i class="ri-search-2-line absolute left-4 text-slate-400"></i><input type="text" id="globalSearch" placeholder="搜索组件..." class="bg-slate-100/80 border-none rounded-2xl py-2.5 pl-11 pr-6 text-sm w-72 focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all outline-none font-bold"></div>
        <div class="lang-switcher"><div onclick="setLanguage('zh')" id="lang-zh" class="lang-btn">中文</div><div onclick="setLanguage('en')" id="lang-en" class="lang-btn">EN</div></div>
        <div id="user-area" class="relative group">${userHtml}</div>
      </div>
    </div>
  </nav>

  <main class="max-w-7xl mx-auto px-6 pt-36 pb-20">
    <div class="flex flex-col md:flex-row justify-between items-end gap-6 mb-16">
      <div><h1 class="text-5xl font-black text-slate-900 tracking-tighter mb-4 i18n" data-zh="应用矩阵" data-en="Application Matrix">应用矩阵</h1><p class="text-slate-400 font-bold i18n" data-zh="高效数字化工作流。欢迎回到 618002.xyz。" data-en="Efficiency workflow.">高效数字化工作流。</p></div>
      <div class="flex gap-2 p-1.5 bg-white rounded-2xl border border-gray-100 shadow-sm" id="filters">
        <button onclick="filter('all')" id="btn-all" class="px-5 py-2.5 rounded-xl text-xs font-black bg-slate-900 text-white shadow-md transition-all i18n" data-zh="全部" data-en="All">全部</button>
        <button onclick="filter('dev')" id="btn-dev" class="px-5 py-2.5 rounded-xl text-xs font-black text-slate-400 hover:bg-gray-50 transition-all i18n" data-zh="管理" data-en="Admin">管理</button>
        <button onclick="filter('ai')" id="btn-ai" class="px-5 py-2.5 rounded-xl text-xs font-black text-slate-400 hover:bg-gray-50 transition-all i18n" data-zh="AI" data-en="AI">AI</button>
      </div>
    </div>
    <div id="grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8"></div>
    <div id="empty" class="hidden text-center py-32"><div class="text-7xl mb-4">🔍</div><p class="text-slate-400 font-black i18n" data-zh="没有匹配项" data-en="No results">没有匹配项</p></div>
  </main>

  <div id="modal" class="fixed inset-0 z-[100] hidden flex items-center justify-center p-4">
    <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity" onclick="closeModal()"></div>
    <div class="relative bg-white w-full max-w-4xl rounded-[40px] shadow-2xl flex flex-col md:flex-row overflow-hidden border border-gray-100 animate-in zoom-in-95 duration-300">
        <div class="p-12 md:w-1/2 flex flex-col justify-between">
            <div><div class="flex items-center gap-6 mb-10"><div id="modalIcon" class="w-20 h-20 rounded-3xl flex items-center justify-center text-4xl shadow-inner text-white flex-shrink-0 bg-slate-900"></div><h2 id="modalTitle" class="text-4xl font-black text-slate-900 tracking-tighter leading-tight"></h2></div><p id="modalDesc" class="text-slate-500 font-medium text-lg leading-relaxed mb-8"></p></div>
            <button id="launchBtn" class="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-lg shadow-2xl i18n" data-zh="立即进入系统" data-en="Launch">立即进入系统</button>
        </div>
        <div class="p-12 md:w-1/2 bg-slate-50/80 overflow-y-auto max-h-[550px]">
            <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-8 border-b border-gray-100 pb-4 i18n" data-zh="用户评价" data-en="Feedback">用户评价</h3>
            <div id="modalComments" class="space-y-4"></div>
        </div>
        <button onclick="closeModal()" class="absolute top-8 right-8 w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg text-slate-400 hover:text-slate-900 transition-all"><i class="ri-close-line text-2xl"></i></button>
    </div>
  </div>

  <script>
    var currentLang = localStorage.getItem('lang') || 'zh';
    var currentCat = 'all';
    var tools = [
      { id:'stock', title_zh:'元器件管理', title_en:'Inventory', desc_zh:'库存、BOM一体化', desc_en:'Stock & BOM', lDesc_zh:'全方位数字化仓储解决方案。', lDesc_en:'Digital warehouse solution.', icon:'ri-cpu-fill', cat:'dev', color:'bg-blue-600', comments:['BOM解析准确','效率很高'] , url:'/inventory/' },
      { id:'lvgl', title_zh:'LVGL 图像处理', title_en:'LVGL Image', desc_zh:'素材转换中心', desc_en:'Asset Converter', lDesc_zh:'专为 LVGL 嵌入式图形库设计。', lDesc_en:'Image converter for LVGL.', icon:'ri-image-edit-fill', cat:'dev', color:'bg-emerald-600', comments:['效果棒','转换快'] , url:'/lvgl_image/' },
      { id:'ai', title_zh:'AI 识别中心', title_en:'AI Analysis', desc_zh:'视觉物料分析', desc_en:'Visual Analysis', lDesc_zh:'基于大模型识别。', lDesc_en:'AI visual analysis.', icon:'ri-eye-fill', cat:'ai', color:'bg-purple-600', comments:['OCR识别非常快'] , url:'/ai_tools' },
      { id:'admin', title_zh:'系统控制台', title_en:'Admin Panel', desc_zh:'权限与全局日志审计', desc_en:'Auth & Audit', lDesc_zh:'管理员专用指挥中心。', lDesc_en:'Dedicated admin console.', icon:'ri-terminal-box-fill', cat:'dev', color:'bg-slate-800', comments:['日志记录详尽'] , url:'/admin' }
    ];

    function setLanguage(l) {
        currentLang = l; localStorage.setItem('lang', l);
        document.querySelectorAll('.lang-btn').forEach(function(b){ b.classList.toggle('active', b.id === 'lang-' + l); });
        document.querySelectorAll('.i18n').forEach(function(el){ el.innerText = el.getAttribute('data-' + l); });
        apply();
    }

    function filter(c) {
        currentCat = c;
        document.querySelectorAll('#filters button').forEach(function(b){
            var active = b.id === 'btn-'+c;
            b.className = active ? "px-5 py-2.5 rounded-xl text-xs font-black bg-slate-900 text-white shadow-md transition-all" : "px-5 py-2.5 rounded-xl text-xs font-black text-slate-400 hover:bg-gray-50 transition-all";
        });
        apply();
    }

    function apply() {
        var grid = document.getElementById('grid'), empty = document.getElementById('empty');
        var s = document.getElementById('globalSearch').value.toLowerCase();
        var filtered = tools.filter(function(t){
            var matchCat = currentCat === 'all' || t.cat === currentCat;
            var title = (currentLang === 'zh' ? t.title_zh : t.title_en).toLowerCase();
            return matchCat && title.includes(s);
        });
        if(filtered.length === 0) { grid.innerHTML = ''; empty.classList.remove('hidden'); return; }
        empty.classList.add('hidden');
        var html = '';
        for(var i=0; i<filtered.length; i++) {
            var t = filtered[i];
            var title = currentLang === 'zh' ? t.title_zh : t.title_en;
            var desc = currentLang === 'zh' ? t.desc_zh : t.desc_en;
            html += '<div class="bento-card p-10 rounded-[36px] group" onclick="openModal(\''+t.id+'\')">' +
                   '<div class="w-16 h-16 '+t.color+' rounded-2xl flex items-center justify-center text-white text-3xl mb-8 group-hover:scale-110 transition-transform shadow-xl"><i class="'+t.icon+'"></i></div>' +
                   '<h3 class="text-2xl font-black text-slate-900 mb-2 tracking-tight">'+title+'</h3>' +
                   '<p class="text-slate-400 font-bold text-sm leading-relaxed">'+desc+'</p></div>';
        }
        grid.innerHTML = html;
    }

    function openModal(id) {
        var t = tools.find(function(x){ return x.id === id; });
        document.getElementById('modalTitle').innerText = currentLang === 'zh' ? t.title_zh : t.title_en;
        document.getElementById('modalDesc').innerText = currentLang === 'zh' ? t.lDesc_zh : t.lDesc_en;
        document.getElementById('modalIcon').className = "w-20 h-20 rounded-3xl flex items-center justify-center text-4xl shadow-inner text-white " + t.color;
        document.getElementById('modalIcon').innerHTML = '<i class="'+t.icon+'"></i>';
        document.getElementById('launchBtn').onclick = function(){ location.href = t.url; };
        var commentsHtml = '';
        for(var j=0; j<t.comments.length; j++){
            commentsHtml += '<div class="bg-white p-5 rounded-3xl border border-gray-100 text-sm text-slate-600 font-bold shadow-sm">'+t.comments[j]+'</div>';
        }
        document.getElementById('modalComments').innerHTML = commentsHtml;
        document.getElementById('modal').classList.remove('hidden');
    }
    function closeModal(){ document.getElementById('modal').classList.add('hidden'); }
    function toggleUserMenu(){ var m = document.getElementById('userMenu'); if(m){ m.classList.toggle('opacity-0'); m.classList.toggle('invisible'); } }
    
    document.getElementById('globalSearch').addEventListener('input', apply);
    setLanguage(currentLang);
  </script>
  ${BUG_WIDGET_HTML}
</body>
</html>`;
}

/**
 * 渲染登录页 (对应 frontend/login.html)
 */
function renderLogin() {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>身份验证 | 618002.xyz</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/remixicon@3.5.0/fonts/remixicon.css" rel="stylesheet">
    <style>
        body { font-family: 'Plus Jakarta Sans', sans-serif; background: #ffffff; color: #1e293b; }
        .bento-card { background: white; border: 1px solid rgba(226, 232, 240, 0.7); box-shadow: 0 20px 40px rgba(0,0,0,0.05); }
        .btn-dark { background: #0f172a; color: white; transition: all 0.3s ease; }
    </style>
</head>
<body class="flex items-center justify-center min-h-screen">
  <div class="max-w-md w-full p-10 text-center">
    <div class="w-20 h-20 bg-slate-900 text-white rounded-[32px] flex items-center justify-center text-4xl font-black mx-auto mb-10 shadow-2xl cursor-pointer" onclick="location.href='/'">6</div>
    <h1 class="text-4xl font-black mb-4" id="auth-title">身份验证</h1>
    <div class="bento-card p-10 rounded-[40px] text-left">
        <form id="authForm" class="space-y-4">
          <div class="relative">
              <label class="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-1">用户名</label>
              <input type="text" id="username" placeholder="账号" class="w-full mt-2 p-5 rounded-2xl bg-gray-50 border-none outline-none font-black text-sm" required>
              <span id="userStatus" class="absolute right-4 bottom-5 text-[10px] font-bold uppercase tracking-tight"></span>
          </div>
          <div><label class="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-1">密码</label><input type="password" id="password" placeholder="密码" class="w-full mt-2 p-5 rounded-2xl bg-gray-50 border-none outline-none font-black text-sm" required></div>
          <button type="submit" id="subBtn" class="w-full py-5 bg-slate-900 text-white rounded-3xl font-black text-lg shadow-2xl mt-6">立即进入空间</button>
        </form>
    </div>
    <p class="mt-8 text-xs font-black text-slate-300 uppercase tracking-widest"><span id="toggleMsg">还没有注册？</span> <a href="javascript:void(0)" onclick="toggleMode()" id="toggleBtn" class="text-blue-500 underline ml-1">点击切换</a></p>
  </div>
  <script>
    var isLogin = true;
    var userInput = document.getElementById('username');
    var userStatus = document.getElementById('userStatus');

    userInput.addEventListener('input', async function() {
        if (isLogin) { userStatus.innerText = ""; return; }
        var val = userInput.value.trim();
        if (!val) { userStatus.innerText = ""; return; }
        try {
            var r = await fetch('/auth/check_username?username=' + encodeURIComponent(val));
            var d = await r.json();
            userStatus.innerText = d.msg;
            userStatus.className = "absolute right-4 bottom-5 text-[10px] font-bold uppercase tracking-tight " + (d.status === 'success' ? 'text-green-500' : 'text-red-400');
        } catch(e) {}
    });

    function toggleMode() {
        isLogin = !isLogin;
        document.getElementById('auth-title').innerText = isLogin ? '身份验证' : '创建账号';
        document.getElementById('subBtn').innerText = isLogin ? '立即进入空间' : '立即注册账号';
        document.getElementById('toggleMsg').innerText = isLogin ? '还没有注册？' : '已有账号？';
    }

    document.getElementById('authForm').addEventListener('submit', async function(e) {
      e.preventDefault();
      var payload = { username: document.getElementById('username').value, password: document.getElementById('password').value };
      var btn = document.getElementById('subBtn'); btn.disabled = true; btn.innerText = "...";
      try {
        var r = await fetch(isLogin ? '/auth/login' : '/auth/register', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
        if(r.ok) location.href = '/'; 
        else { var d = await r.json(); alert(d.error || "认证失败"); btn.disabled = false; btn.innerText = isLogin?"进入":"注册"; }
      } catch(e) { alert("超时"); btn.disabled = false; }
    });
  </script>
  ${BUG_WIDGET_HTML}
</body>
</html>`;
}

/**
 * 渲染个人中心 (对应 frontend/profile.html)
 */
function renderProfile(user) {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>个人中心 | 618002.xyz</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/remixicon@3.5.0/fonts/remixicon.css" rel="stylesheet">
    <style>
        body { font-family: 'Plus Jakarta Sans', sans-serif; background: #f8fafc; color: #1e293b; }
        .glass-nav { background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(20px); border-bottom: 1px solid rgba(0,0,0,0.05); }
        .bento-card { background: white; border: 1px solid rgba(226, 232, 240, 0.7); border-radius: 40px; }
    </style>
</head>
<body class="bg-[#f8fafc] pt-24 px-6">
  <nav class="fixed top-0 w-full z-40 glass-nav h-20 flex items-center px-6 left-0">
    <div class="max-w-5xl mx-auto w-full flex items-center gap-4">
        <button onclick="history.back()" class="w-10 h-10 bg-white rounded-2xl flex items-center justify-center border border-gray-100 shadow-sm hover:bg-gray-50 transition cursor-pointer"><i class="ri-arrow-left-s-line text-xl"></i></button>
        <h1 class="text-xl font-black">账户中心</h1>
    </div>
  </nav>

  <div class="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-8 mt-10">
    <div class="md:col-span-4 space-y-3">
      <div class="bento-card p-10 text-center relative overflow-hidden">
        <div class="absolute top-0 left-0 w-full h-24 bg-slate-900 opacity-5"></div>
        <div class="relative w-28 h-28 mx-auto z-10 group cursor-pointer" onclick="document.getElementById('avatar-input').click()">
          <img id="u-avatar" src="${user.avatar}" class="w-full h-full rounded-[40px] border-4 border-white shadow-2xl bg-white object-cover">
          <div class="absolute inset-0 bg-black/40 rounded-[40px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all text-white text-2xl"><i class="ri-camera-lens-line"></i></div>
        </div>
        <input type="file" id="avatar-input" class="hidden" accept="image/*" onchange="uploadAvatar(this)">
        <h2 id="u-name" class="text-3xl font-black text-slate-900 mt-6 tracking-tight">${user.username}</h2>
        <div class="mt-8 grid grid-cols-2 gap-4 border-t border-gray-50 pt-8">
          <div><div class="text-2xl font-black text-slate-900" id="stat-days">-</div><div class="text-[10px] text-slate-400 font-black uppercase">入驻天数</div></div>
          <div><div class="text-2xl font-black text-slate-900" id="stat-count">-</div><div class="text-[10px] text-slate-400 font-black uppercase">响应次数</div></div>
        </div>
      </div>
      <div class="bento-card p-2 rounded-[32px] space-y-1">
        <button onclick="switchTab('main')" id="btn-tab-main" class="w-full flex items-center gap-4 px-6 py-4 text-sm font-black bg-slate-900 text-white rounded-2xl shadow-xl">资源概览</button>
        <button onclick="switchTab('settings')" id="btn-tab-settings" class="w-full flex items-center gap-4 px-6 py-4 text-sm font-black text-slate-500 hover:bg-gray-50 rounded-2xl transition">安全设置</button>
        <button onclick="location.href='/logout'" class="w-full flex items-center gap-4 px-6 py-4 text-sm font-black text-red-500 hover:bg-red-50 rounded-2xl transition text-left border-0 bg-transparent">退出登录</button>
      </div>
    </div>

    <div class="md:col-span-8">
      <div id="tab-main" class="space-y-6">
        <div class="bento-card p-12 rounded-[40px]">
          <h3 class="font-black text-slate-900 mb-10 text-xl flex items-center gap-3"><i class="ri-bar-chart-2-fill text-blue-500"></i> 数据配额消耗</h3>
          <div class="space-y-10" id="quota-container">
            <div>
              <div class="flex justify-between text-xs font-black mb-3 text-slate-400 uppercase tracking-widest"><span>存储空间</span><span id="val-storage">0 / 500</span></div>
              <div class="w-full h-2 bg-gray-100 rounded-full overflow-hidden shadow-inner"><div id="bar-storage" class="h-full bg-blue-500 w-0 transition-all duration-1000 shadow-lg shadow-blue-200"></div></div>
            </div>
          </div>
        </div>
        <div class="bento-card p-12 rounded-[40px]"><h3 class="font-black text-slate-900 mb-8 text-xl tracking-tight">最近动态</h3><div id="activity-list" class="space-y-4"></div></div>
      </div>

      <div id="tab-settings" class="hidden bento-card p-12 rounded-[40px]">
        <h3 class="font-black text-slate-900 mb-10 text-xl flex items-center gap-3">账户安全设置</h3>
        <div class="space-y-6 text-left">
          <div><label class="text-[10px] font-black text-slate-400 uppercase">修改用户名</label><input type="text" id="new-username" placeholder="留空不修改" class="w-full mt-2 p-5 rounded-2xl bg-gray-50 border-none outline-none font-black text-sm"></div>
          <div><label class="text-[10px] font-black text-slate-400 uppercase">重置密码</label><input type="password" id="new-password" placeholder="留空保持当前" class="w-full mt-2 p-5 rounded-2xl bg-gray-50 border-none outline-none font-black text-sm"></div>
          <button onclick="updateAccount()" id="saveBtn" class="w-full py-5 bg-slate-900 text-white rounded-2xl font-black shadow-2xl mt-4">确认修改</button>
        </div>
      </div>
    </div>
  </div>

  <script>
    function switchTab(t) {
      document.getElementById('tab-main').classList.toggle('hidden', t!=='main');
      document.getElementById('tab-settings').classList.toggle('hidden', t!=='settings');
      document.getElementById('btn-tab-main').className = (t==='main'?'w-full flex items-center gap-4 px-6 py-4 text-sm font-black bg-slate-900 text-white rounded-2xl shadow-xl':'w-full flex items-center gap-4 px-6 py-4 text-sm font-black text-slate-500 hover:bg-gray-50 rounded-2xl');
      document.getElementById('btn-tab-settings').className = (t==='settings'?'w-full flex items-center gap-4 px-6 py-4 text-sm font-black bg-slate-900 text-white rounded-2xl shadow-xl':'w-full flex items-center gap-4 px-6 py-4 text-sm font-black text-slate-500 hover:bg-gray-50 rounded-2xl');
    }
    async function sync() {
      try {
        var r = await fetch('/auth/profile_api'); var d = await r.json();
        if (d.success) {
          document.getElementById('stat-days').innerText = d.stats.days || 1;
          document.getElementById('stat-count').innerText = d.stats.total_calls || 0;
          document.getElementById('val-storage').innerText = d.stats.storage_used + ' / ' + d.stats.storage_limit;
          document.getElementById('bar-storage').style.width = (d.stats.storage_used/d.stats.storage_limit*100) + '%';
          var actHtml = '';
          for(var k=0; k<d.activities.length; k++){
            var a = d.activities[k];
            actHtml += '<div class="flex items-center gap-5 p-5 bg-gray-50/50 rounded-[28px] border border-transparent hover:border-gray-100 transition shadow-sm">' +
                   '<div class="w-12 h-12 '+a.bg+' '+a.color+' rounded-2xl flex items-center justify-center text-xl"><i class="'+a.icon+'"></i></div>' +
                   '<div><p class="text-sm font-black text-slate-700">'+a.text+'</p><p class="text-[10px] font-black text-slate-300 uppercase mt-1">'+a.time+'</p></div></div>';
          }
          document.getElementById('activity-list').innerHTML = actHtml;
        }
      } catch(e){}
    }
    async function uploadAvatar(i) {
      if(!i.files[0]) return;
      var f = new FormData(); f.append('file', i.files[0]);
      try {
        var r = await fetch('/auth/upload_avatar', {method:'POST', body:f}); var d = await r.json();
        if(d.success) { document.getElementById('u-avatar').src = d.url; }
      } catch(e) {}
    }
    async function updateAccount() {
      var u = document.getElementById('new-username').value, p = document.getElementById('new-password').value;
      var r = await fetch('/auth/update_profile', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username:u, password:p})});
      var d = await r.json(); if(d.success){ alert("修改成功，请重登"); location.href='/logout'; } else { alert(d.error); }
    }
    sync();
  </script>
  ${BUG_WIDGET_HTML}
</body>
</html>`;
}
