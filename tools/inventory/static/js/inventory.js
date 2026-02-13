/**
 * 元器件管理系统核心逻辑 v4.2 (去封装稳健版)
 * 修复：移除 IIFE 闭包，确保 HTML onclick 能直接调用所有函数
 */

// 全局变量
let modals = {};
let importData = { columns: [], raw: [], mapping: {}, conflicts: [], uniques: [] };
let codeReader = null;
let scanModalObj = null;

// --- 1. 基础 UI 控制 ---
function openModal(id) {
    const el = document.getElementById(id);
    if (!el) return console.error('Modal not found:', id);
    if (typeof bootstrap === 'undefined') return alert('资源加载中，请稍候...','请勿刷新界面');
    if (!modals[id]) modals[id] = new bootstrap.Modal(el, { backdrop: 'static' });
    modals[id].show();
}

function closeModal(id) { 
    if (modals[id]) modals[id].hide(); 
}

function showLoading(title = '正在处理中...', subMsg = '别着急请稍候...请勿刷新界面') {
    const el = document.getElementById('globalLoading');
    if(el) {
        const h5 = el.querySelector('h5'); if(h5) h5.innerText = title;
        const p = el.querySelector('p'); if(p) p.innerText = subMsg;
        el.classList.remove('hidden');
        el.classList.add('flex');
    }
}

function hideLoading() {
    const el = document.getElementById('globalLoading');
    if(el) {
        el.classList.add('hidden');
        el.classList.remove('flex');
    }
}

function toggleFilterBar() { 
    const bar = document.getElementById('filterBar');
    if(bar) bar.classList.toggle('d-none-custom'); 
}

// --- 2. 个人中心 ---
async function initUser() {
    try {
        const res = await fetch('/auth/info');
        const data = await res.json();
        const container = document.getElementById('userArea');
        if (!container) return;
        
        if (data.user) {
            const u = data.user;
            const avatar = u.avatar ? (u.avatar + '?v=' + Date.now()) : `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.username}`;
            container.innerHTML = `
                <div class="text-right hidden md:block"><div class="text-[10px] font-bold text-slate-900">${u.username}</div><div class="text-[8px] font-bold text-blue-600 uppercase mt-1">${u.role}</div></div>
                <img src="${avatar}" class="w-10 h-10 rounded-full border shadow-sm object-cover bg-gray-100">
                <div class="dropdown-menu-content absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-2xl border border-gray-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 p-2 z-[1000]">
                    <a href="/profile?from=inventory" class="flex items-center gap-3 px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50 rounded-lg no-underline"><i class="ri-user-settings-line"></i> 个人中心</a>
                    <button onclick="event.stopPropagation(); logout()" class="w-full flex items-center gap-3 px-4 py-2 text-xs font-bold text-red-500 hover:bg-red-50 rounded-lg transition text-left border-0 bg-transparent mt-1"><i class="ri-logout-box-r-line"></i> 退出登录</button>
                </div>`;
            
            // 绑定点击跳转逻辑，排除下拉菜单内容
            container.onclick = (e) => {
                if (!e.target.closest('.dropdown-menu-content')) {
                    location.href = '/profile?from=inventory';
                }
            };
        } else {
            container.innerHTML = '<a href="/login.html" class="text-xs font-bold text-blue-600">Login</a>';
        }
    } catch (e) { console.warn('User init error', e); }
}

async function logout() { 
    try { await fetch('/auth/logout'); } catch(e) {} 
    location.href = '/'; 
}

// --- 3. 批量操作 ---
function toggleSelectAll() {
    const allBox = document.getElementById('selectAll');
    if(!allBox) return;
    const all = allBox.checked;
    document.querySelectorAll('.row-checkbox').forEach(cb => cb.checked = all);
    updateBatchBtn();
}

function updateBatchBtn() {
    const count = document.querySelectorAll('.row-checkbox:checked').length;
    const counter = document.getElementById('selectedCount');
    if(counter) { 
        counter.innerText = count; 
        counter.style.display = count > 0 ? 'inline-block' : 'none'; 
    }
    const btnDel = document.getElementById('btnBatchDel');
    const btnEdit = document.getElementById('btnBatchEdit');
    if(btnDel) btnDel.disabled = (count === 0);
    if(btnEdit) btnEdit.disabled = (count === 0);
}

async function batchDelete(url) {
    const ids = Array.from(document.querySelectorAll('.row-checkbox:checked')).map(cb => cb.value);
    if(ids.length && confirm(`确认删除 ${ids.length} 项?`)) {
        showLoading('正在批量移除', '正在删除云端数据...请勿刷新界面');
        const body = new URLSearchParams();
        ids.forEach(id => body.append('ids[]', id));
        try { await fetch(url, { method: 'POST', body }); window.location.reload(); } catch(e) { hideLoading(); }
    }
}

function openBatchEdit() {
    const count = document.querySelectorAll('.row-checkbox:checked').length;
    if(count === 0) return alert('请先勾选');
    const badge = document.getElementById('batchCount');
    if(badge) badge.innerText = count;
    openModal('batchEditModal');
}

async function submitBatchEdit() {
    const ids = Array.from(document.querySelectorAll('.row-checkbox:checked')).map(cb => cb.value);
    const updates = {};
    const fields = ['category', 'name', 'model', 'package', 'location', 'supplier', 'channel', 'unit', 'price', 'remark'];
    let hasChange = false;
    fields.forEach(f => {
        const el = document.getElementById(`batch_${f}`);
        if(el && el.value.trim() !== '') { updates[f] = el.value.trim(); hasChange = true; }
    });
    if(!hasChange) return alert('未输入内容');
    
    closeModal('batchEditModal');
    showLoading('批量更新', '正在同步...');
    try {
        const res = await fetch(CONFIG.apiBatchUpd, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ids, updates }) }).then(r=>r.json());
        if(res.success) window.location.reload();
        else { hideLoading(); alert(res.error); }
    } catch(e) { hideLoading(); }
}

// --- 4. 编辑与删除 ---
async function openEditModal(id) {
    showLoading('读取档案');
    try {
        const res = await fetch(`/inventory/get/${id}`).then(r => r.json());
        hideLoading();
        if(res.success) {
            const d = res.data;
            const form = document.getElementById('editForm');
            if(form) form.action = `/inventory/update/${id}`;
            
            ['category','name','model','package','unit','location','supplier','channel','remark'].forEach(k => {
                const el = document.getElementById(`edit_${k}`);
                if(el) el.value = d[k] || '';
            });
            
            const qEl = document.getElementById('edit_quantity'); if(qEl) qEl.value = d.quantity || 0;
            const pEl = document.getElementById('edit_price'); if(pEl) pEl.value = d.price || 0.0;
            const bEl = document.getElementById('edit_buy_time'); if(bEl) bEl.value = d.buy_time || '';
            
            const imgPre = document.querySelector('.part-img-preview');
            if(imgPre) imgPre.src = d.img_path || '';
            const qrPre = document.querySelector('.qr-preview');
            if(qrPre) qrPre.src = d.qrcode_path ? (d.qrcode_path + '?v=' + Date.now()) : '';
            
            // 文档链接
            const docLinks = document.querySelectorAll('.doc-link');
            if(d.doc_path) {
                docLinks[0].href = `/inventory/view_doc/${id}`;
                docLinks.forEach(el => el.classList.remove('hidden'));
            } else {
                docLinks.forEach(el => el.classList.add('hidden'));
            }
            // 多文档列表
            const docsList = document.getElementById('edit_docs_list');
            if(docsList) {
                if(d.docs && d.docs.length > 0) {
                    docsList.innerHTML = d.docs.map(doc => `
                        <div id="doc_item_${doc.id}" class="flex items-center justify-between bg-white p-2 px-3 rounded-lg border border-slate-200 mb-1 shadow-sm text-[10px]">
                            <div class="truncate font-bold text-slate-600 flex items-center gap-2"><i class="ri-file-pdf-line text-red-400"></i> ${doc.file_name}</div>
                            <div class="flex gap-2 shrink-0"><a href="${doc.file_url}" target="_blank" class="text-blue-500 font-black no-underline">查看</a><button type="button" onclick="deleteDoc(${doc.id})" class="text-red-400 font-black border-0 bg-transparent">清空</button></div>
                        </div>`).join('');
                } else { docsList.innerHTML = '<p class="text-[9px] text-slate-300 text-center py-2 italic">无技术手册</p>'; }
            }
            openModal('editModal');
        }
    } catch(e) { hideLoading(); }
}

async function deleteItem(id) {
    if(!id || !confirm('确认永久删除?')) return;
    showLoading('删除中');
    try { await fetch(`/inventory/delete/${id}`); window.location.reload(); } catch(e) { hideLoading(); }
}

async function deleteComponent() {
    const form = document.getElementById('editForm');
    if(!form) return;
    const id = form.action.split('/').pop();
    if(id) await deleteItem(id);
}

async function regenerateQR() {
    const form = document.getElementById('editForm');
    if(!form) return;
    const id = form.action.split('/').pop();
    if(!id) return;
    showLoading('刷新二维码','正在为您更新数据库...请勿刷新页面');
    try {
        const res = await fetch(`/inventory/regenerate_qr/${id}`).then(r => r.json());
        hideLoading();
        if(res.success) { 
            const el = document.querySelector('.qr-preview');
            if(el) el.src = res.qrcode_path + '?v=' + Date.now();
            alert('已刷新');
        }
    } catch(e) { hideLoading(); }
}

async function deleteDoc(docId) {
    if(!confirm('清空此文档?')) return;
    try {
        const res = await fetch(`/inventory/docs/delete/${docId}`, { method: 'POST' }).then(r => r.json());
        if(res.success) { const el = document.getElementById(`doc_item_${docId}`); if(el) el.remove(); }
    } catch(e) {}
}

async function deleteFile(field) {
    const action = document.getElementById('editForm').action;
    const id = action.split('/').pop();
    if(!id || !confirm('确认删除?')) return;
    try {
        const res = await fetch(`/inventory/delete_file/${id}/${field}`).then(r => r.json());
        if(res.success) {
            if(field === 'img_path') document.querySelector('.part-img-preview').src = '';
            else if(field === 'doc_path') document.querySelectorAll('.doc-link').forEach(el => el.classList.add('hidden'));
            alert('成功移除');
        }
    } catch(e) { hideLoading(); }
}

// --- 5. BOM 导入 ---
function openImportModal() { openModal('importModal'); switchStep(1); }

function switchStep(n) {
    [1,2,3].forEach(i => {
        const el = document.getElementById(`stepContent${i}`);
        if(el) el.classList.toggle('hidden', i!==n);
        const dot = document.getElementById(`stepDot${i}`);
        if(dot) dot.className = i<=n ? 'w-10 h-10 rounded-2xl bg-black text-white flex items-center justify-center font-bold' : 'w-10 h-10 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center font-bold';
    });
    const btn = document.getElementById('nextBtn');
    if(btn) {
        btn.classList.toggle('hidden', n===1);
        btn.innerText = n===3 ? '确认同步' : '下一步';
        btn.onclick = n===2 ? () => verifyConflicts(CONFIG.apiImportVerify) : () => executeImport(CONFIG.apiImportExecute);
    }
}

async function uploadSource(mode) {
    let fd = new FormData(); fd.append('mode', mode);
    const fileIn = document.getElementById('fileInput');
    const pasteIn = document.getElementById('pasteInput');
    if(mode === 'file' && fileIn) fd.append('file', fileIn.files[0]);
    else if (pasteIn) fd.append('text', pasteIn.value);
    
    showLoading('正在解析表格','正在为您加速解析...请勿刷新页面');
    try {
        const res = await fetch(CONFIG.apiImportParse, { method:'POST', body:fd }).then(r=>r.json());
        hideLoading();
        if(res.success) {
            importData = res;
            const stats = document.getElementById('parseStats');
            if(stats) stats.innerText = `解析: ${res.total_rows} 条`;
            
            const rawTab = document.getElementById('rawPreviewTab');
            if(rawTab) {
                let html = `<thead class="bg-slate-100 text-slate-500"><tr>${res.columns.map(c=>`<th class="p-2 border-b text-center font-bold text-[10px]">${c}</th>`).join('')}</tr></thead><tbody>`;
                res.preview.forEach(row => {
                    html += `<tr>${row.map(cell=>`<td class="p-2 border-b text-center text-slate-600 text-[10px]">${cell}</td>`).join('')}</tr>`;
                });
                rawTab.innerHTML = html + '</tbody>';
            }
            renderMappingGrid();
        } else alert(res.error);
    } catch(e) { hideLoading(); }
}

function renderMappingGrid() {
    const grid = document.getElementById('mappingGrid');
    if(!grid) return;
    grid.innerHTML = importData.columns.map(col => `
        <div class="bg-white p-3 rounded-xl border border-slate-200 shadow-sm text-center">
            <div class="text-[10px] text-slate-400 font-black uppercase mb-1 truncate">${col}</div>
            <select onchange="importData.mapping['${col}'] = this.value; updateMappedPreview()" class="w-full bg-slate-50 border-0 text-[11px] font-bold p-1 rounded-lg">
                <option value="">(忽略)</option>
                ${CONFIG.systemFields.map(f=>`<option value="${f[0]}" ${importData.mapping[col]===f[0]?'selected':''}>${f[1]}</option>`).join('')}
            </select>
        </div>`).join('');
    updateMappedPreview();
    switchStep(2);
}

function updateMappedPreview() {
    const tab = document.getElementById('mappedPreviewTab');
    const container = document.getElementById('mappedPreviewContainer');
    if(!tab || !container) return;
    
    const selected = CONFIG.systemFields.filter(f => Object.values(importData.mapping).includes(f[0]));
    if(!selected.length) { container.classList.add('hidden'); return; }
    container.classList.remove('hidden');
    
    let html = `<thead class="bg-green-50 text-green-700"><tr>${selected.map(f=>`<th class="p-2 border-b font-black text-center text-[10px]">${f[1]}</th>`).join('')}</tr></thead><tbody>`;
    importData.raw_data.slice(0,3).forEach(r => {
        html += `<tr>${selected.map(f => { const col = Object.keys(importData.mapping).find(k => importData.mapping[k] === f[0]); return `<td class="p-2 text-center text-[10px] font-bold">${r[col]||'-'}</td>`; }).join('')}</tr>`;
    });
    tab.innerHTML = html + `</tbody>`;
}

async function verifyConflicts(url) {
    showLoading('正在校验数据','请稍等片刻...请勿刷新页面');
    try {
        const body = JSON.stringify({ mapping:importData.mapping, raw_data:importData.raw_data });
        const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body }).then(r=>r.json());
        hideLoading();
        if(res.success) {
            importData.conflicts = res.conflicts;
            importData.uniques = res.uniques;
            renderConflictCards(); 
            switchStep(3);
        }
    } catch(e) { hideLoading(); alert('校验请求异常'); }
}

function renderConflictCards() {
    const list = document.getElementById('conflictList');
    const header = document.getElementById('importStatsHeader');
    if(header) {
        header.innerHTML = `<span class="text-green-600 font-bold">新增 ${importData.uniques.length}</span> | <span class="text-orange-500 font-bold">冲突 ${importData.conflicts.length}</span>`;
        header.classList.remove('hidden');
    }
    
    list.innerHTML = importData.conflicts.map((c, i) => `
        <div id="conflict-card-${i}" class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm transition-all flex flex-col h-full">
            <div class="flex items-center gap-2 mb-3">
                <div class="w-8 h-8 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center font-bold text-xs shrink-0">!</div>
                <div class="flex-1 min-w-0"><h4 class="font-black text-[11px] text-slate-800 truncate">${c.new.name}</h4><p class="text-[9px] text-slate-400 font-mono truncate">${c.new.model}</p></div>
            </div>
            <div id="diff-area-${i}" class="flex-1 bg-slate-50/50 rounded-xl p-2 mb-3 border border-slate-100 min-h-[60px] flex flex-col justify-center text-[9px]"></div>
            <div class="flex bg-slate-100 p-1 rounded-xl">
                ${['merge','cover','new','skip'].map(s => `<button onclick="setStrat(${i},'${s}')" id="btn-${i}-${s}" class="strat-btn flex-1 py-1.5 text-[9px] font-black uppercase rounded-lg transition-all">${s}</button>`).join('')}
                <input type="hidden" id="strat-${i}" value="merge">
            </div>
        </div>`).join('');
    importData.conflicts.forEach((_, i) => setStrat(i, 'merge'));
}

function setStrat(i, s) {
    const c = importData.conflicts[i]; const card = document.getElementById(`conflict-card-${i}`); const diffArea = document.getElementById(`diff-area-${i}`);
    const fieldNames = {category:'品类', name:'品名', model:'型号', package:'封装', location:'位置', price:'单价', unit:'单位', supplier:'供应商', channel:'渠道', buy_time:'时间', remark:'备注'};
    document.getElementById(`strat-${i}`).value = s;
    card.classList.toggle('opacity-40', s === 'skip'); card.classList.toggle('grayscale', s === 'skip');

    ['merge','cover','new','skip'].forEach(b => {
        const btn = document.getElementById(`btn-${i}-${b}`);
        const isActive = (b === s);
        let colorClass = 'text-slate-400';
        if(isActive) {
            if(s==='merge') colorClass = 'bg-blue-50 text-blue-600 shadow-sm border border-blue-100';
            else if(s==='cover') colorClass = 'bg-red-50 text-red-500 shadow-sm border border-red-100';
            else if(s==='new') colorClass = 'bg-green-50 text-green-600 shadow-sm border border-green-100';
            else colorClass = 'bg-slate-100 text-slate-500 shadow-sm border border-slate-200';
        } else colorClass = 'text-slate-400 hover:bg-slate-50';
        btn.className = `strat-btn flex-1 py-1.5 text-[9px] font-black uppercase rounded-lg transition-all ${colorClass}`;
    });

    const oldQ = parseInt(c.old.quantity||0); const newQ = parseInt(c.new.quantity||0);
    let html = '';

    if(s === 'skip') html = `<div class="h-full flex items-center justify-center font-bold text-slate-300">跳过</div>`;
    else if(s === 'new') html = `<div class="h-full flex items-center justify-center font-bold text-green-600">存为新记录</div>`;
    else {
        html += `<div class="flex justify-between items-center text-[10px] mb-2 pb-1 border-b border-slate-100 font-black"><span class="${s==='cover'?'text-red-400':'text-blue-400'}">${s==='merge'?'库存累加':'覆盖更新'}</span><span class="text-slate-700">${s==='merge' ? (oldQ + ' + ' + newQ + ' = ' + (oldQ+newQ)) : (oldQ + ' / ' + newQ)}</span></div>`;
        let diffs = [];
        for(let f in c.diff) {
            if(c.diff[f] && f !== 'quantity') {
                const oldV = c.old[f] || '-'; const newV = c.new[f] || '-';
                let content = s === 'cover' ? `<span class="line-through text-slate-300 decoration-red-300 mr-1">${oldV}</span><span class="text-red-500">${newV}</span>` : `<span class="text-slate-400">${oldV}</span> / <span class="text-blue-500">${newV}</span>`;
                diffs.push(`<div class="flex justify-between items-center text-[9px] py-0.5 border-b border-slate-50 last:border-0"><span class="text-slate-400 font-bold">${fieldNames[f]||f}</span><div class="text-right truncate font-bold">${content}</div></div>`);
            }
        }
        html += diffs.join('') || '<div class="text-center italic text-slate-300 py-2">无其他差异</div>';
    }
    diffArea.innerHTML = html;
}

async function executeImport(url) {
    if(!confirm('确认执行同步?')) return;
    showLoading('同步中', '正在写入数据库...请勿刷新界面');
    const resolved = importData.conflicts.map((c, i) => ({ strategy: document.getElementById(`strat-${i}`).value, new: c.new, old_id: c.old.id }));
    try {
        const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ uniques: importData.uniques, resolved }) }).then(r=>r.json());
        if(res.success) window.location.reload();
    } catch(e) { hideLoading(); }
}

// --- 6. 导出中心 ---
function openExportModal() {
    const count = document.querySelectorAll('.row-checkbox:checked').length || document.querySelectorAll('.row-checkbox').length;
    const countEl = document.getElementById('exportCount');
    if(countEl) countEl.innerText = count;
    loadExportHistory();
    openModal('exportModal');
}
function closeExportModal() { closeModal('exportModal'); }

function toggleFilenameInput() {
    const mode = document.getElementById('filenameMode').value;
    const input = document.getElementById('customFilename');
    if(input) input.classList.toggle('hidden', mode !== 'custom');
}

async function loadExportHistory() {
    const list = document.getElementById('exportHistoryList');
    if(!list) return;
    list.innerHTML = '<div class="text-center py-4"><div class="spinner-border spinner-border-sm text-slate-300"></div></div>';
    try {
        const res = await fetch('/inventory/get_export_files').then(r => r.json());
        if(res.files && res.files.length > 0) {
            list.innerHTML = res.files.map(f => `
                <div class="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center mb-2 group">
                    <div class="truncate"><div class="text-xs font-bold text-slate-700 truncate" title="${f.name}">${f.name}</div><div class="text-[9px] text-slate-400 mt-0.5">${f.time} · ${f.size}</div></div>
                    <div class="flex items-center gap-1 shrink-0"><a href="/inventory/static/exports/${f.name}" download class="text-slate-400 hover:text-blue-600 transition p-1"><i class="bi bi-download"></i></a><button onclick="deleteExportFile('${f.name}')" class="text-slate-400 hover:text-red-500 transition p-1 border-0 bg-transparent"><i class="bi bi-trash"></i></button></div>
                </div>`).join('');
        } else { list.innerHTML = '<div class="text-center text-slate-300 text-xs py-10 italic">暂无记录</div>'; }
    } catch(e) { list.innerHTML = '加载失败'; }
}

async function deleteExportFile(filename) {
    if(!confirm('删除历史文件?')) return;
    await fetch(`/inventory/delete_export_file/${filename}`).then(r => r.json());
    loadExportHistory();
}

async function clearExportHistory() {
    if(!confirm('清空所有记录?')) return;
    await fetch('/inventory/clear_export_history');
    loadExportHistory();
}

async function submitExport() {
    showLoading('正在生成文件','同步数据库中...请问刷新界面');
    const fd = new FormData();
    const ids = Array.from(document.querySelectorAll('.row-checkbox:checked')).map(cb => cb.value);
    if(ids.length > 0) fd.append('ids', ids.join(','));
    document.querySelectorAll('input[name="export_fields"]:checked').forEach(cb => fd.append('fields', cb.value));
    const fmt = document.querySelector('input[name="export_fmt"]:checked').value;
    fd.append('format', fmt);
    if(fmt === 'zip' && document.getElementById('exportAssets').checked) fd.append('with_assets', '1');
    const mode = document.getElementById('filenameMode').value;
    fd.append('filename_mode', mode);
    if(mode === 'custom') fd.append('custom_filename', document.getElementById('customFilename').value);
    
    try {
        const res = await fetch('/inventory/export', { method: 'POST', body: fd });
        if(res.ok) {
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url;
            let filename = `export.${fmt}`;
            const disp = res.headers.get('Content-Disposition');
            if (disp && disp.includes('filename=')) filename = disp.split('filename=')[1].replace(/['"]/g, '');
            a.download = filename; document.body.appendChild(a); a.click(); a.remove();
            loadExportHistory();
        }
    } catch(e) { alert('导出失败'); } finally { hideLoading(); }
}

// --- 7. 扫码与备份 ---
function openScanModal() { const el = document.getElementById('scanModal'); if(el) { scanModalObj = new bootstrap.Modal(el); scanModalObj.show(); } }
function closeScanModal() { if(codeReader) { codeReader.reset(); codeReader = null; } document.getElementById('cameraArea').classList.add('hidden'); if(scanModalObj) scanModalObj.hide(); }
async function startScanner() {
    document.getElementById('cameraArea').classList.remove('hidden');
    try {
        codeReader = new ZXing.BrowserMultiFormatReader();
        await codeReader.decodeFromVideoDevice(undefined, document.getElementById('videoElement'), (res) => {
            if(res) { closeScanModal(); openEditModal(res.text.includes('"id"') ? JSON.parse(res.text).id : res.text); }
        });
    } catch(e) { alert('启动失败'); }
}
async function scanFromFile(input) {
    if(!input.files[0]) return;
    try {
        const reader = new ZXing.BrowserMultiFormatReader();
        const res = await reader.decodeFromImageUrl(URL.createObjectURL(input.files[0]));
        closeScanModal(); openEditModal(res.text.includes('"id"') ? JSON.parse(res.text).id : res.text);
    } catch(e) { alert('识别失败'); }
}

async function runBackup() {
    showLoading('正在加急全量备份', '正在打包云端数据...请勿刷新界面');
    try {
        const res = await fetch('/inventory/backup');
        if(res.ok) {
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `Backup_${Date.now()}.zip`; a.click();
        }
    } finally { hideLoading(); }
}

async function submitRestore(input) {
    if(!input.files[0] || !confirm('确认还原?')) return;
    showLoading('还原中', '正在解压同步...请勿刷新界面');
    const fd = new FormData(); fd.append('backup_zip', input.files[0]);
    try {
        const res = await fetch('/inventory/restore', { method: 'POST', body: fd }).then(r => r.json());
        if(res.success) window.location.reload();
        else { hideLoading(); alert('失败: ' + res.error); }
    } catch(e) { hideLoading(); }
}

// --- 8. 初始化 ---
function initDragAndDrop() {
    const dz = document.getElementById('dropZone'); if(!dz) return;
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('border-blue-500'); });
    dz.addEventListener('dragleave', e => { dz.classList.remove('border-blue-500'); });
    dz.addEventListener('drop', e => { 
        e.preventDefault(); dz.classList.remove('border-blue-500');
        if(e.dataTransfer.files.length) { document.getElementById('fileInput').files = e.dataTransfer.files; uploadSource('file'); }
    });
}

window.addEventListener('DOMContentLoaded', () => {
    initUser();
    initDragAndDrop();
    updateBatchBtn();
    
    // 显式绑定菜单事件 (双重保险)
    const btnBackup = document.getElementById('menuBtnBackup');
    if(btnBackup) btnBackup.addEventListener('click', runBackup);
    
    const btnRestore = document.getElementById('menuBtnRestore');
    if(btnRestore) btnRestore.addEventListener('click', () => openModal('restoreModal'));
});