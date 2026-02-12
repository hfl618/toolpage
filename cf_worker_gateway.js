/**
 * Cloudflare Worker - 618002.xyz 智能网关系统 (v4.9 体验优化版)
 * 修复：个人中心返回按钮逻辑（智能返回上一页，而非强制回首页）
 */

const BACKEND_URL = "https://artificial-cordie-toolpage-e43d265d.koyeb.app";

export default {
  async fetch(request, env) {
    // 🛡️ 全局错误捕获
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      const user = parseUserFromCookie(request.headers.get("Cookie"));

      // 1. 路由：首页
      if (path === '/' || path === '/index.html') {
        return new Response(renderUltraDashboard(user), { headers: { "Content-Type": "text/html;charset=UTF-8" } });
      }
      
      // 2. 路由：个人中心
      if (path === '/profile') {
        if (!user) return Response.redirect(url.origin + "/login", 302);
        return new Response(renderProfilePage(user), { headers: { "Content-Type": "text/html;charset=UTF-8" } });
      }
      
      // 3. 路由：登录页
      if (path === '/login') {
        if (user) return Response.redirect(url.origin + "/", 302);
        return new Response(renderLoginPage(), { headers: { "Content-Type": "text/html;charset=UTF-8" } });
      }

      // 4. 路由：退出登录 (服务端强制清除)
      if (path === '/logout') {
        const response = Response.redirect(url.origin + "/login", 302);
        response.headers.append("Set-Cookie", "auth_token=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly");
        return response;
      }
      
      // 5. 转发 API 和静态资源
      return await proxyToBackend(request, BACKEND_URL, env);

    } catch (e) {
      return new Response(`⚠️ 系统运行异常:\n\n${e.message}\n\n${e.stack}`, { 
        status: 500, 
        headers: { "Content-Type": "text/plain;charset=UTF-8" } 
      });
    }
  }
};

// ==========================================
// 🛠️ 核心逻辑工具
// ==========================================

function parseUserFromCookie(cookieHeader) {
  if (!cookieHeader) return null;
  try {
    const token = cookieHeader.split('; ').find(row => row.startsWith('auth_token='))?.split('=')[1];
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    
    const seed = payload.username || payload.uid || '1';
    return { 
      uid: payload.uid, 
      username: payload.username || ("User_" + payload.uid), 
      role: payload.role || 'free',
      avatar: payload.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`
    };
  } catch (e) { return null; }
}

async function proxyToBackend(request, backendUrl, env) {
  const url = new URL(request.url);
  const targetUrl = backendUrl + url.pathname + url.search;
  
  const newHeaders = new Headers();
  
  for (const [key, value] of request.headers.entries()) {
    const k = key.toLowerCase();
    if (k !== 'host' && k !== 'cf-connecting-ip' && k !== 'content-length') {
      newHeaders.append(key, value);
    }
  }
  
  const user = parseUserFromCookie(request.headers.get("Cookie"));
  if (user) { 
    newHeaders.set("X-User-Id", user.uid.toString()); 
    newHeaders.set("X-User-Role", user.role); 
  }
  
  if (env && env.GATEWAY_SECRET) newHeaders.set("X-Gateway-Secret", env.GATEWAY_SECRET);
  
  return fetch(new Request(targetUrl, { 
    method: request.method, 
    headers: newHeaders, 
    body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.blob() : null, 
    redirect: 'follow' 
  }));
}

// ==========================================
// 🎨 UI 渲染区
// ==========================================

const COMMON_HEAD = `
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<script src="https://cdn.tailwindcss.com"></script>
<link href="https://cdn.jsdelivr.net/npm/remixicon@3.5.0/fonts/remixicon.css" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
    body { font-family: 'Plus Jakarta Sans', sans-serif; background: #f8f9fa; color: #1e293b; -webkit-font-smoothing: antialiased; }
    .glass { background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(12px); border-bottom: 1px solid rgba(226, 232, 240, 0.6); }
    .glass-card { background: white; border: 1px solid rgba(226, 232, 240, 0.8); box-shadow: 0 4px 12px rgba(0,0,0,0.03); border-radius: 24px; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
    .glass-card:hover { border-color: rgba(37, 99, 235, 0.3); transform: translateY(-2px); }
    #toast-container { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); z-index: 9999; pointer-events: none; }
    .toast { pointer-events: auto; background: #1e293b; color: white; padding: 12px 24px; border-radius: 50px; margin-top: 10px; font-size: 14px; font-weight: 500; display: flex; align-items: center; gap: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); animation: slideDown 0.3s ease; }
    @keyframes slideDown { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
</style>
<script>
    function showToast(msg, type='info') {
        const container = document.getElementById('toast-container') || (()=>{const d=document.createElement('div');d.id='toast-container';document.body.appendChild(d);return d;})();
        const el = document.createElement('div'); el.className = 'toast';
        const icon = type==='success'?'ri-checkbox-circle-fill text-green-400':(type==='error'?'ri-error-warning-fill text-red-400':'ri-information-fill text-blue-400');
        el.innerHTML = \`<i class="\${icon} text-lg"></i><span>\${msg}</span>\`;
        container.appendChild(el);
        setTimeout(()=>el.remove(), 3000);
    }
    function logout() { window.location.href = '/logout'; }
</script>
`;

// --- 1. 首页仪表盘 ---
function renderUltraDashboard(user) {
  const userHtml = user ? `
    <div class="relative group">
        <button class="flex items-center gap-3 focus:outline-none p-1 pr-3 rounded-full hover:bg-white/50 transition">
            <img id="nav-avatar" src="${user.avatar}" class="w-9 h-9 rounded-full border-2 border-white shadow-sm object-cover bg-gray-50">
            <div class="text-left hidden md:block">
                <div id="nav-username" class="text-[13px] font-bold text-slate-800 leading-none">${user.username}</div>
                <div id="nav-role" class="text-[9px] font-bold text-blue-600 uppercase tracking-widest mt-1">${user.role} MEMBER</div>
            </div>
            <i class="ri-arrow-down-s-line text-slate-400 text-xs"></i>
        </button>
        <div class="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 p-2 transform origin-top-right">
            <a href="/profile" class="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-xl transition"><i class="ri-user-settings-line"></i> 个人中心</a>
            <button onclick="logout()" class="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50 rounded-xl transition text-left"><i class="ri-logout-box-r-line"></i> 退出登录</button>
        </div>
    </div>` 
  : `<a href="/login" class="px-6 py-2 rounded-full bg-slate-900 text-white text-sm font-bold shadow-lg hover:bg-slate-800 transition-all">登录</a>`;

  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <title>Hub | 618002.xyz</title>
    ${COMMON_HEAD}
</head>
<body class="antialiased">
    <nav class="fixed top-0 w-full z-40 glass h-16 flex items-center">
        <div class="max-w-7xl mx-auto w-full px-6 flex justify-between items-center">
            <div class="flex items-center gap-3 cursor-pointer" onclick="location.href='/'">
                <div class="w-9 h-9 bg-slate-900 rounded-xl flex items-center justify-center text-white text-lg font-bold shadow-md">6</div>
                <span class="text-lg font-bold tracking-tight">618002.xyz</span>
            </div>
            <div class="flex items-center gap-4">
                <div class="relative group hidden md:block">
                    <i class="ri-search-2-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors"></i>
                    <input type="text" id="globalSearch" placeholder="搜索应用工具..." 
                        class="bg-gray-100/50 border border-transparent hover:border-gray-200 focus:border-blue-500/50 focus:bg-white rounded-full py-2 pl-10 pr-4 text-sm w-64 transition-all outline-none">
                </div>
                ${userHtml}
            </div>
        </div>
    </nav>

    <main class="max-w-7xl mx-auto px-6 pt-32 pb-20">
        <header class="mb-12 flex flex-col md:flex-row justify-between items-end gap-6">
             <div>
                <h1 class="text-4xl md:text-5xl font-extrabold text-slate-900 mb-2 tracking-tight">Dashboard</h1>
                <p class="text-slate-500">点击卡片启动您的数字化工作台。</p>
             </div>
             <div class="flex gap-2 p-1 bg-gray-100/80 rounded-xl" id="filters">
                <button onclick="filter('all')" id="btn-all" class="px-5 py-2 rounded-lg text-xs font-bold bg-white text-slate-900 shadow-sm transition">全部</button>
                <button onclick="filter('dev')" id="btn-dev" class="px-5 py-2 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-900 transition">开发工具</button>
                <button onclick="filter('ai')" id="btn-ai" class="px-5 py-2 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-900 transition">人工智能</button>
            </div>
        </header>
        <div id="grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"></div>
        <div id="emptyState" class="hidden text-center py-24 text-gray-400">未发现匹配的应用工具</div>
    </main>

    <div id="modal" class="fixed inset-0 z-[100] hidden flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onclick="closeModal()"></div>
        <div class="relative bg-white w-full max-w-4xl rounded-[40px] shadow-2xl overflow-hidden flex flex-col md:flex-row animate-in zoom-in-95 duration-300">
            <div class="md:w-1/2 p-12 flex flex-col justify-between border-r border-gray-50 bg-white">
                <div>
                    <div id="modalIcon" class="w-20 h-20 rounded-3xl flex items-center justify-center text-4xl mb-8 shadow-inner"></div>
                    <h2 id="modalTitle" class="text-3xl font-extrabold text-slate-900 mb-4 tracking-tight"></h2>
                    <p id="modalDesc" class="text-slate-500 text-lg leading-relaxed mb-6"></p>
                </div>
                <button id="launchBtn" class="w-full bg-slate-900 text-white py-5 rounded-2xl font-bold text-lg hover:bg-slate-800 shadow-xl transition-all active:scale-[0.98]">立即进入系统</button>
            </div>
            <div class="md:w-1/2 bg-gray-50/50 p-12 overflow-y-auto max-h-[600px]">
                <h3 class="font-bold text-slate-900 mb-6 text-sm uppercase tracking-widest opacity-40">用户口碑</h3>
                <div id="modalComments" class="space-y-4"></div>
            </div>
            <button onclick="closeModal()" class="absolute top-6 right-6 w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200 transition"><i class="ri-close-line text-xl"></i></button>
        </div>
    </div>

    <script>
        const tools = [
            { id: 'stock', title: '元器件管理', desc: '全功能库存与BOM系统', longDesc: '全方位数字化元器件管理方案。支持扫码入库、BOM智能解析、多级库位管理。', icon: 'ri-cpu-line', cat: 'dev', color: 'bg-blue-50 text-blue-600', comments: ['BOM解析非常准确', '极大地提高了仓储效率'], url: '/inventory/' },
            { id: 'lvgl', title: 'LVGL 图像处理', desc: '嵌入式 UI 素材转换', longDesc: '专为 LVGL 设计的图像资产处理工具。支持 PNG/JPG/BMP 转 C 数组，支持高质量缩放、抖动处理及 Alpha 预乘。', icon: 'ri-image-edit-line', cat: 'dev', color: 'bg-emerald-50 text-emerald-600', comments: ['转换速度极快', 'RGB565A8 效果很棒'], url: '/lvgl_image/' },
            { id: 'ai', title: 'AI 识别中心', desc: '视觉分析终端', longDesc: '基于尖端深度学习模型，支持物料视觉识别、文本信息提取及自动纠错。', icon: 'ri-eye-2-line', cat: 'ai', color: 'bg-purple-50 text-purple-600', comments: ['识别速度惊人', 'OCR 准确率很高'], url: '/ai_tools' },
            { id: 'admin', title: '系统终端', desc: '权限与日志管理', longDesc: '管理员专用控制台，实时监控系统流量，配置用户权限。', icon: 'ri-terminal-window-line', cat: 'dev', color: 'bg-gray-100 text-gray-700', comments: ['日志审计很详细'], url: '/admin' }
        ];

        function render(list) {
            const grid = document.getElementById('grid');
            const empty = document.getElementById('emptyState');
            if(list.length === 0) { grid.innerHTML = ''; empty.classList.remove('hidden'); return; }
            empty.classList.add('hidden');
            grid.innerHTML = list.map(t => \`
                <div class="glass-card p-8 cursor-pointer group relative overflow-hidden" onclick="openModal('\${t.id}')">
                    <div class="w-14 h-14 \${t.color} rounded-[20px] flex items-center justify-center text-2xl mb-6 transition-transform group-hover:scale-110"><i class="\${t.icon}"></i></div>
                    <h3 class="text-xl font-bold text-slate-900 mb-2">\${t.title}</h3>
                    <p class="text-sm text-slate-400 font-medium leading-relaxed">\${t.desc}</p>
                </div>
            \`).join('');
        }

        function filter(cat) {
            document.querySelectorAll('#filters button').forEach(b => b.className = "px-5 py-2 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-900 transition");
            document.getElementById('btn-'+cat).className = "px-5 py-2 rounded-lg text-xs font-bold bg-white text-slate-900 shadow-sm transition";
            const v = document.getElementById('globalSearch').value.toLowerCase();
            render(tools.filter(t => (cat==='all'||t.cat===cat) && (t.title.toLowerCase().includes(v)||t.longDesc.toLowerCase().includes(v))));
        }

        document.getElementById('globalSearch').addEventListener('input', () => filter(window.currentCat || 'all'));

        function openModal(id) {
            const t = tools.find(x => x.id === id);
            document.getElementById('modalTitle').innerText = t.title;
            document.getElementById('modalDesc').innerText = t.longDesc;
            document.getElementById('modalIcon').className = \`w-20 h-20 mx-auto rounded-3xl \${t.color} flex items-center justify-center text-4xl mb-6 shadow-inner\`;
            document.getElementById('modalIcon').innerHTML = \`<i class="\${t.icon}"></i>\`;
            document.getElementById('launchBtn').onclick = () => window.location.href = t.url;
            document.getElementById('modalComments').innerHTML = t.comments.map(c => \`<div class="bg-white p-4 rounded-2xl border border-gray-100 text-sm text-slate-600 shadow-sm">\${c}</div>\`).join('');
            document.getElementById('modal').classList.remove('hidden');
        }
        function closeModal() { document.getElementById('modal').classList.add('hidden'); }
        
        async function syncNavbar() {
            try {
                const r = await fetch('/auth/profile_api');
                const d = await r.json();
                if(d.success && d.user) {
                    document.getElementById('nav-username').innerText = d.user.username;
                    document.getElementById('nav-role').innerText = d.user.role.toUpperCase() + ' MEMBER';
                    if(d.user.avatar) {
                        document.getElementById('nav-avatar').src = d.user.avatar;
                    } else {
                        document.getElementById('nav-avatar').src = 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + (d.user.username || 'user');
                    }
                }
            } catch(e){}
        }
        render(tools);
        syncNavbar();
    </script>
</body>
</html>`;
}

// --- 2. 个人中心 (修复了返回按钮) ---
function renderProfilePage(user) {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <title>个人中心 | 618002.xyz</title>
    ${COMMON_HEAD}
</head>
<body class="antialiased bg-[#f1f5f9] pt-24">
    <nav class="fixed top-0 w-full z-40 glass h-16 flex items-center px-6 border-none">
        <div class="max-w-5xl mx-auto w-full flex items-center gap-4">
            <button onclick="if(document.referrer.indexOf(window.location.host) !== -1) { history.back(); } else { window.location.href='/'; }" class="w-9 h-9 bg-white rounded-lg flex items-center justify-center border border-gray-100 shadow-sm text-slate-600 hover:bg-gray-50 transition cursor-pointer">
                <i class="ri-arrow-left-s-line text-xl"></i>
            </button>
            <h1 class="font-bold text-slate-800">个人设置</h1>
        </div>
    </nav>

    <div class="max-w-5xl mx-auto px-6 grid grid-cols-1 md:grid-cols-12 gap-8">
        <div class="md:col-span-4 space-y-4">
            <div class="glass-card p-8 text-center relative overflow-hidden fade-in">
                <div class="absolute top-0 left-0 w-full h-24 bg-slate-900 opacity-5"></div>
                <div class="relative w-24 h-24 mx-auto z-10 group cursor-pointer" onclick="document.getElementById('avatar-input').click()">
                    <img id="u-avatar" src="${user.avatar}" class="w-full h-full rounded-full border-4 border-white shadow-lg bg-white object-cover">
                    <div class="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all backdrop-blur-[2px]"><i class="ri-camera-line text-white text-2xl"></i></div>
                </div>
                <input type="file" id="avatar-input" class="hidden" accept="image/*" onchange="uploadAvatar(this)">
                <h2 id="u-name" class="text-2xl font-extrabold mt-4 text-slate-900 tracking-tight">${user.username}</h2>
                <span id="u-role" class="inline-block mt-2 px-3 py-1 bg-blue-50 text-blue-600 text-[10px] font-black uppercase rounded-full border border-blue-100 tracking-widest">${user.role} MEMBER</span>
                <div class="mt-8 grid grid-cols-2 gap-2 border-t border-gray-50 pt-6">
                    <div><div class="text-xl font-bold text-slate-900" id="stat-days">-</div><div class="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">加入天数</div></div>
                    <div><div class="text-xl font-bold text-slate-900" id="stat-count">-</div><div class="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">接口调用</div></div>
                </div>
            </div>

            <div class="glass-card p-2 space-y-1 fade-in" style="animation-delay: 0.1s">
                <button onclick="switchTab('main')" class="w-full flex items-center gap-3 px-5 py-4 text-sm font-bold text-slate-700 hover:bg-gray-50 rounded-2xl transition"><i class="ri-dashboard-line text-lg text-slate-400"></i> 资源概览</button>
                <button onclick="switchTab('settings')" class="w-full flex items-center gap-3 px-5 py-4 text-sm font-bold text-slate-700 hover:bg-gray-50 rounded-2xl transition"><i class="ri-settings-4-line text-lg text-slate-400"></i> 账号设置</button>
                <div class="h-px bg-gray-50 my-1 mx-3"></div>
                <button onclick="logout()" class="w-full flex items-center gap-3 px-5 py-4 text-sm font-bold text-red-500 hover:bg-red-50 rounded-2xl transition"><i class="ri-logout-box-r-line text-lg"></i> 退出登录</button>
            </div>
        </div>

        <div class="md:col-span-8">
            <div id="tab-main" class="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                <div class="glass-card p-10">
                    <h3 class="font-bold text-slate-900 mb-8 text-xl tracking-tight flex items-center gap-2"><i class="ri-pie-chart-2-fill text-blue-500"></i> 资源配额</h3>
                    <div class="space-y-8">
                        <div>
                            <div class="flex justify-between text-xs font-bold mb-3 text-slate-400 uppercase tracking-widest"><span>元器件存储</span><span id="val-storage" class="text-slate-900">0 / 500</span></div>
                            <div class="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden shadow-inner"><div id="bar-storage" class="h-full bg-blue-500 w-0 transition-all duration-1000 shadow-lg shadow-blue-200"></div></div>
                        </div>
                        <div>
                            <div class="flex justify-between text-xs font-bold mb-3 text-slate-400 uppercase tracking-widest"><span>今日接口请求</span><span id="val-api" class="text-slate-900">0 / 50</span></div>
                            <div class="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden shadow-inner"><div id="bar-api" class="h-full bg-indigo-500 w-0 transition-all duration-1000 shadow-lg shadow-indigo-200"></div></div>
                        </div>
                    </div>
                </div>
                <div class="glass-card p-10">
                    <h3 class="font-bold text-slate-900 mb-8 text-xl tracking-tight">最近动态</h3>
                    <div id="activity-list" class="space-y-4"></div>
                </div>
            </div>

            <div id="tab-settings" class="glass-card p-10 hidden animate-in slide-in-from-bottom-4 duration-500">
                <h3 class="font-bold text-slate-900 mb-8 text-xl tracking-tight flex items-center gap-2"><i class="ri-shield-user-fill text-blue-500"></i> 安全中心</h3>
                <div class="space-y-6">
                    <div><label class="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-widest">新用户名</label><input type="text" id="new-username" placeholder="留空不修改" class="w-full mt-2 px-5 py-4 rounded-2xl border border-gray-100 bg-gray-50/50 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition font-medium text-sm"></div>
                    <div><label class="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-widest">新访问密码</label><input type="password" id="new-password" placeholder="不修改请留空" class="w-full mt-2 px-5 py-4 rounded-2xl border border-gray-100 bg-gray-50/50 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition font-medium text-sm"></div>
                    <button onclick="updateAccount()" id="saveBtn" class="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold text-sm shadow-xl hover:bg-slate-800 transition flex items-center justify-center gap-2 mt-4">确认修改账户信息</button>
                </div>
            </div>
        </div>
    </div>

    <script>
        function switchTab(tab) {
            document.getElementById('tab-main').classList.toggle('hidden', tab !== 'main');
            document.getElementById('tab-settings').classList.toggle('hidden', tab !== 'settings');
        }

        async function fetchProfile() {
            try {
                const r = await fetch('/auth/profile_api');
                const d = await r.json();
                if (d.success) {
                    if(d.user) {
                        document.getElementById('u-name').innerText = d.user.username;
                        document.getElementById('u-avatar').src = d.user.avatar || ('https://api.dicebear.com/7.x/avataaars/svg?seed=' + d.user.username);
                        document.getElementById('u-role').innerText = d.user.role.toUpperCase() + ' MEMBER';
                    }
                    document.getElementById('stat-days').innerText = d.stats.days || 1;
                    document.getElementById('stat-count').innerText = d.stats.total_calls || 0;
                    const st = d.stats.storage_used || 0;
                    document.getElementById('val-storage').innerText = st + " / 500";
                    document.getElementById('bar-storage').style.width = (st/500*100) + '%';
                    const ap = d.stats.api_today || 0;
                    document.getElementById('val-api').innerText = ap + " / 50";
                    document.getElementById('bar-api').style.width = (ap/50*100) + '%';
                    if(d.activities) document.getElementById('activity-list').innerHTML = d.activities.map(a => \`
                        <div class="flex items-center gap-4 p-4 hover:bg-gray-50 rounded-2xl transition border border-transparent hover:border-gray-100">
                            <div class="w-12 h-12 \${a.bg||'bg-gray-100'} \${a.color||'text-gray-500'} rounded-xl flex items-center justify-center text-xl"><i class="\${a.icon}"></i></div>
                            <div><p class="text-sm font-bold text-slate-700">\${a.text}</p><p class="text-[10px] font-bold text-slate-300 uppercase mt-1">\${a.time}</p></div>
                        </div>\`).join('');
                }
            } catch(e) { showToast("个人中心数据加载失败", "error"); }
        }

        async function uploadAvatar(input) {
            if (!input.files || !input.files[0]) return;
            const formData = new FormData();
            formData.append('file', input.files[0]);
            showToast('头像上传中...', 'info');
            try {
                const r = await fetch('/auth/upload_avatar', { method: 'POST', body: formData });
                const res = await r.json();
                if (res.success) { document.getElementById('u-avatar').src = res.url; showToast('头像更新成功', 'success'); }
                else { showToast(res.error || '上传失败', 'error'); }
            } catch (e) { showToast('通信异常', 'error'); }
        }

        async function updateAccount() {
            const btn = document.getElementById('saveBtn');
            const user = document.getElementById('new-username').value;
            const pass = document.getElementById('new-password').value;
            if(!user && !pass) return showToast("未检测到修改项");
            btn.disabled = true; btn.innerText = "处理中...";
            try {
                const r = await fetch('/auth/update_profile', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ username: user, password: pass }) });
                const res = await r.json();
                if(res.success) { showToast("修改成功，请重新登录", "success"); setTimeout(logout, 1500); }
                else { showToast(res.error, "error"); }
            } catch(e) { showToast("服务器响应异常", "error"); }
            finally { btn.disabled = false; btn.innerText = "确认修改账户信息"; }
        }
        fetchProfile();
    </script>
</body>
</html>`;
}

// --- 3. 登录页 ---
function renderLoginPage() {
    return `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <title>验证 | 618002.xyz</title>
        ${COMMON_HEAD}
    </head>
    <body class="flex items-center justify-center min-h-screen bg-slate-50 overflow-hidden">
        <div class="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px] opacity-30"></div>
        <div class="glass-card p-12 w-full max-w-md text-center relative z-10 animate-in fade-in zoom-in-95 duration-500">
            <div class="w-16 h-16 bg-slate-900 text-white rounded-2xl flex items-center justify-center text-3xl font-bold mx-auto mb-10 shadow-2xl cursor-pointer" onclick="location.href='/'">6</div>
            <form id="authForm" class="space-y-4">
                <input type="text" id="username" placeholder="用户名" class="w-full px-5 py-4 rounded-2xl border border-gray-100 bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 outline-none transition font-medium text-sm" required>
                <input type="password" id="password" placeholder="密码" class="w-full px-5 py-4 rounded-2xl border border-gray-100 bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 outline-none transition font-medium text-sm" required>
                <button type="submit" id="submitBtn" class="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-slate-800 shadow-xl transition-all active:scale-[0.98] mt-4">立即验证登录</button>
            </form>
            <p class="mt-10 text-xs font-bold text-slate-400 uppercase tracking-widest">还没有账号？<a href="javascript:void(0)" onclick="toggleMode()" id="toggleBtn" class="text-blue-600 hover:underline ml-1">点击创建</a></p>
        </div>
        <script>
            let isLogin = true;
            function toggleMode() {
                isLogin = !isLogin;
                document.getElementById('submitBtn').innerText = isLogin ? '立即验证登录' : '立即注册账户';
                document.getElementById('toggleBtn').innerText = isLogin ? '点击创建' : '返回登录';
            }
            document.getElementById('authForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const payload = { username: document.getElementById('username').value, password: document.getElementById('password').value };
                const btn = document.getElementById('submitBtn'); btn.disabled = true; btn.innerText = "执行中...";
                try {
                    const r = await fetch(isLogin ? '/auth/login' : '/auth/register', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
                    if(r.ok) location.href = '/'; 
                    else { const res = await r.json(); showToast(res.error || "认证失败", "error"); }
                } catch(e) { showToast("网络连接超时", "error"); }
                finally { btn.disabled = false; btn.innerText = isLogin ? '立即验证登录' : '立即注册账户'; }
            });
        </script>
    </body>
    </html>`;
}