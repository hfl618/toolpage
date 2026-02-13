/**
 * Cloudflare Worker - 618002.xyz 智能网关系统 (v8.1 修复版)
 * 修复内容：
 * 1. 解决 /logout 路径下的 Response.redirect 只读导致 500 错误的问题。
 * 2. 增强 parseUserFromCookie 的容错性，防止非法 Cookie 导致 Crash。
 * 3. 保持所有原有 Bug 反馈及多图上传功能。
 */

const BACKEND_URL = "https://artificial-cordie-toolpage-e43d265d.koyeb.app";

// --- 1. 核心应用配置 ---
const APP_TOOLS = [
  { id:'stock', title_zh:'元器件管理', title_en:'Inventory Management', desc_zh:'库存、BOM、扫码一体化', desc_en:'Stock, BOM, QR integrated', lDesc_zh:'全方位数字化仓储解决方案。支持扫码入库、BOM智能解析、多级库位管理。', lDesc_en:'Full digital warehouse solution.', icon:'ri-cpu-fill', cat:'dev', color:'bg-gradient-to-br from-blue-500 to-indigo-600', comments:['BOM解析准确','效率很高'], url:'/inventory/' },
  { id:'lvgl', title_zh:'LVGL 图像处理', title_en:'LVGL Image Tool', desc_zh:'嵌入式素材转换', desc_en:'Embedded Asset Converter', lDesc_zh:'专为 LVGL 设计的图像资产处理工具。支持高质量缩放、抖动处理及 Alpha 预乘。', lDesc_en:'Professional image converter for LVGL.', icon:'ri-image-edit-fill', cat:'dev', color:'bg-gradient-to-br from-emerald-500 to-teal-600', comments:['转换速度极快','RGB565A8 效果很棒'], url:'/lvgl_image/' },
  { id:'ai', title_zh:'AI 识别中心', title_en:'AI Analysis', desc_zh:'视觉模型物料分析', desc_en:'Visual Model Analysis', lDesc_zh:'基于尖端深度学习模型，支持物料视觉识别、文本信息提取及自动纠错。', lDesc_en:'Advanced AI visual analysis.', icon:'ri-eye-fill', cat:'ai', color:'bg-gradient-to-br from-purple-500 to-pink-600', comments:['识别速度惊人','OCR 准确率很高'], url:'/ai_tools' },
  { id:'admin', title_zh:'系统控制台', title_en:'Admin Panel', desc_zh:'权限与全局日志审计', desc_en:'Auth & Audit logs', lDesc_zh:'管理员专用指挥中心。实时监控系统流量，配置用户权限。', lDesc_en:'Dedicated admin console.', icon:'ri-terminal-box-fill', cat:'dev', color:'bg-gradient-to-br from-slate-700 to-slate-900', comments:['日志审计很详细'], url:'/admin' }
];

// --- 2. Bug 反馈组件 (含帮助文档) ---
const BUG_WIDGET = 
'<!-- Help Button -->' +
'<div id="help-trigger" onclick="toggleHelpModal()" style="position:fixed; right:24px; bottom:100px; width:48px; height:48px; background:white; border:1px solid #e2e8f0; box-shadow:0 10px 25px -5px rgba(0,0,0,0.1); border-radius:16px; display:flex; align-items:center; justify-content:center; cursor:pointer; z-index:9999; transition:all 0.3s;" onmouseover="this.style.transform=\'scale(1.1)\'" onmouseout="this.style.transform=\'scale(1)\'">' +
  '<i class="ri-book-open-line" style="font-size:20px; color:#64748b;"></i>' +
'</div>' +
'<!-- Bug Report Button -->' +
'<div id="bug-report-trigger" onclick="toggleBugModal()" style="position:fixed; right:24px; bottom:40px; width:48px; height:48px; background:white; border:1px solid #e2e8f0; box-shadow:0 10px 25px -5px rgba(0,0,0,0.1); border-radius:16px; display:flex; align-items:center; justify-content:center; cursor:pointer; z-index:9999; transition:all 0.3s;" onmouseover="this.style.transform=\'scale(1.1)\'" onmouseout="this.style.transform=\'scale(1)\'">' +
  '<i class="ri-bug-2-line" style="font-size:20px; color:#64748b;"></i>' +
'</div>' +
'<!-- Help Modal -->' +
'<div id="help-modal" style="display:none; position:fixed; inset:0; background:rgba(15,23,42,0.4); backdrop-filter:blur(4px); z-index:10000; align-items:center; justify-content:center; padding:16px;">' +
  '<div style="background:white; width:100%; max-width:600px; max-height:80vh; overflow-y:auto; border-radius:32px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.25); padding:32px; position:relative;">' +
    '<div id="help-content" style="font-size:14px; color:#475569; line-height:1.6;"></div>' +
    '<button onclick="toggleHelpModal()" style="position:absolute; top:24px; right:24px; border:none; background:none; cursor:pointer; color:#94a3b8;"><i class="ri-close-line" style="font-size:24px;"></i></button>' +
  '</div>' +
'</div>' +
'<!-- Bug Modal -->' +
'<div id="bug-modal" style="display:none; position:fixed; inset:0; background:rgba(15,23,42,0.4); backdrop-filter:blur(4px); z-index:10000; align-items:center; justify-content:center; padding:16px;">' +
  '<div style="background:white; width:100%; max-width:400px; border-radius:32px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.25); padding:32px; position:relative;">' +
    '<h3 class="bug-i18n" data-zh="报告问题" data-en="Report Issue" style="font-weight:900; font-size:20px; margin-bottom:8px; color:#0f172a;">报告问题</h3>' +
    '<p class="bug-i18n" data-zh="帮助我们改进系统" data-en="Help us improve" style="font-size:10px; color:#94a3b8; font-weight:800; text-transform:uppercase; margin-bottom:24px;">帮助我们改进系统</p>' +
    '<textarea id="bug-content" class="bug-i18n-ph" data-zh-ph="请详细描述您遇到的问题..." data-en-ph="Please describe the issue..." style="width:100%; height:120px; padding:16px; border-radius:16px; background:#f8fafc; border:1px solid #e2e8f0; outline:none; font-size:14px; resize:none; margin-bottom:16px; color:#334155;"></textarea>' +
    '<div style="margin-bottom:16px; display:flex; align-items:center; gap:12px;">' +
      '<div onclick="document.getElementById(\'bug-image\').click()" style="width:48px; height:48px; border-radius:12px; background:#f1f5f9; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#64748b; border:1px dashed #cbd5e1; transition:all 0.2s;" onmouseover="this.style.borderColor=\'#3b82f6\'" onmouseout="this.style.borderColor=\'#cbd5e1\'">' +
        '<i class="ri-camera-line" style="font-size:20px;"></i>' +
      '</div>' +
      '<input type="file" id="bug-image" accept="image/*" multiple style="display:none;" onchange="updateBugPreview(this)">' +
      '<div id="bug-preview-name" class="bug-i18n" data-zh="上传截图 (可多选)" data-en="Upload Screenshot" style="font-size:11px; color:#94a3b8; font-weight:700;">上传截图 (可多选)</div>' +
    '</div>' +
    '<button id="bug-submit-btn" onclick="submitBug()" class="bug-i18n" data-zh="提交反馈" data-en="Submit Feedback" style="width:100%; padding:16px; background:#0f172a; color:white; border-radius:16px; font-weight:800; border:none; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.opacity=\'0.9\'" onmouseout="this.style.opacity=\'1\'">提交反馈</button>' +
    '<button onclick="toggleBugModal()" style="position:absolute; top:24px; right:24px; border:none; background:none; cursor:pointer; color:#94a3b8;"><i class="ri-close-line" style="font-size:24px;"></i></button>' +
  '</div>' +
'</div>' +
'<script>' +
  'async function toggleHelpModal() {' +
    'var m = document.getElementById("help-modal");' +
    'var isHidden = m.style.display === "none";' +
    'm.style.display = isHidden ? "flex" : "none";' +
    'if(isHidden) {' +
      'var lang = localStorage.getItem("lang") || "zh";' +
      'var contentDiv = document.getElementById("help-content");' +
      'contentDiv.innerHTML = \'<div style="text-align:center; padding:20px;"><i class="ri-loader-4-line animate-spin" style="font-size:24px;"></i></div>\';' +
      'try {' +
        'var r = await fetch("/support/help_doc?lang=" + lang + "&path=" + window.location.pathname);' +
        'var d = await r.json();' +
        'if(d.success && d.content) {' +
          'var html = d.content' +
            '.replace(/^# (.*$)/gm, \'<h2 style="font-size:24px; font-weight:900; margin-bottom:16px; border-bottom:4px solid #3b82f6; padding-bottom:8px;">$1</h2>\')' +
            '.replace(/^## (.*$)/gm, \'<h3 style="font-size:18px; font-weight:800; margin-top:24px; margin-bottom:12px; display:flex; align-items:center; gap:8px;"><i class="ri-settings-3-fill" style="color:#3b82f6;"></i> $1</h3>\')' +
            '.replace(/^- (.*$)/gm, \'<div style="margin-left:16px; margin-bottom:8px; display:flex; align-items:start; gap:8px;"><div style="width:6px; height:6px; border-radius:50%; background:#60a5fa; margin-top:8px; flex-shrink:0;"></div><span style="font-weight:700; color:#475569;">$1</span></div>\')' +
            '.replace(/^---$/gm, \'<hr style="margin:24px 0; border:none; border-top:1px solid #e2e8f0;">\')' +
            '.replace(/\\*(.*?)\\*/g, \'<i style="color:#94a3b8; font-size:12px;">$1</i>\')' +
            '.replace(/`(.*?)`/g, \'<code style="background:#eff6ff; color:#2563eb; padding:2px 6px; border-radius:6px; font-family:monospace; font-size:12px; font-weight:900;">$1</code>\');' +
          'contentDiv.innerHTML = html;' +
        '} else { contentDiv.innerHTML = \'<div style="text-align:center; padding:20px; color:#94a3b8;">No docs</div>\'; }' +
      '} catch(e) { contentDiv.innerHTML = "Error"; }' +
    '}' +
  '}' +
  'function updateBugPreview(i) {' +
    'var l = document.getElementById("bug-preview-name");' +
    'var lang = localStorage.getItem("lang") || "zh";' +
    'if (i.files && i.files.length > 0) {' +
      'l.innerText = (lang === "en" ? "Selected: " : "已选择: ") + i.files.length + (lang === "en" ? " images" : " 张图片");' +
      'l.style.color = "#3b82f6";' +
    '}' +
  '}' +
  'function toggleBugModal() {' +
    'var m = document.getElementById("bug-modal");' +
    'var isHidden = m.style.display === "none";' +
    'm.style.display = isHidden ? "flex" : "none";' +
    'if(isHidden) {' +
      'var lang = localStorage.getItem("lang") || "zh";' +
      'document.querySelectorAll(".bug-i18n").forEach(function(el){ el.innerText = el.getAttribute("data-" + lang); });' +
      'document.querySelectorAll(".bug-i18n-ph").forEach(function(el){ el.placeholder = el.getAttribute("data-" + lang + "-ph"); });' +
    '}' +
  '}' +
  'async function submitBug() {' +
    'var btn = document.getElementById("bug-submit-btn");' +
    'var content = document.getElementById("bug-content").value.trim();' +
    'var fileInput = document.getElementById("bug-image");' +
    'if(!content) return alert("Please enter content");' +
    'btn.disabled = true; btn.innerText = "...";' +
    'var fd = new FormData();' +
    'fd.append("content", content);' +
    'fd.append("page_url", window.location.href);' +
    'fd.append("device_info", navigator.userAgent);' +
    'if(fileInput.files.length > 0) {' +
        'for(var i=0; i<fileInput.files.length; i++) { fd.append("image", fileInput.files[i]); }' +
    '}' +
    'try {' +
      'var r = await fetch("/support/report_bug", { method: "POST", body: fd });' +
      'if(r.ok) { alert("反馈已收到 / Report Sent"); toggleBugModal(); document.getElementById("bug-content").value=""; }' +
      'else { alert("提交失败 / Failed"); }' +
    '} catch(e) { alert("网络错误 / Network Error"); }' +
    'finally { btn.disabled = false; btn.innerText = "提交反馈"; }' +
  '}' +
'</script>';

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      let user = null;
      try { user = parseUserFromCookie(request.headers.get("Cookie")); } catch(e) {}

      // 路由 1: 首页
      if (path === '/' || path === '/index.html') {
        return new Response(renderIndex(user), { headers: { "Content-Type": "text/html;charset=UTF-8" } });
      }
      
      // 路由 2: 登录页
      if (path === '/login' || path === '/login.html') {
        if (user) return Response.redirect(url.origin + "/", 302);
        return new Response(renderLogin(), { headers: { "Content-Type": "text/html;charset=UTF-8" } });
      }

      // 路由 3: 个人中心
      if (path === '/profile') {
        if (!user) return Response.redirect(url.origin + "/login", 302);
        return new Response(renderProfile(user), { headers: { "Content-Type": "text/html;charset=UTF-8" } });
      }

      // 路由 4: 退出 (核心修复点：手动构建 Response 以携带 Set-Cookie)
      if (path === '/logout') {
        return new Response(null, {
          status: 302,
          headers: {
            "Location": url.origin + "/login",
            "Set-Cookie": "auth_token=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax"
          }
        });
      }
      
      // 路由 5: 后端转发
      return await proxyToBackend(request, BACKEND_URL, env);

    } catch (e) {
      return new Response("Gateway Error: " + e.message, { status: 500 });
    }
  }
};

// --- 辅助函数 (增强型) ---

function parseUserFromCookie(cookieHeader) {
  if (!cookieHeader) return null;
  const tokenRow = cookieHeader.split('; ').find(row => row.trim().startsWith('auth_token='));
  if (!tokenRow) return null;
  const token = tokenRow.split('=')[1];
  if (!token || token.split('.').length < 3) return null;

  try {
    // 增加 base64 的鲁棒性替换
    const base64Payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64Payload).split('').map(c => 
        '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
    ).join(''));
    
    const payload = JSON.parse(jsonPayload);
    const seed = payload.username || payload.uid || '1';
    return { 
      uid: payload.uid, 
      username: payload.username || ("User_" + payload.uid), 
      role: payload.role || 'free',
      avatar: payload.avatar || "https://api.dicebear.com/7.x/avataaars/svg?seed=" + seed
    };
  } catch(e) {
    console.error("Cookie Parse Error:", e);
    return null;
  }
}

async function proxyToBackend(request, backendUrl, env) {
  const url = new URL(request.url);
  const targetUrl = backendUrl + url.pathname + url.search;
  const newHeaders = new Headers();
  for (const [key, value] of request.headers.entries()) {
    const k = key.toLowerCase();
    if (!['host', 'cf-connecting-ip', 'cf-ipcountry', 'content-length', 'accept-encoding'].includes(k)) {
      newHeaders.append(key, value);
    }
  }
  const user = parseUserFromCookie(request.headers.get("Cookie"));
  if (user) { 
    newHeaders.set("X-User-Id", user.uid.toString()); 
    newHeaders.set("X-User-Role", user.role); 
  }
  if (env && env.GATEWAY_SECRET) newHeaders.set("X-Gateway-Secret", env.GATEWAY_SECRET);
  
  // 保持流式读取以支持大文件上传
  const body = (request.method !== 'GET' && request.method !== 'HEAD') ? await request.arrayBuffer() : null;
  return fetch(new Request(targetUrl, { method: request.method, headers: newHeaders, body: body, redirect: 'follow' }));
}

// =================================================================
// 页面渲染函数 (保持原有样式不变)
// =================================================================

function renderIndex(user) {
    const toolsJson = JSON.stringify(APP_TOOLS);
    let userHtml = '';
    if (user) {
        userHtml = 
        '<div class="flex items-center gap-2 p-1.5 pr-4 rounded-full bg-white border border-gray-100 shadow-sm cursor-pointer hover:bg-slate-50 transition-all" onclick="toggleUserMenu()">' +
            '<img src="' + user.avatar + '" class="w-8 h-8 rounded-full object-cover">' +
            '<span class="text-sm font-bold text-slate-700 hidden md:inline">' + user.username + '</span>' +
            '<i class="ri-arrow-down-s-line text-slate-400"></i>' +
        '</div>' +
        '<div id="userMenu" class="absolute right-0 mt-3 w-48 bg-white rounded-2xl shadow-2xl border border-gray-100 opacity-0 invisible transition-all p-2 z-50 transform origin-top-right">' +
            '<div class="px-4 py-2 border-b border-gray-50 mb-1 text-[10px] font-black text-blue-500 uppercase tracking-widest">' + user.role.toUpperCase() + ' MEMBER</div>' +
            '<a href="/profile" class="flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-blue-50 hover:text-blue-600 rounded-xl transition no-underline"><i class="ri-user-settings-fill"></i> <span class="i18n" data-zh="个人中心" data-en="Profile">个人中心</span></a>' +
            '<button onclick="location.href=\'/logout\'" class="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-red-500 hover:bg-red-50 rounded-xl transition text-left border-0 bg-transparent"><i class="ri-logout-box-fill"></i> <span class="i18n" data-zh="退出登录" data-en="Logout">退出登录</span></button>' +
        '</div>';
    } else {
        userHtml = '<a href="/login" class="px-6 py-2.5 btn-dark rounded-full text-sm font-bold shadow-lg i18n" data-zh="立即登录" data-en="LOGIN">立即登录</a>';
    }

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hub | 618002.xyz</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/remixicon@3.5.0/fonts/remixicon.css" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Plus Jakarta Sans', sans-serif; background: #f8fafc; color: #1e293b; }
        .bg-mesh { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: -1; background: radial-gradient(at 0% 0%, rgba(59,130,246,0.05) 0px, transparent 50%), radial-gradient(at 100% 0%, rgba(139,92,246,0.05) 0px, transparent 50%); }
        .glass-nav { background: rgba(255, 255, 255, 0.85); backdrop-filter: saturate(180%) blur(20px); border-bottom: 1px solid rgba(0,0,0,0.05); }
        .bento-card { background: white; border: 1px solid rgba(226, 232, 240, 0.7); transition: all 0.4s; }
        .bento-card:hover { transform: translateY(-6px); border-color: #3b82f6; box-shadow: 0 20px 30px -10px rgba(59, 130, 246, 0.15); }
        .btn-dark { background: #0f172a; color: white; transition: all 0.3s ease; }
        .lang-btn.active { background: white; color: #3b82f6; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
    </style>
</head>
<body class="antialiased">
  <nav class="fixed top-0 w-full z-40 glass-nav h-20 flex items-center px-6">
    <div class="max-w-7xl mx-auto w-full flex justify-between items-center">
      <div class="flex items-center gap-4 cursor-pointer" onclick="location.reload()">
        <div class="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white text-xl font-black">6</div>
        <span class="text-xl font-black tracking-tightest">Hub</span>
      </div>
      <div class="flex items-center gap-6">
        <div class="hidden md:flex relative items-center">
          <i class="ri-search-2-line absolute left-4 text-slate-400"></i>
          <input type="text" id="globalSearch" placeholder="Search..." class="bg-slate-100/80 border-none rounded-2xl py-2.5 pl-11 pr-6 text-sm w-72 focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all outline-none font-bold text-slate-600">
        </div>
        <div class="flex gap-1 bg-slate-100 p-1 rounded-full">
            <div onclick="setLanguage('zh')" id="lang-zh" class="px-3 py-1 rounded-full text-[10px] font-black cursor-pointer transition-all lang-btn">中文</div>
            <div onclick="setLanguage('en')" id="lang-en" class="px-3 py-1 rounded-full text-[10px] font-black cursor-pointer transition-all lang-btn">EN</div>
        </div>
        <div id="user-area" class="relative group">${userHtml}</div>
      </div>
    </div>
  </nav>

  <main class="max-w-7xl mx-auto px-6 pt-36 pb-20">
    <div class="flex flex-col md:flex-row justify-between items-end gap-6 mb-16">
      <div>
        <h1 class="text-5xl font-black text-slate-900 tracking-tighter mb-4 i18n" data-zh="应用矩阵" data-en="Apps Matrix">应用矩阵</h1>
        <p class="text-slate-400 font-bold i18n" data-zh="高效数字化工作流。" data-en="High-efficiency digital workflow.">高效数字化工作流。</p>
      </div>
      <div class="flex gap-2 p-1.5 bg-white rounded-2xl border border-gray-100 shadow-sm" id="filters">
        <button onclick="filter('all')" id="btn-all" class="px-5 py-2.5 rounded-xl text-xs font-black bg-slate-900 text-white shadow-md transition-all i18n" data-zh="全部" data-en="All">全部</button>
        <button onclick="filter('dev')" id="btn-dev" class="px-5 py-2.5 rounded-xl text-xs font-black text-slate-400 hover:bg-gray-50 transition-all i18n" data-zh="管理" data-en="Admin">管理</button>
        <button onclick="filter('ai')" id="btn-ai" class="px-5 py-2.5 rounded-xl text-xs font-black text-slate-400 hover:bg-gray-50 transition-all i18n" data-zh="人工智能" data-en="AI">人工智能</button>
      </div>
    </div>
    <div id="grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8"></div>
    <div id="empty" class="hidden text-center py-32"><div class="text-7xl mb-4">🔍</div><p class="text-slate-400 font-black">No results found.</p></div>
  </main>

  <div id="modal" class="fixed inset-0 z-[100] hidden flex items-center justify-center p-4">
    <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onclick="closeModal()"></div>
    <div class="relative bg-white w-full max-w-4xl rounded-[40px] shadow-2xl flex flex-col md:flex-row overflow-hidden border border-gray-100 animate-in zoom-in-95 duration-200">
        <div class="p-12 md:w-1/2 flex flex-col justify-between">
            <div>
                <div class="flex items-center gap-6 mb-10">
                    <div id="modalIcon" class="w-20 h-20 rounded-3xl flex items-center justify-center text-4xl shadow-inner text-white flex-shrink-0 bg-slate-900"></div>
                    <h2 id="modalTitle" class="text-4xl font-black text-slate-900 tracking-tighter"></h2>
                </div>
                <p id="modalDesc" class="text-slate-500 font-medium text-lg leading-relaxed mb-8"></p>
            </div>
            <button id="launchBtn" class="w-full py-5 btn-dark rounded-2xl font-black text-lg shadow-2xl i18n" data-zh="立即进入系统" data-en="Launch System">立即进入系统</button>
        </div>
        <div class="p-12 md:w-1/2 bg-slate-50/80 overflow-y-auto max-h-[550px]">
            <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-8 border-b border-gray-100 pb-4 i18n" data-zh="系统反馈" data-en="Feedback">系统反馈</h3>
            <div id="modalComments" class="space-y-4"></div>
        </div>
        <button onclick="closeModal()" class="absolute top-8 right-8 w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg text-slate-400 hover:text-slate-900 transition-colors"><i class="ri-close-line text-2xl"></i></button>
    </div>
  </div>

  <script>
    const tools = ${toolsJson};
    let currentLang = localStorage.getItem('lang') || 'zh';
    let currentCat = 'all';

    function setLanguage(lang) {
        currentLang = lang;
        localStorage.setItem('lang', lang);
        document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('lang-' + lang).classList.add('active');
        document.querySelectorAll('.i18n').forEach(el => { 
            const txt = el.getAttribute('data-' + lang);
            if(txt) el.innerText = txt;
        });
        apply();
    }

    function render(list) {
      const g = document.getElementById('grid'), e = document.getElementById('empty');
      if(list.length === 0) { g.innerHTML=''; e.classList.remove('hidden'); return; }
      e.classList.add('hidden');
      
      g.innerHTML = list.map(t => 
        '<div class="bento-card p-10 rounded-[36px] cursor-pointer group relative overflow-hidden" onclick="openModal(\\'' + t.id + '\\')">' +
          '<div class="w-16 h-16 ' + t.color + ' rounded-2xl flex items-center justify-center text-white text-3xl mb-8 shadow-xl group-hover:scale-110 transition-transform"><i class="' + t.icon + '"></i></div>' +
          '<h3 class="text-2xl font-black text-slate-900 mb-2 tracking-tight">' + (currentLang==='zh'?t.title_zh:t.title_en) + '</h3>' +
          '<p class="text-slate-400 font-bold text-sm leading-relaxed">' + (currentLang==='zh'?t.desc_zh:t.desc_en) + '</p>' +
        '</div>'
      ).join('');
    }

    function filter(c) {
      currentCat = c;
      ['all','dev','ai'].forEach(id => {
        const btn = document.getElementById('btn-'+id);
        if(id === c) btn.className = "px-5 py-2.5 rounded-xl text-xs font-black bg-slate-900 text-white shadow-md transition-all";
        else btn.className = "px-5 py-2.5 rounded-xl text-xs font-black text-slate-400 hover:bg-gray-50 transition-all";
      });
      apply();
    }

    function apply() {
      const s = document.getElementById('globalSearch').value.toLowerCase();
      const f = tools.filter(t => {
          const matchCat = (currentCat==='all' || t.cat===currentCat);
          const title = (currentLang==='zh'?t.title_zh:t.title_en).toLowerCase();
          return matchCat && title.includes(s);
      });
      render(f);
    }

    function openModal(id) {
      const t = tools.find(x => x.id === id);
      document.getElementById('modalTitle').innerText = currentLang==='zh'?t.title_zh:t.title_en;
      document.getElementById('modalDesc').innerText = currentLang==='zh'?t.lDesc_zh:t.lDesc_en;
      document.getElementById('modalIcon').className = "w-20 h-20 rounded-3xl flex items-center justify-center text-4xl shadow-inner text-white flex-shrink-0 " + t.color;
      document.getElementById('modalIcon').innerHTML = '<i class="' + t.icon + '"></i>';
      document.getElementById('launchBtn').onclick = () => location.href = t.url;
      
      const commentsHtml = t.comments.map(c => 
        '<div class="bg-white p-5 rounded-3xl border border-gray-100 text-sm text-slate-600 shadow-sm font-bold">' +
          '<i class="ri-chat-smile-fill text-blue-100 mr-2"></i>' + c +
        '</div>'
      ).join('');
      document.getElementById('modalComments').innerHTML = commentsHtml;
      
      document.getElementById('modal').classList.remove('hidden');
    }

    function closeModal() { document.getElementById('modal').classList.add('hidden'); }
    function toggleUserMenu() { const m = document.getElementById('userMenu'); if(m) { m.classList.toggle('invisible'); m.classList.toggle('opacity-0'); } }

    document.getElementById('globalSearch').addEventListener('input', apply);
    setLanguage(currentLang);
  </script>` + BUG_WIDGET + `</body>
</html>`;
}

function renderLogin() {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>身份验证 | 618002.xyz</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/remixicon@3.5.0/fonts/remixicon.css" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Plus Jakarta Sans', sans-serif; background: #fff; color: #1e293b; }
        .bento-card { background: white; border: 1px solid rgba(226, 232, 240, 0.7); box-shadow: 0 20px 40px rgba(0,0,0,0.05); }
        .btn-dark { background: #0f172a; color: white; transition: all 0.3s ease; }
        .toast { position:fixed; bottom:30px; left:50%; transform:translateX(-50%); background:#0f172a; color:white; padding:12px 28px; border-radius:100px; font-weight:600; animation:slideUp 0.4s; z-index:9999; }
        @keyframes slideUp { from { transform: translateY(40px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .fade-in { animation: fadeIn 0.5s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    </style>
</head>
<body class="flex items-center justify-center min-h-screen">
  <div class="max-w-md w-full p-10 text-center fade-in">
    <div class="w-20 h-20 bg-slate-900 text-white rounded-[32px] flex items-center justify-center text-4xl font-black mx-auto mb-10 shadow-2xl shadow-slate-200 cursor-pointer" onclick="location.href='/'">6</div>
    <h1 class="text-4xl font-black text-slate-900 tracking-tighter mb-4">身份验证</h1>
    <p class="text-slate-400 font-bold mb-12">请输入您的凭证以访问 618002 数字化 Hub</p>
    
    <div class="bento-card p-10 rounded-[40px] text-left">
        <form id="authForm" class="space-y-4">
          <div class="relative">
              <label class="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-1">用户名</label>
              <input type="text" id="username" class="w-full mt-2 p-5 rounded-2xl bg-gray-50 border-none outline-none focus:ring-4 focus:ring-blue-500/10 transition-all font-black text-sm" required>
              <span id="userStatus" class="absolute right-4 bottom-5 text-[10px] font-bold uppercase tracking-tight"></span>
          </div>
          <div><label class="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-1">访问密码</label><input type="password" id="password" class="w-full mt-2 p-5 rounded-2xl bg-gray-50 border-none outline-none focus:ring-4 focus:ring-blue-500/10 transition-all font-black text-sm" required></div>
          <button type="submit" id="subBtn" class="w-full py-5 btn-dark rounded-3xl font-black text-lg shadow-2xl shadow-slate-200 mt-6">立即进入工作空间</button>
        </form>
    </div>
    <p class="mt-12 text-xs font-black text-slate-300 uppercase tracking-widest">
        <span id="toggleMsg">还没有注册账户?</span> 
        <a href="#" onclick="toggleMode()" id="toggleBtn" class="text-blue-500 hover:underline">点击这里切换</a>
    </p>
  </div>
  <script>
    let isLogin = true;
    function showToast(m) { const d=document.createElement('div');d.className='toast';d.innerHTML=m;document.body.appendChild(d);setTimeout(()=>d.remove(),3000); }
    
    document.getElementById('username').addEventListener('input', async (e) => {
        if (isLogin) return;
        const val = e.target.value.trim();
        if (!val) { document.getElementById('userStatus').innerText = ""; return; }
        try {
            const r = await fetch('/auth/check_username?username=' + encodeURIComponent(val));
            const d = await r.json();
            const s = document.getElementById('userStatus');
            s.innerText = d.msg;
            s.className = 'absolute right-4 bottom-5 text-[10px] font-bold uppercase tracking-tight ' + (d.status === 'success' ? 'text-green-500' : 'text-red-400');
        } catch(e) {}
    });

    function toggleMode() {
        isLogin = !isLogin;
        document.getElementById('userStatus').innerText = "";
        document.getElementById('subBtn').innerText = isLogin ? '立即进入工作空间' : '立即创建新账号';
        document.getElementById('toggleMsg').innerText = isLogin ? '还没有注册账户?' : '已有账号?';
        document.getElementById('toggleBtn').innerText = isLogin ? '点击这里切换' : '返回登录验证';
    }

    document.getElementById('authForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = { username: document.getElementById('username').value, password: document.getElementById('password').value };
      const btn = document.getElementById('subBtn'); btn.disabled = true; btn.innerText = "Processing...";
      try {
        const r = await fetch(isLogin ? '/auth/login' : '/auth/register', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
        if(r.ok) location.href = '/'; 
        else { const d = await r.json(); showToast(d.error || "Failed"); btn.disabled = false; btn.innerText = "Retry"; }
      } catch(e) { showToast("Network Error"); btn.disabled = false; }
    });
  </script>
</body>
</html>`;
}

function renderProfile(user) {
    const role = user.role ? user.role.toUpperCase() : "FREE";
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>个人中心 | 618002.xyz</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/remixicon@3.5.0/fonts/remixicon.css" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Plus Jakarta Sans', sans-serif; background: #f8fafc; color: #1e293b; }
        .bento-card { background: white; border: 1px solid rgba(226, 232, 240, 0.7); transition: all 0.4s; }
        .btn-dark { background: #0f172a; color: white; transition: all 0.3s ease; }
        .toast { position:fixed; bottom:30px; left:50%; transform:translateX(-50%); background:#0f172a; color:white; padding:12px 28px; border-radius:100px; font-weight:600; animation:slideUp 0.4s; z-index:9999; }
        @keyframes slideUp { from { transform: translateY(40px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    </style>
</head>
<body class="bg-[#f8fafc] pt-24">
  <nav class="fixed top-0 w-full z-40 glass-nav h-20 flex items-center px-6" style="background:rgba(255,255,255,0.85);backdrop-filter:blur(20px);">
    <div class="max-w-5xl mx-auto w-full flex justify-between items-center">
      <div class="flex items-center gap-4">
        <button onclick="location.href='/'" class="w-10 h-10 bg-white rounded-2xl flex items-center justify-center border border-gray-100 shadow-sm hover:bg-gray-50 transition cursor-pointer"><i class="ri-arrow-left-s-line text-xl"></i></button>
        <h1 class="text-xl font-black">账户中心</h1>
      </div>
      <div class="px-4 py-1.5 bg-blue-50 text-blue-600 text-[10px] font-black rounded-xl border border-blue-100 uppercase tracking-widest">${role} MEMBER</div>
    </div>
  </nav>

  <div class="max-w-5xl mx-auto px-6 grid grid-cols-1 md:grid-cols-12 gap-8">
    <div class="md:col-span-4 space-y-3">
      <div class="bento-card p-10 text-center relative overflow-hidden rounded-[40px]">
        <div class="relative w-28 h-28 mx-auto z-10 group cursor-pointer" onclick="document.getElementById('avatar-input').click()">
          <img id="u-avatar" src="${user.avatar}" class="w-full h-full rounded-[40px] border-4 border-white shadow-2xl bg-white object-cover">
          <div class="absolute inset-0 bg-black/40 rounded-[40px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all text-white text-2xl"><i class="ri-camera-lens-line"></i></div>
        </div>
        <input type="file" id="avatar-input" class="hidden" accept="image/*" onchange="uploadAvatar(this)">
        <h2 id="u-name" class="text-3xl font-black text-slate-900 mt-6 tracking-tight">${user.username}</h2>
        <div class="mt-8 grid grid-cols-2 gap-4 border-t border-gray-50 pt-8">
          <div><div class="text-2xl font-black text-slate-900" id="stat-days">-</div><div class="text-[10px] text-slate-400 font-black uppercase">Days</div></div>
          <div><div class="text-2xl font-black text-slate-900" id="stat-count">-</div><div class="text-[10px] text-slate-400 font-black uppercase">Calls</div></div>
        </div>
      </div>
      <div class="bento-card p-2 rounded-[32px] space-y-1">
        <button onclick="switchTab('main')" id="btn-tab-main" class="w-full flex items-center gap-4 px-6 py-4 text-sm font-black bg-slate-900 text-white rounded-2xl shadow-xl shadow-slate-200"><i class="ri-layout-grid-fill"></i> 资源概览</button>
        <button onclick="switchTab('settings')" id="btn-tab-settings" class="w-full flex items-center gap-4 px-6 py-4 text-sm font-black text-slate-500 hover:bg-gray-50 rounded-2xl transition"><i class="ri-shield-keyhole-fill"></i> 安全设置</button>
        <button onclick="location.href='/logout'" class="w-full flex items-center gap-4 px-6 py-4 text-sm font-black text-red-500 hover:bg-red-50 rounded-2xl transition text-left"><i class="ri-logout-circle-fill"></i> 退出登录</button>
      </div>
    </div>

    <div class="md:col-span-8">
      <div id="tab-main" class="space-y-6">
        <div class="bento-card p-12 rounded-[40px]">
          <h3 class="font-black text-slate-900 mb-10 text-xl flex items-center gap-3"><i class="ri-bar-chart-2-fill text-blue-500"></i> 数据配额消耗</h3>
          <div class="space-y-10">
            <div>
              <div class="flex justify-between text-xs font-black mb-3 text-slate-400 uppercase tracking-widest"><span>Storage</span><span id="val-storage" class="text-slate-900 font-black">0 / 500</span></div>
              <div class="w-full h-2 bg-gray-100 rounded-full overflow-hidden shadow-inner"><div id="bar-storage" class="h-full bg-blue-500 w-0 transition-all duration-1000"></div></div>
            </div>
            <div>
              <div class="flex justify-between text-xs font-black mb-3 text-slate-400 uppercase tracking-widest"><span>API Limit</span><span id="val-api" class="text-slate-900 font-black">0 / 50</span></div>
              <div class="w-full h-2 bg-gray-100 rounded-full overflow-hidden shadow-inner"><div id="bar-api" class="h-full bg-indigo-500 w-0 transition-all duration-1000"></div></div>
            </div>
          </div>
        </div>
        <div class="bento-card p-12 rounded-[40px]">
          <h3 class="font-black text-slate-900 mb-8 text-xl tracking-tight">最近动态</h3>
          <div id="activity-list" class="space-y-4"></div>
        </div>
      </div>

      <div id="tab-settings" class="hidden bento-card p-12 rounded-[40px]">
        <h3 class="font-black text-slate-900 mb-10 text-xl flex items-center gap-3"><i class="ri-lock-password-fill text-indigo-500"></i> 账号安全设置</h3>
        <div class="space-y-6 text-left">
          <div class="relative">
              <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">修改用户名</label>
              <input type="text" id="new-username" class="w-full mt-2 p-5 rounded-2xl bg-gray-50 border-none outline-none focus:ring-4 focus:ring-blue-500/10 transition-all font-black text-sm">
          </div>
          <div><label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">重置密码</label><input type="password" id="new-password" class="w-full mt-2 p-5 rounded-2xl bg-gray-50 border-none outline-none focus:ring-4 focus:ring-blue-500/10 transition-all font-black text-sm"></div>
          <button onclick="updateAccount()" id="saveBtn" class="w-full py-5 btn-dark rounded-2xl font-black shadow-2xl mt-4">确认修改</button>
        </div>
      </div>
    </div>
  </div>

  <script>
    function showToast(m) { const d=document.createElement('div');d.className='toast';d.innerHTML=m;document.body.appendChild(d);setTimeout(()=>d.remove(),3000); }
    function switchTab(t) {
      document.getElementById('tab-main').classList.toggle('hidden', t!=='main');
      document.getElementById('tab-settings').classList.toggle('hidden', t!=='settings');
      document.getElementById('btn-tab-main').className = t==='main' ? 'w-full flex items-center gap-4 px-6 py-4 text-sm font-black bg-slate-900 text-white rounded-2xl shadow-xl shadow-slate-200' : 'w-full flex items-center gap-4 px-6 py-4 text-sm font-black text-slate-500 hover:bg-gray-50 rounded-2xl transition';
      document.getElementById('btn-tab-settings').className = t==='settings' ? 'w-full flex items-center gap-4 px-6 py-4 text-sm font-black bg-slate-900 text-white rounded-2xl shadow-xl shadow-slate-200' : 'w-full flex items-center gap-4 px-6 py-4 text-sm font-black text-slate-500 hover:bg-gray-50 rounded-2xl transition';
    }
    
    let allActivities = [];
    let currentPage = 1;
    const pageSize = 5;

    function renderActivities() {
        const list = document.getElementById('activity-list');
        const pager = document.getElementById('activity-pager');
        const info = document.getElementById('page-info');
        if(!allActivities.length) {
            list.innerHTML = '<p class="text-center text-slate-300 py-10">暂无动态记录</p>';
            if(pager) pager.classList.add('hidden');
            return;
        }
        const totalPages = Math.ceil(allActivities.length / pageSize);
        if(pager) pager.classList.toggle('hidden', totalPages <= 1);
        if(info) info.innerText = currentPage + " / " + totalPages;
        const start = (currentPage - 1) * pageSize;
        const pageData = allActivities.slice(start, start + pageSize);
        list.innerHTML = pageData.map(a => 
          '<div class="flex items-center gap-5 p-5 bg-gray-50/50 rounded-[28px] border border-transparent hover:border-gray-100 transition shadow-sm">' +
            '<div class="w-12 h-12 ' + a.bg + ' ' + a.color + ' rounded-2xl flex items-center justify-center text-xl"><i class="' + a.icon + '"></i></div>' +
            '<div><p class="text-sm font-black text-slate-700">' + a.text + '</p>' +
            '<div class="flex items-center gap-2 mt-1"><span class="text-[10px] font-black text-slate-300 uppercase tracking-widest">' + a.time + '</span>' +
            '<span class="w-1 h-1 rounded-full bg-slate-200"></span><span class="text-[10px] font-black text-slate-300 uppercase tracking-widest">' + (a.date||"") + '</span></div></div>' +
          '</div>'
        ).join('');
    }

    function changePage(delta) {
        const totalPages = Math.ceil(allActivities.length / pageSize);
        const newPage = currentPage + delta;
        if (newPage >= 1 && newPage <= totalPages) { currentPage = newPage; renderActivities(); }
    }

    async function sync() {
      try {
        const params = new URLSearchParams(window.location.search);
        const fromVal = params.get('from') || '';
        const r = await fetch('/auth/profile_api?from=' + encodeURIComponent(fromVal));
        const d = await r.json();
        if (d.success) {
          const s = d.stats || {};
          document.getElementById('stat-days').innerText = s.days || 1;
          document.getElementById('stat-count').innerText = s.total_calls || 0;
          
          // 动态渲染配额
          const quotaContainer = document.querySelector('#tab-main .bento-card div.space-y-10');
          if(d.quotas && d.quotas.length > 0) {
              if(d.is_single) {
                  // 单个工具：显示大进度条
                  quotaContainer.className = "space-y-10";
                  quotaContainer.innerHTML = d.quotas.map(q => 
                    '<div>' +
                      '<div class="flex justify-between text-xs font-black mb-3 text-slate-400 uppercase tracking-widest"><span>' + q.label + '</span><span class="text-slate-900 font-black">' + q.used + ' / ' + q.limit + '</span></div>' +
                      '<div class="w-full h-2 bg-gray-100 rounded-full overflow-hidden shadow-inner"><div class="h-full ' + q.color + ' ' + q.shadow + ' transition-all duration-1000" style="width: ' + Math.min(100, (q.used/q.limit)*100) + '%"></div></div>' +
                    '</div>'
                  ).join('');
              } else {
                  // 多个工具：显示 3 列文字卡片
                  quotaContainer.className = "grid grid-cols-1 sm:grid-cols-3 gap-6";
                  quotaContainer.innerHTML = d.quotas.map(q => 
                    '<div class="bg-slate-50 p-6 rounded-3xl border border-gray-100 hover:bg-white hover:shadow-xl transition-all duration-300">' +
                      '<p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">' + q.label + '</p>' +
                      '<p class="text-xl font-black text-slate-900">' + q.used + ' <span class="text-slate-300 text-xs font-bold">/ ' + q.limit + '</span></p>' +
                    '</div>'
                  ).join('');
              }
          }

          if(d.activities) {
             allActivities = d.activities; currentPage = 1; renderActivities();
          }
        }
      } catch(e){}
    }
    async function uploadAvatar(i) {
      if(!i.files[0]) return;
      const f = new FormData(); f.append('file', i.files[0]);
      showToast('Syncing...');
      try {
        const r = await fetch('/auth/upload_avatar', {method:'POST', body:f});
        const d = await r.json();
        if(d.success) { document.getElementById('u-avatar').src = d.url; showToast('Success'); }
      } catch(e) { showToast('Error'); }
    }
    async function updateAccount() {
      const u = document.getElementById('new-username').value, p = document.getElementById('new-password').value;
      if(!u && !p) return showToast('No changes');
      try {
        const r = await fetch('/auth/update_profile', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username:u, password:p})});
        const d = await r.json();
        if(d.success) { showToast('Updated. Relogin...'); setTimeout(()=>location.href='/logout', 1500); }
        else showToast(d.error);
      } catch(e) { showToast('Error'); }
    }
    sync();
  </script>` + BUG_WIDGET + `</body>
</html>`;
}