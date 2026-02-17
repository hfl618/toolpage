/**
 * Serial Studio Pro v3.9 - Global Stability Patch
 */

// 1. 全局状态
let port, reader, writer;
let keepReading = false;
let rxCount = 0;
let txHistory = [];
let historyIndex = -1;
let isTerminalHovered = false;
let lastLogTime = Date.now(); 
let lineBuffer = "";
let demoTimer = null;

// 配置数据
let macros = [];
let macroTimers = {};
let autoReplies = [];
let highlightRules = [{ word: 'ERROR', class: 'hl-error' }, { word: 'SUCCESS', class: 'hl-success' }];
let seriesData = {};

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
const utf8Decoder = new TextDecoder('utf-8');
const gbkDecoder = new TextDecoder('gbk');

// 2. 初始化
document.addEventListener('DOMContentLoaded', () => {
    const term = document.getElementById('terminal');
    if (term) {
        term.addEventListener('mouseenter', () => { isTerminalHovered = true; });
        term.addEventListener('mouseleave', () => { isTerminalHovered = false; });
    }
    
    document.getElementById('txInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (historyIndex < txHistory.length - 1) {
                historyIndex++;
                e.target.value = txHistory[txHistory.length - 1 - historyIndex];
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (historyIndex > 0) {
                historyIndex--;
                e.target.value = txHistory[txHistory.length - 1 - historyIndex];
            } else if (historyIndex === 0) {
                historyIndex = -1;
                e.target.value = '';
            }
        }
    });

    loadPersistedData();
    renderMacros();
    renderAutoReplies();
    initHighlighter();
});

function loadPersistedData() {
    try {
        const sm = localStorage.getItem('serial_macros'); if (sm) macros = JSON.parse(sm);
        const sa = localStorage.getItem('serial_auto_replies'); if (sa) autoReplies = JSON.parse(sa);
        const sh = localStorage.getItem('serial_highlights'); if (sh) highlightRules = JSON.parse(sh);
    } catch(e){}
    if (!macros.length) macros = [{ label: 'HELP', cmd: 'help', interval: 0, isHex: false }];
}

// 3. UI 交互逻辑 (必须全局可见)

async function toggleConnection() {
    const btn = document.getElementById('connectBtn');
    const dot = document.getElementById('statusDot');
    if (port) {
        keepReading = false;
        try { if(reader) await reader.cancel(); port = null; } catch(e){}
        if(btn) { 
            btn.innerHTML = currentLang === 'zh' ? '<i class="ri-plug-line"></i> 开启连接' : '<i class="ri-plug-line"></i> Open Connection'; 
            btn.classList.remove('btn-connect-active'); 
        }
        if(dot) dot.classList.remove('connected');
        return;
    }
    try {
        if (!navigator.serial) return alert(currentLang === 'zh' ? "浏览器不支持 Web Serial API" : "Web Serial API not supported");
        port = await navigator.serial.requestPort();
        const baud = parseInt(document.getElementById('baudRate').value) || 115200;
        await port.open({ baudRate: baud });
        if(btn) { 
            btn.innerHTML = currentLang === 'zh' ? '<i class="ri-plug-fill"></i> 断开连接' : '<i class="ri-plug-fill"></i> Disconnect'; 
            btn.classList.add('btn-connect-active'); 
        }
        if(dot) dot.classList.add('connected');
        appendLogStream("System", `Connected: ${baud}\n`);
        keepReading = true; readLoop();
    } catch (e) { 
        if (e.name === 'NetworkError') alert(currentLang === 'zh' ? "连接失败：串口可能已被占用（如 idf.py monitor）。请先关闭占用进程。" : "Connection failed: Port might be busy.");
        else alert(e.message); 
    }
}

function resetTerminal() { clearLog(); seriesData = {}; renderChart(); appendLogStream("System", "View Reset\n"); }
function toggleChart() { const container = document.getElementById('chartContainer'); const isShow = document.getElementById('showChart')?.checked; if(container) container.classList.toggle('hidden', !isShow); if(isShow) renderChart(); }
function toggleTimeMode(explicitMode) { 
    const el = document.getElementById('tsMode'); 
    if(!el) return;
    
    // 如果没有传入明确模式(点击时间戳时)，则翻转
    if (explicitMode === undefined) {
        el.value = el.value === 'abs' ? 'delta' : 'abs'; 
    } else {
        // 如果是从下拉框选中的，直接使用选中的值
        el.value = explicitMode;
    }

    const msg = el.value === 'abs' ? 'Time: Absolute' : 'Time: Delta (+ms)';
    if(window.showToast) showToast(msg);
}

function clearLog() { const term = document.getElementById('terminal'); if(term) term.innerHTML = ""; rxCount = 0; document.getElementById('rxCounter').innerText = "0"; lineBuffer = ""; }
function showAutoReplyEditor() { document.getElementById('autoReplyEditor')?.classList.remove('hidden'); }
function hideAutoReplyEditor() { document.getElementById('autoReplyEditor')?.classList.add('hidden'); }
function showMacroEditor() { document.getElementById('macroEditor')?.classList.remove('hidden'); }
function hideMacroEditor() { document.getElementById('macroEditor')?.classList.add('hidden'); }

// 4. 数据处理流
function appendLogStream(type, text, isHexMode = false, isSim = false) {
    const term = document.getElementById('terminal');
    if(!term || !text) return;

    const forceNew = (type !== 'RX' || isHexMode || !lastEntryElement || lastEntryElement.dataset.type !== type || lastEntryElement.dataset.finalized === "true");

    if (forceNew) {
        const now = Date.now();
        let timeStr = "";
        const tsMode = document.getElementById('tsMode')?.value || 'abs';
        if (tsMode === 'delta') { 
            timeStr = `+${lastLogTime ? (now - lastLogTime) : 0}ms`; 
        } else { 
            timeStr = new Date(now).toLocaleTimeString('zh-CN', { hour12: false }); 
        }
        // 无论何种模式都更新 lastLogTime，保证切换时的增量准确
        lastLogTime = now;

        const div = document.createElement('div');
        div.className = 'log-entry';
        div.dataset.type = type;
        const colorClass = (type === 'TX') ? 'tx-msg' : (type === 'Auto' ? 'auto-msg' : (type === 'System' ? 'sys-msg' : 'rx-msg'));
        div.innerHTML = `<span class="timestamp" onclick="toggleTimeMode()">[${timeStr}]</span>${isSim?'<span class="badge-sim">SIM</span>':''}<span class="opacity-50 mr-1 font-bold text-[10px]">${type}:</span><span class="content-body ${isHexMode?'rx-hex':colorClass}">${text}</span>`;
        term.appendChild(div);
        lastEntryElement = div;
    } else {
        const body = lastEntryElement.querySelector('.content-body');
        if (body) body.textContent += text;
    }

    if (text.includes('\n')) lastEntryElement.dataset.finalized = "true";
    if (term.children.length > 1000) term.removeChild(term.firstChild);
    if (document.getElementById('autoScroll')?.checked && !isTerminalHovered) {
        requestAnimationFrame(() => { term.scrollTop = term.scrollHeight; });
    }

    if (type === 'RX' && !isHexMode) {
        processWaveform(text);
        checkAutoReply(text);
        // 性能优化：在循环外转换一次大写
        const upperText = text.toUpperCase();
        highlightRules.forEach(rule => { 
            if (upperText.includes(rule.word)) lastEntryElement.classList.add(rule.class); 
        });
    }
}

function processData(uint8, isSim = false) {
    rxCount += uint8.length;
    const c = document.getElementById('rxCounter'); if(c) c.innerText = rxCount;
    const viewMode = document.getElementById('dataViewMode')?.value || 'text';
    const encoding = document.getElementById('textEncoding')?.value || 'utf-8';

    if (viewMode === 'hex') {
        appendLogStream("RX", Array.from(uint8).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ') + " ", true, isSim);
    } else if (viewMode === 'rgb') {
        appendLogRGB(uint8, isSim);
    } else if (viewMode === 'dec') {
        appendLogStream("RX", uint8.join(' ') + " ", false, isSim);
    } else {
        const text = (encoding === 'gbk' ? gbkDecoder : utf8Decoder).decode(uint8, { stream: true });
        appendLogStream("RX", text, false, isSim);
    }
}

function appendLogRGB(data, isSim) {
    const term = document.getElementById('terminal');
    let extraHtml = "";
    for (let i = 0; i < data.length; i += 3) {
        if (i + 2 < data.length) {
            extraHtml += `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:rgb(${data[i]},${data[i+1]},${data[i+2]});border:1px solid #ddd;margin-right:4px;"></span>`;
        }
    }
    const div = document.createElement('div');
    div.className = 'log-entry';
    div.innerHTML = `<span class="timestamp">[RGB]</span>${isSim?'<span class="badge-sim">SIM</span>':''}<span class="opacity-50 mr-1 font-bold text-[10px]">RX:</span>${extraHtml} Binary Color Data`;
    term.appendChild(div);
    lastEntryElement = null;
}

// 5. 仿真
function toggleDemoMode() {
    const isDemo = document.getElementById('demoMode')?.checked;
    if (isDemo) {
        appendLogStream("System", "SIM Mode Started\n", false, true);
        document.getElementById('statusDot')?.classList.add('connected');
        demoTimer = setInterval(() => {
            const mode = Math.random();
            if (mode > 0.8) processData(new Uint8Array([Math.random()*255, Math.random()*255, Math.random()*255]), true);
            else processData(new TextEncoder().encode(`temp:${(Math.random()*5+25).toFixed(1)},humi:${(Math.random()*10+40).toFixed(1)}\n`), true);
        }, 1000);
    } else {
        clearInterval(demoTimer); document.getElementById('statusDot')?.classList.remove('connected');
        appendLogStream("System", "SIM Mode Stopped\n");
    }
}

// 6. 宏与自动化
function renderMacros() {
    const grid = document.getElementById('macroGrid'); if(!grid) return;
    grid.innerHTML = macros.map((m, i) => `
        <div class="relative group">
            <button class="btn-macro-item ${macroTimers[i]?'polling':''} pr-16" onclick="handleMacroClick(${i})">
                <div class="truncate">${m.label}</div>
                ${macroTimers[i]?'<span class="absolute top-2 left-2 flex h-2 w-2 rounded-full bg-blue-500 animate-pulse"></span>':''}
            </button>
            <div class="macro-actions">
                <div class="action-circle" title="Edit" onclick="event.stopPropagation(); editMacro(${i})"><i class="ri-edit-line"></i></div>
                <div class="action-circle delete" title="Delete" onclick="event.stopPropagation(); deleteMacro(${i})"><i class="ri-close-line"></i></div>
            </div>
        </div>
    `).join('') + `<button class="btn-macro-item border-dashed border-2 border-slate-200 text-slate-300 flex items-center justify-center" onclick="editMacro(-1)"><i class="ri-add-line text-lg"></i></button>`;
}

function handleMacroClick(i) {
    const m = macros[i];
    if (m.interval > 0) {
        if (macroTimers[i]) { clearInterval(macroTimers[i]); delete macroTimers[i]; renderMacros(); }
        else { macroTimers[i] = setInterval(() => sendText(m.cmd, m.isHex), m.interval); renderMacros(); sendText(m.cmd, m.isHex); }
    } else { sendText(m.cmd, m.isHex); }
}

function editMacro(i) {
    showMacroEditor();
    if (i === -1) {
        document.getElementById('macroIndex').value = "-1";
        document.getElementById('macroLabelInput').value = ""; document.getElementById('macroCmdInput').value = "";
        document.getElementById('macroIntervalInput').value = "0"; document.getElementById('macroIsHex').checked = false;
    } else {
        const m = macros[i];
        document.getElementById('macroIndex').value = i;
        document.getElementById('macroLabelInput').value = m.label; document.getElementById('macroCmdInput').value = m.cmd;
        document.getElementById('macroIntervalInput').value = m.interval || 0; document.getElementById('macroIsHex').checked = !!m.isHex;
    }
}
function saveMacro() {
    const i = parseInt(document.getElementById('macroIndex').value);
    const label = document.getElementById('macroLabelInput').value.trim();
    const cmd = document.getElementById('macroCmdInput').value.trim();
    const interval = parseInt(document.getElementById('macroIntervalInput').value) || 0;
    const isHex = document.getElementById('macroIsHex').checked;
    if(!label || !cmd) return;
    const newM = { label, cmd, interval, isHex };
    if(i === -1) macros.push(newM); else macros[i] = newM;
    localStorage.setItem('serial_macros', JSON.stringify(macros)); renderMacros(); hideMacroEditor();
}
function deleteMacro(i) { if(confirm("Delete?")) { macros.splice(i, 1); localStorage.setItem('serial_macros', JSON.stringify(macros)); renderMacros(); } }

function renderAutoReplies() {
    const list = document.getElementById('autoReplyList'); if(!list) return;
    list.innerHTML = autoReplies.map((r, i) => `
        <div class="dynamic-item text-[10px] group"><div class="text-slate-400 font-black uppercase">If: <span class="text-slate-700">${r.match}</span></div><div class="text-blue-500 font-black uppercase">Re: <span class="text-blue-600">${r.reply}</span></div><div class="macro-actions"><div class="action-circle delete" onclick="removeAutoReply(${i})"><i class="ri-close-line"></i></div></div></div>
    `).join('');
}
function saveAutoReply() {
    const match = document.getElementById('autoMatchInput').value.trim();
    const reply = document.getElementById('autoReplyInput').value.trim();
    if(!match || !reply) return;
    autoReplies.push({ match, reply: reply.replace(/\\r/g, '\r').replace(/\\n/g, '\n') });
    localStorage.setItem('serial_auto_replies', JSON.stringify(autoReplies)); renderAutoReplies(); hideAutoReplyEditor();
}
function removeAutoReply(i) { autoReplies.splice(i, 1); localStorage.setItem('serial_auto_replies', JSON.stringify(autoReplies)); renderAutoReplies(); }

function checkAutoReply(text) {
    if (!text || typeof text !== 'string') return;
    const isDemo = document.getElementById('demoMode')?.checked;
    if (!isDemo && (!port || !port.writable)) return;
    autoReplies.forEach(rule => { if (text.includes(rule.match)) sendText(rule.reply); });
}

function initHighlighter() {
    const saved = localStorage.getItem('serial_highlights');
    if (saved) try { highlightRules = JSON.parse(saved); } catch(e){}
    renderHighlightRules();
}
function renderHighlightRules() {
    const container = document.getElementById('highlightRules'); if(!container) return;
    container.innerHTML = highlightRules.map((r, i) => `
        <div class="dynamic-item text-[10px] group flex justify-between items-center cursor-pointer">
            <span class="${r.class} font-black px-2 py-0.5 rounded transition-all active:scale-95" 
                  onclick="cycleColor(${i})" 
                  title="点击切换颜色">
                ${r.word}
            </span>
            <div class="macro-actions">
                <div class="action-circle delete" onclick="removeHighlight(${i}, event)">
                    <i class="ri-close-line"></i>
                </div>
            </div>
        </div>
    `).join('');
}

function cycleColor(index) {
    const colorClasses = ['hl-error', 'hl-success', 'hl-info', 'hl-warn', 'hl-extra'];
    let currIdx = colorClasses.indexOf(highlightRules[index].class);
    // 切换到下一个颜色
    let nextIdx = (currIdx + 1) % colorClasses.length;
    highlightRules[index].class = colorClasses[nextIdx];
    
    // 保存并重新渲染
    localStorage.setItem('serial_highlights', JSON.stringify(highlightRules)); 
    renderHighlightRules();
    if(window.showToast) showToast("Color Updated");
}

function removeHighlight(index, event) { 
    if (event) event.stopPropagation(); // 阻止点击事件冒泡到父级或同级
    highlightRules.splice(index, 1); 
    localStorage.setItem('serial_highlights', JSON.stringify(highlightRules)); 
    renderHighlightRules(); 
}

function addHighlightRule() {
    const word = prompt(currentLang === 'zh' ? "请输入要标记的关键词 (Keyword):" : "Enter keyword to highlight:"); 
    if (!word) return;
    
    // 定义可选的颜色类
    const colorClasses = ['hl-error', 'hl-success', 'hl-info', 'hl-warn', 'hl-extra'];
    // 根据当前规则数量自动分配下一个颜色，循环使用
    const nextClass = colorClasses[highlightRules.length % colorClasses.length];
    
    highlightRules.push({ word: word.toUpperCase(), class: nextClass });
    localStorage.setItem('serial_highlights', JSON.stringify(highlightRules)); 
    renderHighlightRules();
}

// 7. 发送
async function sendFromInput() {
    const input = document.getElementById('txInput'); if(!input || !input.value) return;
    const text = input.value;
    if (txHistory[txHistory.length - 1] !== text) { txHistory.push(text); if (txHistory.length > 50) txHistory.shift(); }
    historyIndex = -1;
    const isHex = document.getElementById('txHex')?.checked;
    const ending = document.getElementById('lineEnding')?.value || "";
    let data = text;
    if (!isHex) data = data.replace(/\\r/g, '\r').replace(/\\n/g, '\n') + ending.replace(/\\r/g, '\r').replace(/\\n/g, '\n');
    await sendText(data, isHex);
    if (document.getElementById('clearAfterSend')?.checked) input.value = '';
}

async function sendText(data, isHex = false) {
    if (document.getElementById('demoMode')?.checked) {
        appendLogStream("TX", data + (data.includes('\n')?'':'\n'), false, true); 
        setTimeout(() => processData(new TextEncoder().encode(data)), 100); return;
    }
    if (!port || !port.writable) return;
    const writer = port.writable.getWriter();
    try {
        let payload;
        if (isHex) {
            const clean = data.replace(/\s+/g, '');
            payload = new Uint8Array(clean.match(/.{1,2}/g).map(b => parseInt(b, 16)));
            appendLogStream("TX", `[HEX] ${data}\n`);
        } else { payload = new TextEncoder().encode(data); appendLogStream("TX", data + (data.includes('\n')?'':'\n')); }
        await writer.write(payload);
    } catch (e) { console.error(e); } finally { writer.releaseLock(); }
}

// 8. 辅助
function processWaveform(text) {
    if (!document.getElementById('showChart')?.checked) return;
    const kvRegex = /([a-zA-Z_]+):(-?\d+\.?\d*)/g;
    let match; let found = false;
    while ((match = kvRegex.exec(text)) !== null) {
        const key = match[1], val = parseFloat(match[2]);
        if (!seriesData[key]) seriesData[key] = [];
        seriesData[key].push(val); if (seriesData[key].length > 100) seriesData[key].shift();
        found = true;
    }
    if (found) renderChart();
}
function renderChart() {
    const canvas = document.getElementById('waveformCanvas'); if (!canvas || canvas.offsetParent === null) return;
    const ctx = canvas.getContext('2d'); const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width || canvas.height !== rect.height) { canvas.width = rect.width; canvas.height = rect.height; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const keys = Object.keys(seriesData); if (keys.length === 0) return;
    let allVals = [].concat(...Object.values(seriesData));
    const min = Math.min(...allVals), max = Math.max(...allVals), range = (max - min) || 1;
    keys.forEach((key, kIdx) => {
        const data = seriesData[key]; if (data.length < 2) return;
        ctx.beginPath(); ctx.strokeStyle = COLORS[kIdx % COLORS.length]; ctx.lineWidth = 2;
        data.forEach((val, i) => {
            const x = (i / 99) * canvas.width;
            const y = canvas.height - ((val - min) / range) * (canvas.height - 40) - 20;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.fillStyle = COLORS[kIdx % COLORS.length]; ctx.font = 'bold 9px sans-serif';
        ctx.fillText(`${key}: ${data[data.length-1].toFixed(1)}`, 10, 15 + kIdx * 12);
    });
}
function resetChart() { seriesData = {}; renderChart(); }
function filterLogs() {
    const term = document.getElementById('terminal'); const query = document.getElementById('logSearch')?.value.toLowerCase().trim();
    if(!term) return;
    Array.from(term.children).forEach(row => { row.style.display = (!query || row.textContent.toLowerCase().includes(query)) ? '' : 'none'; });
}
function exportMacros() {
    const blob = new Blob([JSON.stringify({macros, autoReplies})], {type:'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `config.json`; a.click();
}
function importMacros() {
    const input = document.createElement('input'); input.type='file';
    input.onchange = e => {
        const reader = new FileReader(); reader.onload = ev => {
            try {
                const conf = JSON.parse(ev.target.result);
                if (conf.macros) macros = conf.macros;
                if (conf.autoReplies) autoReplies = conf.autoReplies;
                localStorage.setItem('serial_macros', JSON.stringify(macros)); renderMacros(); renderAutoReplies();
            } catch(e) {}
        };
        reader.readAsText(e.target.files[0]);
    };
    input.click();
}
function downloadLog() {
    const term = document.getElementById('terminal'); if(!term) return;
    const blob = new Blob([Array.from(term.children).map(el => el.textContent).join('\n')], {type:'text/plain'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `log.txt`; a.click();
}
async function readLoop() {
    while (port?.readable && keepReading) {
        reader = port.readable.getReader();
        try { while (true) { const { value, done } = await reader.read(); if (done) break; if (value) processData(value); } } catch (e) {} finally { reader.releaseLock(); }
    }
}
