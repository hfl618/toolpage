/**
 * Cloudflare Worker - 618002.xyz 智能网关系统 (完整生产版 v2.5)
 * 修复：解决 Cloudflare 编辑器中模板字符串嵌套导致的语法报错
 * 风格：BentoUI + Apple 极简风
 */

// 配置你的后端地址
const BACKEND_URL = "https://artificial-cordie-toolpage-e43d265d.koyeb.app";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // 解析用户信息
    const user = parseUserFromCookie(request.headers.get("Cookie"));

    // 路由 1: 首页
    if (path === '/' || path === '/index.html') {
      return new Response(renderUltraDashboard(user), {
        headers: { "Content-Type": "text/html;charset=UTF-8" }
      });
    }

    // 路由 2: 个人中心
    if (path === '/profile') {
      if (!user) return Response.redirect(url.origin + "/login", 302);
      return new Response(renderProfilePage(user), {
        headers: { "Content-Type": "text/html;charset=UTF-8" }
      });
    }

    // 路由 3: 登录页
    if (path === '/login') {
      if (user) return Response.redirect(url.origin + "/", 302);
      return new Response(renderLoginPage(), {
        headers: { "Content-Type": "text/html;charset=UTF-8" }
      });
    }

    // 路由 4: 业务接口转发
    return proxyToBackend(request, BACKEND_URL, env);
  }
};

// ==========================================
// 🛠️ 工具函数
// ==========================================

function parseUserFromCookie(cookieHeader) {
  if (!cookieHeader) return null;
  const token = cookieHeader.split('; ').find(row => row.startsWith('auth_token='))?.split('=')[1];
  if (!token) return null;
  
  try {
    // 简单解析 JWT Payload
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return {
      uid: payload.uid,
      username: payload.username || payload.sub || ("User_" + payload.uid),
      role: payload.role || 'free'
    };
  } catch (e) { return null; }
}

async function proxyToBackend(request, backendUrl, env) {
  const url = new URL(request.url);
  const targetUrl = backendUrl + url.pathname + url.search;
  const newHeaders = new Headers(request.headers);

  // 修正 Host 头
  newHeaders.set("Host", new URL(backendUrl).hostname);
  
  // 注入身份信息
  const user = parseUserFromCookie(request.headers.get("Cookie"));
  if (user) {
    newHeaders.set("X-User-Id", user.uid.toString());
    newHeaders.set("X-User-Role", user.role);
  }

  // 注入安全密钥
  if (env.GATEWAY_SECRET) {
     newHeaders.set("X-Gateway-Secret", env.GATEWAY_SECRET);
  }

  return fetch(new Request(targetUrl, {
    method: request.method,
    headers: newHeaders,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.blob() : null,
    redirect: 'follow'
  }));
}

// ==========================================
// 🎨 渲染函数 (HTML)
// ==========================================

function renderUltraDashboard(user) {
  // 用户区域 HTML
  const userHtml = user ? `
    <div class="relative group z-50">
        <button class="flex items-center gap-3 focus:outline-none transition-opacity hover:opacity-80">
            <div class="text-right hidden md:block">
                <div class="text-[13px] font-bold text-gray-900 leading-none">${user.username}</div>
                <div class="text-[10px] font-bold text-blue-600 uppercase tracking-wider mt-1">${user.role} MEMBER</div>
            </div>
            <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}" class="w-10 h-10 rounded-full border-2 border-white shadow-sm bg-gray-100">
        </button>
        <div class="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 transform origin-top-right translate-y-2 group-hover:translate-y-0">
            <div class="p-2">
                <a href="/profile" class="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-black rounded-xl transition">
                    <i class="ri-user-settings-line"></i> 个人中心
                </a>
                <div class="h-px bg-gray-50 my-1"></div>
                <button onclick="logout()" class="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-500 hover:bg-red-50 rounded-xl transition text-left">
                    <i class="ri-logout-box-r-line"></i> 退出登录
                </button>
            </div>
        </div>
    </div>` 
  : `<a href="/login" class="px-6 py-2.5 rounded-full bg-black text-white text-sm font-bold shadow-lg hover:bg-gray-800 hover:scale-105 transition-all">登录 / 注册</a>`;

  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hub | 618002.xyz</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/remixicon@3.5.0/fonts/remixicon.css" rel="stylesheet">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        body { background: #fbfbfd; font-family: 'Plus Jakarta Sans', sans-serif; color: #1d1d1f; }
        .glass { background: rgba(255, 255, 255, 0.85); backdrop-filter: saturate(180%) blur(20px); }
        .bento-card { background: #ffffff; border-radius: 32px; transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); border: 1px solid rgba(0,0,0,0.04); box-shadow: 0 4px 20px -5px rgba(0,0,0,0.03); }
        .bento-card:hover { transform: translateY(-5px); box-shadow: 0 20px 40px -10px rgba(0,0,0,0.08); border-color: rgba(0,113,227,0.3); }
        .modal-enter { animation: modalIn 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes modalIn { from { opacity: 0; transform: scale(0.95) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        .no-scrollbar::-webkit-scrollbar { display: none; }
    </style>
</head>
<body class="antialiased">
    <nav class="fixed top-0 w-full z-40 glass border-b border-gray-100 px-6 py-4">
        <div class="max-w-7xl mx-auto flex justify-between items-center">
            <div class="flex items-center gap-3 cursor-pointer" onclick="window.location.reload()">
                <div class="w-10 h-10 bg-black rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-lg">6</div>
                <span class="text-lg font-bold tracking-tight hidden md:block">618002.xyz</span>
            </div>
            <div class="flex items-center gap-6">
                <div class="relative group hidden md:block">
                    <i class="ri-search-line absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors"></i>
                    <input type="text" id="globalSearch" placeholder="搜索工具 (Ctrl+K)" 
                        class="bg-gray-100/80 border-none rounded-full py-2.5 pl-12 pr-6 text-sm w-64 focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all outline-none">
                </div>
                ${userHtml}
            </div>
        </div>
    </nav>

    <main class="max-w-7xl mx-auto px-6 pt-36 pb-24">
        <header class="mb-12">
            <h1 class="text-4xl md:text-6xl font-extrabold mb-6 tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-gray-900 via-gray-700 to-gray-500">Dashboard</h1>
            <div class="flex gap-3 overflow-x-auto no-scrollbar pb-2" id="filters">
                <button onclick="filter('all')" id="btn-all" class="px-6 py-2.5 rounded-full text-sm font-bold bg-black text-white shadow-lg transition">全部</button>
                <button onclick="filter('dev')" id="btn-dev" class="px-6 py-2.5 rounded-full text-sm font-medium bg-white text-gray-500 hover:bg-gray-50 border border-gray-100 transition">开发工具</button>
                <button onclick="filter('ai')" id="btn-ai" class="px-6 py-2.5 rounded-full text-sm font-medium bg-white text-gray-500 hover:bg-gray-50 border border-gray-100 transition">人工智能</button>
            </div>
        </header>

        <div id="grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"></div>
        <div id="emptyState" class="hidden text-center py-20 text-gray-400"><i class="ri-ghost-line text-4xl mb-4 block"></i>没有找到匹配的工具</div>
    </main>

    <div id="modal" class="fixed inset-0 z-[100] hidden flex items-center justify-center p-4 md:p-6">
        <div class="absolute inset-0 bg-white/60 backdrop-blur-xl transition-opacity" onclick="closeModal()"></div>
        <div class="relative bg-white w-full max-w-4xl rounded-[40px] shadow-2xl overflow-hidden modal-enter border border-gray-100 flex flex-col md:flex-row">
            <div class="w-full md:w-1/2 p-12 border-r border-gray-50 bg-white z-10 flex flex-col justify-between">
                <div>
                    <div id="modalIcon" class="w-20 h-20 rounded-3xl flex items-center justify-center text-4xl mb-8 shadow-sm"></div>
                    <h2 id="modalTitle" class="text-3xl font-extrabold mb-3 text-gray-900"></h2>
                    <p id="modalDesc" class="text-gray-500 leading-relaxed text-lg"></p>
                </div>
                <button id="launchBtn" class="mt-10 w-full bg-[#0071e3] text-white py-4 rounded-2xl font-bold text-lg hover:bg-[#0077ed] shadow-xl shadow-blue-100">启动应用</button>
            </div>
            <div class="w-full md:w-1/2 bg-[#fbfbfd] p-12 overflow-y-auto">
                <h3 class="font-bold text-gray-900 mb-6 text-sm uppercase tracking-wider opacity-60">用户反馈</h3>
                <div class="space-y-4" id="comments"></div>
            </div>
            <button onclick="closeModal()" class="absolute top-6 right-6 w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center hover:bg-gray-100"><i class="ri-close-line text-xl"></i></button>
        </div>
    </div>

    <script>
        function logout() {
            // 1. 清除当前主机名下的 Cookie (适配 localhost 或 workers.dev)
            document.cookie = "auth_token=; path=/; max-age=0";
            
            // 2. 智能清除根域下的 Cookie (适配 .618002.xyz 子域共享场景)
            const parts = window.location.hostname.split('.');
            if (parts.length > 1) {
                // 取最后两段作为根域 (例如 618002.xyz)
                const rootDomain = parts.slice(-2).join('.');
                document.cookie = "auth_token=; path=/; max-age=0; domain=." + rootDomain;
            }
            
            // 3. 刷新页面
            window.location.href = '/';
        }

        const tools = [
            { id: 'stock', title: '元器件管理', desc: '库存与BOM系统', longDesc: '全方位数字化元器件管理方案。支持扫码入库、BOM智能解析。', icon: 'ri-cpu-line', cat: 'dev', color: 'bg-blue-50 text-blue-600', comments: ["BOM导入功能节省了我好几个小时", "配合扫码枪使用非常流畅"], url: '/inventory/' },
            { id: 'ai', title: 'AI 识别中心', desc: '视觉处理终端', longDesc: '基于深度学习模型，支持物料识别、文本提取。', icon: 'ri-eye-2-line', cat: 'ai', color: 'bg-purple-50 text-purple-600', comments: ["识别精度惊人", "API 响应很快"], url: '/ai_tools' },
            { id: 'admin', title: '系统终端', desc: '权限与日志', longDesc: '管理员专用控制台。', icon: 'ri-terminal-window-line', cat: 'dev', color: 'bg-slate-50 text-slate-800', comments: ["权限控制很精细"], url: '/admin' }
        ];

        let currentFilter = 'all';

        function render(list) {
            const grid = document.getElementById('grid');
            const empty = document.getElementById('emptyState');
            if (list.length === 0) { grid.innerHTML = ''; empty.classList.remove('hidden'); return; }
            empty.classList.add('hidden');
            
            grid.innerHTML = list.map(t => \`
                <div class="bento-card p-8 cursor-pointer group flex flex-col h-full relative overflow-hidden" onclick="openModal('\${t.id}')">
                    <div class="w-14 h-14 \${t.color} rounded-[20px] flex items-center justify-center text-2xl mb-6 shadow-sm group-hover:scale-110 transition-transform duration-300">
                        <i class="\${t.icon}"></i>
                    </div>
                    <h3 class="text-xl font-bold mb-2 text-gray-900">\${t.title}</h3>
                    <p class="text-gray-400 text-sm font-medium leading-relaxed">\${t.desc}</p>
                </div>
            \`).join('');
        }

        function filter(cat) {
            currentFilter = cat;
            document.querySelectorAll('#filters button').forEach(btn => {
                btn.className = "px-6 py-2.5 rounded-full text-sm font-medium bg-white text-gray-500 hover:bg-gray-50 border border-gray-100 transition";
            });
            document.getElementById('btn-' + cat).className = "px-6 py-2.5 rounded-full text-sm font-bold bg-black text-white shadow-lg transition";
            
            const v = document.getElementById('globalSearch').value.toLowerCase();
            let list = tools.filter(t => (cat === 'all' || t.cat === cat) && (t.title.toLowerCase().includes(v) || t.desc.toLowerCase().includes(v)));
            render(list);
        }

        document.getElementById('globalSearch').addEventListener('input', (e) => filter(currentFilter));

        function openModal(id) {
            const t = tools.find(x => x.id === id);
            document.getElementById('modalTitle').innerText = t.title;
            document.getElementById('modalDesc').innerText = t.longDesc;
            const icon = document.getElementById('modalIcon');
            icon.className = \`w-20 h-20 rounded-3xl \${t.color} flex items-center justify-center text-4xl mb-8 shadow-inner\`;
            icon.innerHTML = \`<i class="\${t.icon}"></i>\`;
            document.getElementById('launchBtn').onclick = () => window.location.href = t.url;
            document.getElementById('comments').innerHTML = t.comments.map(c => \`<div class="bg-white p-4 rounded-2xl border border-gray-100 text-sm text-gray-600 shadow-sm">\${c}</div>\`).join('');
            document.getElementById('modal').classList.remove('hidden');
        }
        function closeModal() { document.getElementById('modal').classList.add('hidden'); }

        render(tools);
    </script>
</body>
</html>
  `;
}

function renderProfilePage(user) {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>个人中心 | 618002.xyz</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/remixicon@3.5.0/fonts/remixicon.css" rel="stylesheet">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
        body { background: #fbfbfd; font-family: 'Plus Jakarta Sans', sans-serif; }
        .glass-card { background: white; border-radius: 32px; border: 1px solid rgba(0,0,0,0.04); box-shadow: 0 4px 20px -5px rgba(0,0,0,0.03); }
    </style>
</head>
<body class="antialiased min-h-screen pt-20">
    <nav class="fixed top-0 w-full z-40 bg-white/80 backdrop-blur-md border-b border-gray-100 px-6 py-4">
        <div class="max-w-5xl mx-auto flex items-center gap-4">
            <a href="/" class="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center hover:bg-gray-200 transition">
                <i class="ri-arrow-left-line text-xl"></i>
            </a>
            <h1 class="text-lg font-bold">个人中心</h1>
        </div>
    </nav>

    <div class="max-w-5xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-8">
        <div class="md:col-span-1">
            <div class="glass-card p-8 text-center relative overflow-hidden">
                <div class="absolute top-0 left-0 w-full h-24 bg-gradient-to-r from-blue-400 to-purple-400 opacity-20"></div>
                <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}" class="w-24 h-24 rounded-full border-4 border-white shadow-lg mx-auto relative z-10 bg-gray-50">
                <h2 class="text-2xl font-extrabold mt-4 text-gray-900">${user.username}</h2>
                <span class="inline-block mt-2 px-3 py-1 bg-blue-50 text-blue-600 text-xs font-bold uppercase tracking-wider rounded-full border border-blue-100">${user.role} MEMBER</span>
                <button onclick="logout()" class="mt-8 w-full py-3 bg-red-50 hover:bg-red-100 text-red-500 rounded-xl font-bold transition">退出登录</button>
            </div>
        </div>
        <div class="md:col-span-2">
            <div class="glass-card p-8">
                <h3 class="font-bold text-gray-900 mb-6 flex items-center gap-2"><i class="ri-history-line text-blue-500"></i> 最近活动</h3>
                <div id="activity-list" class="space-y-3">
                    <div class="animate-pulse flex gap-4 items-center"><div class="w-10 h-10 bg-gray-100 rounded-xl"></div><div class="h-4 bg-gray-100 rounded w-1/3"></div></div>
                </div>
            </div>
        </div>
    </div>
    <script>
        function logout() {
            document.cookie = "auth_token=; path=/; max-age=0; domain=" + window.location.hostname;
            document.cookie = "auth_token=; path=/; max-age=0; domain=.618002.xyz";
            window.location.href = '/';
        }

        // 模拟加载数据 (后端接口就位后可替换为真实 fetch)
        setTimeout(() => {
            const activities = [
                { text: "登录了系统", time: "刚刚", icon: "ri-login-circle-line", color: "bg-green-100 text-green-600" },
                { text: "查看了元器件列表", time: "5分钟前", icon: "ri-file-list-line", color: "bg-blue-100 text-blue-600" }
            ];
            document.getElementById('activity-list').innerHTML = activities.map(a => \`
                <div class="flex items-center gap-4 p-3 hover:bg-gray-50 rounded-xl transition">
                    <div class="w-10 h-10 \${a.color} rounded-xl flex items-center justify-center flex-shrink-0"><i class="\${a.icon}"></i></div>
                    <div><p class="text-sm font-bold text-gray-800">\${a.text}</p><p class="text-xs text-gray-400">\${a.time}</p></div>
                </div>
            \`).join('');
        }, 800);
    </script>
</body>
</html>
  `;
}

function renderLoginPage() {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>身份验证 | 618002.xyz</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/remixicon@3.5.0/fonts/remixicon.css" rel="stylesheet">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
        body { font-family: 'Plus Jakarta Sans', sans-serif; background: #f5f5f7; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
        .login-card { background: rgba(255,255,255,0.8); backdrop-filter: blur(20px); border-radius: 32px; box-shadow: 0 20px 40px rgba(0,0,0,0.05); width: 100%; max-width: 400px; padding: 40px; }
        .fade-enter { animation: fadeIn 0.4s ease forwards; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    </style>
</head>
<body>
    <div class="login-card fade-enter">
        <div class="text-center mb-8">
            <div class="w-14 h-14 bg-black text-white rounded-2xl flex items-center justify-center text-2xl font-bold mx-auto mb-4 cursor-pointer" onclick="location.href='/'">6</div>
            <h1 id="title" class="text-2xl font-bold text-gray-900">欢迎回来</h1>
            <p id="subtitle" class="text-gray-500 text-sm mt-1">请输入凭证以继续</p>
        </div>
        <form id="authForm" class="space-y-4">
            <input type="text" id="username" placeholder="用户名" class="w-full px-5 py-3.5 rounded-xl border border-gray-200 bg-white/50 focus:outline-none focus:border-blue-500 transition" required>
            <input type="password" id="password" placeholder="密码" class="w-full px-5 py-3.5 rounded-xl border border-gray-200 bg-white/50 focus:outline-none focus:border-blue-500 transition" required>
            <div id="errorMsg" class="hidden text-red-500 text-xs text-center"></div>
            <button type="submit" id="submitBtn" class="w-full bg-black text-white py-3.5 rounded-xl font-bold hover:bg-gray-800 transition shadow-lg"><span>立即登录</span></button>
        </form>
        <p class="text-center mt-6 text-xs text-gray-400">
            <span id="toggleText">还没有账号？</span> 
            <a href="javascript:void(0)" onclick="toggleMode()" class="text-blue-600 font-bold ml-1">创建账户</a>
        </p>
    </div>
    <script>
        let isLogin = true;
        function toggleMode() {
            isLogin = !isLogin;
            document.getElementById('title').innerText = isLogin ? '欢迎回来' : '创建账户';
            document.getElementById('subtitle').innerText = isLogin ? '请输入凭证以继续' : '注册即代表同意条款';
            document.querySelector('#submitBtn span').innerText = isLogin ? '立即登录' : '立即注册';
            document.getElementById('toggleText').innerText = isLogin ? '还没有账号？' : '已有账号？';
            event.target.innerText = isLogin ? '创建账户' : '返回登录';
        }
        document.getElementById('authForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('submitBtn');
            const error = document.getElementById('errorMsg');
            btn.disabled = true; btn.innerHTML = '<i class="ri-loader-4-line animate-spin"></i>';
            error.classList.add('hidden');
            
            const payload = { username: document.getElementById('username').value, password: document.getElementById('password').value };
            const endpoint = isLogin ? '/auth/login' : '/auth/register';
            
            try {
                const r = await fetch(endpoint, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
                const res = await r.json();
                if(r.ok) {
                    btn.className = "w-full bg-green-500 text-white py-3.5 rounded-xl font-bold shadow-lg";
                    btn.innerHTML = '<i class="ri-check-line"></i>';
                    if(isLogin) setTimeout(() => location.href = '/', 800);
                    else { alert('注册成功'); toggleMode(); btn.disabled = false; btn.className = "w-full bg-black text-white py-3.5 rounded-xl font-bold hover:bg-gray-800 transition shadow-lg"; btn.innerHTML = "<span>立即登录</span>"; }
                } else throw new Error(res.error || '失败');
            } catch(err) {
                error.innerText = err.message; error.classList.remove('hidden');
                btn.disabled = false; btn.innerHTML = "<span>" + (isLogin ? '立即登录' : '立即注册') + "</span>";
            }
        });
    </script>
</body>
</html>
  `;
}