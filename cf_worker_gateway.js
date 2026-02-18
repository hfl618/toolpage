/**
 * Cloudflare Worker - Core618 智连网关 (v10.0 生产环境最终版)
 * 核心特性：
 * 1. 品牌 100% 同步：Core618 (C) + Embedded Dev Toolbox。
 * 2. 视觉 100% 同步：Apple 风格卡片 + 响应式布局 + 统一页脚。
 * 3. 逻辑修复：修正了 JS 正则解析报错，确保法律页面和帮助弹窗正常。
 * 4. 合规完备：内置 Privacy Policy 与 Terms 链接。
 */

const BACKEND_URL = "https://api.618002.xyz";

// --- 1. 应用数据矩阵 (同步双语描述) ---
const APP_TOOLS = [
  { 
    id:'stock', title_zh:'元器件管理', title_en:'Inventory Management', 
    desc_zh:'库存、BOM、扫码一体化', desc_en:'Stock, BOM, QR integrated', 
    lDesc_zh:'全方位数字化仓储解决方案。', lDesc_en:'Full digital warehouse solution.', 
    icon:'ri-cpu-fill', cat:'dev', color:'bg-gradient-to-br from-blue-500 to-indigo-600', 
    comments:[{zh:'BOM解析准确',en:'Accurate'},{zh:'效率很高',en:'Fast'}], 
    url:'/inventory/' 
  },
  { 
    id:'serial', title_zh:'云端串口调试', title_en:'Serial Terminal', 
    desc_zh:'Web Serial API 直连', desc_en:'Hardware debug via web', 
    lDesc_zh:'基于 Web Serial API 的专业串口调试工具。支持 Chrome/Edge 直连 ESP32/Arduino，免驱运行。', 
    lDesc_en:'Professional web-based serial terminal. Connect to MCU directly from browser.', 
    icon:'ri-terminal-line', cat:'dev', color:'bg-gradient-to-br from-indigo-500 to-purple-600', 
    comments:[{zh:'无需安装驱动',en:'Driverless'},{zh:'波特率支持高',en:'High baudrate'}], 
    url:'/serial/' 
  },
  { 
    id:'ble', title_zh:'设备蓝牙配网', title_en:'BLE Configurator', 
    desc_zh:'Web Bluetooth API 配网', desc_en:'Provision IoT via BLE', 
    lDesc_zh:'极简蓝牙配网工具。支持 Wi-Fi 下发与硬件状态监控。', 
    lDesc_en:'Minimalist provisioning tool via Web Bluetooth API.', 
    icon:'ri-bluetooth-connect-line', cat:'dev', color:'bg-gradient-to-br from-blue-500 to-cyan-500', 
    comments:[{zh:'配网非常快',en:'Very fast'}], 
    url:'/ble_config/' 
  },
  { 
    id:'lvgl', title_zh:'LVGL 图像处理', title_en:'LVGL Image Tool', 
    desc_zh:'嵌入式素材转换', desc_en:'Embedded Asset Converter', 
    lDesc_zh:'专为 LVGL 嵌入式图形库设计的图像处理工具。', 
    lDesc_en:'Professional image converter for LVGL library.', 
    icon:'ri-image-edit-fill', cat:'dev', color:'bg-gradient-to-br from-emerald-500 to-teal-600', 
    comments:[{zh:'RGB565很好用',en:'Great RGB565'}], 
    url:'/lvgl_image/' 
  }
];

const SPONSORS = [
  { id:"jlc", title_zh:"嘉立创 PCB", title_en:"JLCPCB", desc_zh:"24h极速发货", desc_en:"24h Turnaround", image:"https://img.icons8.com/color/96/circuit.png", link:"https://jlcpcb.com/" },
  { id:"ds", title_zh:"DeepSeek AI", title_en:"DeepSeek", desc_zh:"国产最强模型", desc_en:"Strongest CN AI", image:"https://img.icons8.com/fluency/96/artificial-intelligence.png", link:"https://deepseek.com/" }
];

// --- 2. 统一页脚模板 (Core618 品牌版) ---
function renderUnifiedFooter(lang) {
    return `
    <footer style="margin-top: 48px; border-top: 1px solid #f1f5f9; padding-top: 32px;">
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; margin-bottom: 24px;">
            ${SPONSORS.map(s => `
                <a href="${s.link}" target="_blank" style="text-decoration:none; display:block; border:1px solid #f1f5f9; padding:16px; background:white; border-radius:16px;">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <img src="${s.image}" style="width:32px; height:32px; object-fit:contain;">
                        <div>
                            <div style="font-size:12px; font-weight:bold; color:#334155;">${lang==='zh'?s.title_zh:s.title_en}</div>
                            <div style="font-size:10px; color:#94a3b8;">${lang==='zh'?s.desc_zh:s.desc_en}</div>
                        </div>
                    </div>
                </a>
            `).join('')}
        </div>
        <div style="text-align:center; border-top:1px solid #f8fafc; padding-top:20px;">
            <p style="font-size:10px; color:#94a3b8; font-weight:bold; letter-spacing:1px; margin-bottom:8px;">© 2026 CORE618 (618002.XYZ). ALL RIGHTS RESERVED.</p>
            <div style="display:flex; justify-content:center; gap:16px; font-size:10px; font-weight:bold;">
                <a href="/support/privacy" style="color:#cbd5e1; text-decoration:none;">PRIVACY</a>
                <a href="/support/terms" style="color:#cbd5e1; text-decoration:none;">TERMS</a>
                <a href="/support" style="color:#cbd5e1; text-decoration:none;">SUPPORT</a>
            </div>
            <div style="margin-top:12px; font-size:10px; color:#e2e8f0; font-weight:bold;">Built with <span style="color:#f87171">❤️</span> in Shenzhen.</div>
        </div>
    </footer>`;
}

// --- 3. 路由分发 ---
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const cookie = request.headers.get("Cookie") || "";
    const lang = cookie.includes("lang=en") ? "en" : "zh";
    let user = null;
    try { user = parseUserFromCookie(cookie); } catch(e){}

    if (path === '/' || path === '/index.html') return new Response(renderIndex(user, lang), { headers: { "Content-Type": "text/html;charset=UTF-8" } });
    if (path === '/login') return new Response(renderLogin(lang), { headers: { "Content-Type": "text/html;charset=UTF-8" } });
    if (path === '/profile') return user ? new Response(renderProfile(user, lang), { headers: { "Content-Type": "text/html;charset=UTF-8" } }) : Response.redirect(url.origin + "/login", 302);
    if (path === '/logout') return new Response(null, { status: 302, headers: { "Location": "/login", "Set-Cookie": "auth_token=; Path=/; Max-Age=0" } });
    
    return await proxyToBackend(request, BACKEND_URL, env);
  }
};

// --- 4. 页面渲染函数 ---

function renderIndex(user, lang) {
    return `<!DOCTYPE html>
<html lang="${lang}">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Core618 | 智连在线工具箱 - Web Serial & Embedded Dev Tools</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/remixicon@3.5.0/fonts/remixicon.css" rel="stylesheet">
    <style>
        body { font-family: sans-serif; background: #f8fafc; color: #1e293b; }
        .bento-card { background: white; border: 1px solid rgba(226, 232, 240, 0.7); transition: all 0.4s; border-radius:32px; padding:40px; cursor:pointer; }
        .bento-card:hover { transform: translateY(-6px); border-color: #3b82f6; box-shadow: 0 20px 30px rgba(59,130,246,0.1); }
    </style>
</head>
<body>
  <nav class="fixed top-0 w-full z-40 h-20 flex items-center px-6 bg-white/80 backdrop-blur-md border-b">
    <div class="max-w-7xl mx-auto w-full flex justify-between items-center">
      <div class="flex items-center gap-4 cursor-pointer" onclick="location.reload()">
        <div class="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white text-xl font-black shadow-lg">C</div>
        <div class="flex flex-col leading-tight"><span class="text-xl font-black">Core618</span><span style="font-size:9px;" class="text-slate-400 font-bold uppercase tracking-widest">Embedded Dev Toolbox</span></div>
      </div>
      <div id="user-area">${user ? `<img src="${user.avatar}" class="w-8 h-8 rounded-full border shadow-sm" onclick="location.href='/profile'">` : `<button onclick="location.href='/login'" class="px-6 py-2 bg-slate-900 text-white rounded-full font-bold text-xs">LOGIN</button>`}</div>
    </div>
  </nav>
  <main class="max-w-7xl mx-auto px-6 pt-36 pb-8">
    <div class="mb-16">
        <h1 class="text-5xl font-black tracking-tighter mb-4">${lang==='zh'?'应用矩阵':'Application Matrix'}</h1>
        <p class="text-slate-400 font-bold">${lang==='zh'?'专为嵌入式工程师打造的高效工作流。':'High-efficiency digital workflow for engineers.'}</p>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        ${APP_TOOLS.map(t => `
            <div class="bento-card" onclick="location.href='${t.url}'">
                <div class="w-14 h-14 ${t.color} rounded-2xl flex items-center justify-center text-white text-2xl mb-8 shadow-lg"><i class="${t.icon}"></i></div>
                <h3 class="text-2xl font-black mb-2">${lang==='zh'?t.title_zh:t.title_en}</h3>
                <p class="text-slate-400 font-bold text-sm leading-relaxed">${lang==='zh'?t.desc_zh:t.desc_en}</p>
            </div>
        `).join('')}
    </div>
    ${renderUnifiedFooter(lang)}
  </main>
</body></html>`;
}

function renderLogin(lang) {
    return `<!DOCTYPE html><html><head><title>Login | Core618</title><script src="https://cdn.tailwindcss.com"></script></head><body class="flex items-center justify-center min-h-screen bg-slate-50">
    <div class="max-w-md w-full p-10 text-center animate-in fade-in duration-700">
        <div class="w-20 h-20 bg-slate-900 text-white rounded-[32px] flex items-center justify-center text-4xl font-black mx-auto mb-10 shadow-2xl" onclick="location.href='/'">C</div>
        <h1 class="text-4xl font-black text-slate-900 mb-12">${lang==='zh'?'身份验证':'Authentication'}</h1>
        <div class="bg-white p-10 rounded-[40px] shadow-xl text-left border border-gray-100">
            <form onsubmit="event.preventDefault(); location.href='/';">
                <div class="mb-4"><label class="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-1">${lang==='zh'?'用户名':'Username'}</label><input type="text" class="w-full mt-2 p-5 rounded-2xl bg-gray-50 border-none outline-none font-bold text-sm" placeholder="..."></div>
                <div class="mb-8"><label class="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-1">${lang==='zh'?'密码':'Password'}</label><input type="password" class="w-full mt-2 p-5 rounded-2xl bg-gray-50 border-none outline-none font-bold text-sm" placeholder="..."></div>
                <button class="w-full py-5 bg-slate-900 text-white rounded-3xl font-black text-lg shadow-xl hover:bg-slate-800 transition-all">${lang==='zh'?'进入系统':'Launch Workspace'}</button>
            </form>
        </div>
    </div></body></html>`;
}

function renderProfile(user, lang) {
    return `<!DOCTYPE html><html><head><title>Profile | Core618</title><script src="https://cdn.tailwindcss.com"></script></head><body class="bg-slate-50 pt-32 text-center">
    <nav class="fixed top-0 w-full z-40 h-20 flex items-center px-6 bg-white/80 backdrop-blur-md border-b"><div class="max-w-5xl mx-auto w-full flex justify-between items-center"><button onclick="location.href='/'" class="font-black text-xl">Core618</button><div class="px-4 py-1.5 bg-blue-50 text-blue-600 text-[10px] font-black rounded-xl uppercase tracking-widest">${user.role} MEMBER</div></div></nav>
    <div class="max-w-md mx-auto">
        <img src="${user.avatar}" class="w-32 h-32 rounded-[40px] mx-auto mb-6 shadow-2xl border-4 border-white bg-white">
        <h2 class="text-4xl font-black text-slate-900 mb-8">${user.username}</h2>
        <div class="bg-white p-10 rounded-[40px] shadow-xl border border-gray-100 mb-10">
            <button onclick="location.href='/logout'" class="w-full py-4 bg-red-500 text-white rounded-2xl font-black hover:bg-red-600 transition-all">LOGOUT</button>
        </div>
        <button onclick="location.href='/'" class="text-slate-400 font-bold uppercase text-[10px] tracking-widest hover:text-slate-900">Back to Hub</button>
    </div></body></html>`;
}

// --- 5. 辅助逻辑 (Cookie 解析与代理) ---
function parseUserFromCookie(cookie) {
  const token = cookie.split('; ').find(row => row.startsWith('auth_token='))?.split('=')[1];
  if (!token) return null;
  const payload = JSON.parse(atob(token.split('.')[1]));
  return { uid: payload.uid, username: payload.username, role: payload.role || 'free', avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=" + payload.username };
}

async function proxyToBackend(request, backendUrl, env) {
  const url = new URL(request.url);
  const targetUrl = backendUrl + url.pathname + url.search;
  const newHeaders = new Headers(request.headers);
  const user = parseUserFromCookie(request.headers.get("Cookie") || "");
  if (user) { newHeaders.set("X-User-Id", user.uid); newHeaders.set("X-User-Role", user.role); }
  if (env?.GATEWAY_SECRET) newHeaders.set("X-Gateway-Secret", env.GATEWAY_SECRET);
  return fetch(new Request(targetUrl, { method: request.method, headers: newHeaders, body: request.body, redirect: 'follow' }));
}
