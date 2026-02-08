/**
 * 元器件管理核心逻辑 - 终极稳定版
 */
let modals = {};
let importData = { columns: [], raw: [], mapping: {}, conflicts: [], uniques: [] };

// 基础模态框控制
function openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    if (!modals[id]) modals[id] = new bootstrap.Modal(el, { backdrop: 'static' });
    modals[id].show();
}
function closeModal(id) { if (modals[id]) modals[id].hide(); }

function showLoading(title = '请稍候...', subMsg = '系统正在努力工作中...') {
    const el = document.getElementById('globalLoading');
    if(el) {
        el.querySelector('h5').innerText = title;
        const p = el.querySelector('p');
        if(p) p.innerText = subMsg;
        el.classList.remove('hidden');
    }
}
function hideLoading() {
    const el = document.getElementById('globalLoading');
    if(el) el.classList.add('hidden');
}

// 页面加载初始化
window.onload = function() {
    const i = document.getElementById('main-search');
    if (i) { i.focus(); const v = i.value; i.value = ''; i.value = v; }
    initDragAndDrop();
    
    // 全局表单提交拦截
    document.querySelectorAll('form').forEach(form => {
        if(form.id === 'editForm') {
            form.addEventListener('submit', () => showLoading('正在保存更新', '正在同步云端 R2 资源及数据库...'));
        } else if(form.action && form.action.includes('/add')) {
            form.addEventListener('submit', () => showLoading('正在新增入库', '正在生成唯一二维码并同步 R2...'));
        }
    });
};

function toggleFilterBar() { 
    const fb = document.getElementById('filterBar');
    if(fb) fb.classList.toggle('d-none-custom'); 
}

// 批量操作逻辑
function toggleSelectAll() {
    const all = document.getElementById('selectAll').checked;
    document.querySelectorAll('.row-checkbox').forEach(cb => cb.checked = all);
    updateBatchBtn();
}

function updateBatchBtn() {
    const checkboxes = document.querySelectorAll('.row-checkbox:checked');
    const count = checkboxes.length;
    const counter = document.getElementById('selectedCount');
    if (counter) {
        counter.innerText = count > 0 ? `已选中 ${count} 项` : '';
        counter.style.display = count > 0 ? 'inline-block' : 'none';
    }
    const btnDel = document.getElementById('btnBatchDel');
    const btnEdit = document.getElementById('btnBatchEdit');
    if(btnDel && btnEdit) {
        btnDel.disabled = btnEdit.disabled = (count === 0);
        if(count > 0) { btnDel.classList.add('active-del'); btnEdit.classList.add('active-edit'); }
        else { btnDel.classList.remove('active-del'); btnEdit.classList.remove('active-edit'); }
    }
}

async function batchDelete(url) {
    const ids = Array.from(document.querySelectorAll('.row-checkbox:checked')).map(cb => cb.value);
    if(ids.length && confirm(`确定要永久删除这 ${ids.length} 项数据及其云端文件吗?`)) {
        showLoading('正在执行批量删除', '正在从云端彻底移除图片、手册及二维码...');
        const body = new URLSearchParams();
        ids.forEach(id => body.append('ids[]', id));
        try {
            await fetch(url, { method: 'POST', body });
            window.location.reload();
        } catch(e) { hideLoading(); alert('删除失败'); }
    }
}

async function deleteItem(id) {
    if(confirm('确定要永久删除这项数据及云端文件吗？')) {
        showLoading('正在删除元器件', '正在清理云端存储文件...');
        try {
            await fetch(`/inventory/delete/${id}`);
            window.location.reload();
        } catch(e) { hideLoading(); alert('删除失败'); }
    }
}

async function exportSingle(id) {
    document.querySelectorAll('.row-checkbox').forEach(cb => cb.checked = (cb.value == id));
    updateBatchBtn();
    openExportModal();
}

// 批量修改逻辑 (输入即修改)
function openBatchEdit() {
    const count = document.querySelectorAll('.row-checkbox:checked').length;
    const el = document.getElementById('batchCount');
    if(el) el.innerText = count;
    ['category','name','package','location','supplier','channel','unit','price','buy_time','remark'].forEach(f => {
        const input = document.getElementById(`batch_${f}`);
        if(input) input.value = '';
    });
    openModal('batchEditModal');
}

async function submitBatchEdit() {
    const ids = Array.from(document.querySelectorAll('.row-checkbox:checked')).map(cb => cb.value);
    const updates = {};
    ['category','name','package','location','supplier','channel','unit','price','buy_time','remark'].forEach(f => {
        const input = document.getElementById(`batch_${f}`);
        if (input && input.value.trim() !== '') {
            updates[f] = input.value.trim();
        }
    });
    if (Object.keys(updates).length === 0) return alert('未输入任何修改内容');
    
    closeModal('batchEditModal');
    showLoading('正在执行批量修改', '正在更新数据库记录...');
    try {
        const res = await fetch(CONFIG.apiBatchUpd, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids, updates })
        }).then(r => r.json());
        if (res.success) window.location.reload();
        else { hideLoading(); alert('修改失败: ' + res.error); openModal('batchEditModal'); }
    } catch(e) { hideLoading(); alert('网络错误'); openModal('batchEditModal'); }
}

// ---------------- 扫码查找逻辑 ----------------
let codeReader = null;
let scanModalObj = null;

function openScanModal() {
    const el = document.getElementById('scanModal');
    if(!el) return;
    scanModalObj = new bootstrap.Modal(el);
    scanModalObj.show();
}

function closeScanModal() {
    if(codeReader) { codeReader.reset(); codeReader = null; }
    document.getElementById('cameraArea').classList.add('hidden');
    document.getElementById('scanResult').classList.add('hidden');
    if(scanModalObj) scanModalObj.hide();
}

async function startScanner() {
    const video = document.getElementById('videoElement');
    const camArea = document.getElementById('cameraArea');
    camArea.classList.remove('hidden');
    
    try {
        codeReader = new ZXing.BrowserMultiFormatReader();
        const devices = await codeReader.listVideoInputDevices();
        if (devices.length === 0) return alert('未找到摄像头');
        const devId = devices[devices.length - 1].deviceId; // 尝试使用后置
        
        await codeReader.decodeFromVideoDevice(devId, video, (res, err) => {
            if (res) handleScanResult(res.text);
        });
    } catch(e) { alert('启动摄像头失败: ' + e); }
}

async function scanFromFile(input) {
    if(!input.files[0]) return;
    try {
        const reader = new ZXing.BrowserMultiFormatReader();
        const res = await reader.decodeFromImageUrl(URL.createObjectURL(input.files[0]));
        handleScanResult(res.text);
    } catch(e) { alert('识别失败，请确保二维码清晰'); }
    input.value = ''; // reset
}

async function handleScanResult(text) {
    if(codeReader) { codeReader.reset(); codeReader = null; }
    document.getElementById('cameraArea').classList.add('hidden');
    document.getElementById('scanResult').classList.remove('hidden');
    
    let id = null;
    try {
        const data = JSON.parse(text);
        if(data && data.id) id = data.id;
    } catch(e) {}
    
    if(!id && /^\d+$/.test(text)) id = text;
    
    if(!id) {
        const m = text.match(/[\?&]id=(\d+)/) || text.match(/\/get\/(\d+)/);
        if(m) id = m[1];
    }

    if(id) {
        closeScanModal();
        await openEditModal(id);
    } else {
        alert('无效的二维码数据: ' + text);
        closeScanModal();
    }
}


function openImportModal() { 
    const modal = document.getElementById('importModal');
    if(modal) modal.classList.remove('hidden'); 
    switchStep(1); 
}
function closeImportModal() { 
    const modal = document.getElementById('importModal');
    if(modal) modal.classList.add('hidden'); 
    const statsHeader = document.getElementById('importStatsHeader');
    if(statsHeader) statsHeader.classList.add('hidden');
}

async function uploadSource(mode) {
    let fd = new FormData();
    fd.append('mode', mode);
    if(mode === 'file') {
        const fi = document.getElementById('fileInput');
        if(!fi || !fi.files[0]) return alert('请选择文件');
        fd.append('file', fi.files[0]);
    } else {
        const txt = document.getElementById('pasteInput').value;
        if(!txt.trim()) return alert('请粘贴内容');
        fd.append('text', txt);
    }

    try {
        const res = await fetch(CONFIG.apiImportParse, { method:'POST', body:fd }).then(r=>r.json());
        if(res.success) {
            importData = res;
            const stats = document.getElementById('parseStats');
            if(stats) stats.innerText = `✅ 识别成功：共 ${res.total_rows} 条数据`;
            renderMappingStep(CONFIG.systemFields);
        } else alert(res.error || '解析失败');
    } catch(e) { alert('网络请求失败'); }
}

function renderMappingStep(systemFields) {
    const grid = document.getElementById('mappingGrid');
    if(!grid) return;
    grid.innerHTML = importData.columns.map(col => `
        <div class="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm text-center">
            <div class="text-[10px] text-slate-400 font-black uppercase mb-1 truncate">${col}</div>
            <select onchange="importData.mapping['${col}'] = this.value; updateMappedPreview()" class="w-full bg-slate-50 border-0 text-[11px] font-bold p-1.5 rounded-lg outline-none">
                <option value="">(不映射)</option>
                ${systemFields.map(f=>`<option value="${f[0]}" ${importData.mapping[col]===f[0]?'selected':''}>${f[1]}</option>`).join('')}
            </select>
        </div>`).join('');
    
    const tab = document.getElementById('rawPreviewTab');
    if(tab) {
        tab.innerHTML = `<thead class="bg-slate-50 text-slate-500"><tr>${importData.columns.map(c=>`<th class="p-2 border font-bold text-[10px]">${c}</th>`).join('')}</tr></thead>
            <tbody class="text-[10px]">${importData.preview.map(r=>`<tr>${r.map(cell=>`<td class="p-2 border truncate" style="max-width:150px">${cell}</td>`).join('')}</tr>`).join('')}</tbody>`;
    }
    
    updateMappedPreview();
    switchStep(2);
}

function updateMappedPreview() {
    const container = document.getElementById('mappedPreviewContainer');
    const tab = document.getElementById('mappedPreviewTab');
    if(!container || !tab) return;

    const mapping = importData.mapping;
    const selectedFields = CONFIG.systemFields.filter(f => Object.values(mapping).includes(f[0]) && f[0] !== '');
    
    if(selectedFields.length === 0) {
        container.classList.add('hidden');
        return;
    }
    container.classList.remove('hidden');

    let html = `<thead class="bg-blue-50 text-blue-600"><tr>`;
    selectedFields.forEach(f => { html += `<th class="p-2 border-b border-blue-100 font-black text-[10px] uppercase">${f[1]}</th>`; });
    html += `</tr></thead><tbody class="text-[10px]">`;

    importData.raw_data.slice(0, 3).forEach(row => {
        html += `<tr>`;
        selectedFields.forEach(f => {
            const colName = Object.keys(mapping).find(key => mapping[key] === f[0]);
            html += `<td class="p-2 border-b border-slate-50 font-bold">${row[colName] || '-'}</td>`;
        });
        html += `</tr>`;
    });
    html += `</tbody>`;
    tab.innerHTML = html;
}

async function verifyConflicts(url) {
    showLoading('正在校验冲突', '正在比对本地数据与云端记录，请稍候...');
    try {
        const res = await fetch(url, {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ mapping: importData.mapping, raw_data: importData.raw_data })
        }).then(r => r.json());
        if(res.success) {
            importData.conflicts = res.conflicts;
            importData.uniques = res.uniques;
            if(importData.conflicts.length === 0) executeImport(CONFIG.apiImportExecute);
            else { renderConflictStep(); switchStep(3); }
        } else {
            alert('校验失败: ' + res.error);
        }
    } catch(e) {
        alert('网络请求失败');
    } finally {
        hideLoading();
    }
}

function renderConflictStep() {
    const statsEl = document.getElementById('importStatsHeader');
    if(statsEl) {
        statsEl.classList.remove('hidden');
        statsEl.innerHTML = `
            <div class="text-[10px] font-black text-slate-400 uppercase tracking-widest">解析摘要</div>
            <div class="flex gap-4 items-center border-l border-slate-200 pl-4">
                <div class="text-xs font-bold">新增 <span class="text-green-600 text-sm font-black">${importData.uniques.length}</span></div>
                <div class="text-xs font-bold">冲突 <span class="text-orange-500 text-sm font-black">${importData.conflicts.length}</span></div>
            </div>`;
    }
    const list = document.getElementById('conflictList');
    if(!list) return;
    list.className = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-2";
    list.innerHTML = importData.conflicts.map((c, i) => `
        <div id="conflict-card-${i}" class="p-4 border border-slate-100 bg-white rounded-[2rem] shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
            <div class="transition-opacity duration-300 content-area">
                <div class="flex justify-between items-start mb-3">
                    <div class="truncate pr-2">
                        <h4 class="text-[14px] font-black text-slate-800 m-0 truncate">${c.new.name || '未命名'}</h4>
                        <div class="text-[10px] font-bold text-slate-400 truncate tracking-tight">${c.new.model}</div>
                    </div>
                </div>
                <div class="flex bg-slate-100 p-1 rounded-xl mb-3">
                    <button onclick="setStrat(${i}, 'merge')" id="btn-${i}-merge" class="strat-btn flex-1 text-[10px] font-black py-1.5 rounded-lg transition-all active-merge">累加</button>
                    <button onclick="setStrat(${i}, 'cover')" id="btn-${i}-cover" class="strat-btn flex-1 text-[10px] font-black py-1.5 rounded-lg transition-all text-slate-400">覆盖</button>
                    <button onclick="setStrat(${i}, 'new')" id="btn-${i}-new" class="strat-btn flex-1 text-[10px] font-black py-1.5 rounded-lg transition-all text-slate-400">新增</button>
                    <button onclick="setStrat(${i}, 'skip')" id="btn-${i}-skip" class="strat-btn flex-1 text-[10px] font-black py-1.5 rounded-lg transition-all text-slate-400">跳过</button>
                    <input type="hidden" id="strat-${i}" value="merge">
                </div>
                <div id="details-${i}" class="bg-slate-50/50 rounded-xl p-3 mb-3 min-h-[100px] transition-all"></div>
            </div>
            <div id="qty-preview-${i}" class="bg-blue-50/50 rounded-xl px-3 py-2 border border-blue-100 flex items-center justify-between transition-all"></div>
        </div>`).join('');
    importData.conflicts.forEach((_, i) => updateConflictUI(i));
}

function setStrat(index, val) {
    document.getElementById(`strat-${index}`).value = val;
    const btns = ['merge', 'cover', 'new', 'skip'];
    btns.forEach(b => {
        const el = document.getElementById(`btn-${index}-${b}`);
        el.className = `strat-btn flex-1 text-[10px] font-black py-1.5 rounded-lg transition-all ${b === val ? 'active-' + b : 'text-slate-400'}`;
    });
    updateConflictUI(index);
}

function updateConflictUI(index) {
    const strat = document.getElementById(`strat-${index}`).value;
    const detailsEl = document.getElementById(`details-${index}`);
    const previewEl = document.getElementById(`qty-preview-${index}`);
    const cardEl = document.getElementById(`conflict-card-${index}`);
    const c = importData.conflicts[index];
    const fieldMap = { 'category':'品类', 'name':'品名', 'model':'型号', 'package':'封装', 'supplier':'供应商', 'channel':'渠道', 'location':'位置', 'price':'单价' };
    const fields = ['name', 'model', 'category', 'package', 'supplier', 'channel', 'location', 'price'];
    
    if(strat === 'skip') cardEl.classList.add('opacity-40', 'grayscale');
    else cardEl.classList.remove('opacity-40', 'grayscale');
    
    let detailsHtml = '';
    fields.forEach(k => {
        const oldRaw = c.old[k];
        const newRaw = c.new[k];
        const oldVal = (oldRaw !== null && oldRaw !== undefined && oldRaw !== '') ? oldRaw : '-';
        const newVal = (newRaw !== null && newRaw !== undefined && newRaw !== '') ? newRaw : '-';
        const isDiff = c.diff[k];

        if(oldVal === '-' && newVal === '-') return;

        detailsHtml += `<div class="diff-row flex justify-between items-center py-1 last:border-0 text-[11px] leading-snug"><span class="text-slate-400 font-bold w-12 shrink-0">${fieldMap[k]}</span><div class="flex-1 flex gap-1.5 overflow-hidden justify-end">`;
        
        if(strat === 'merge') {
            detailsHtml += `<span class="text-slate-600 font-bold truncate">${oldVal}</span>`;
        } else if(strat === 'cover') {
            if(isDiff) {
                detailsHtml += `<span class="text-slate-400 line-through truncate opacity-50">${oldVal}</span><span class="text-slate-300 text-[10px]">→</span><span class="text-orange-600 font-black truncate">${newVal}</span>`;
            } else { 
                detailsHtml += `<span class="text-slate-500 font-bold truncate">${oldVal}</span>`; 
            }
        } else if(strat === 'new') {
            detailsHtml += `<span class="text-green-600 font-black truncate">${newVal}</span>`;
        } else { 
            detailsHtml += `<span class="text-slate-300 truncate italic">已忽略</span>`; 
        }
        detailsHtml += `</div></div>`;
    });
    detailsEl.innerHTML = detailsHtml || '<div class="text-center py-4 text-slate-300 text-[11px] italic">无有效属性信息</div>';
    
    const qOld = parseInt(c.old.quantity || 0);
    const qNew = parseInt(c.new.quantity || 0);
    let previewHtml = '';
    if(strat === 'merge') {
        previewHtml = `<div class="text-[10px] font-black text-blue-400 uppercase">库存累加</div><div class="text-sm font-bold text-slate-700"><span class="opacity-40">${qOld}</span><span class="mx-1 text-blue-400">+</span><span class="text-blue-600">${qNew}</span><span class="mx-1 text-slate-300">=</span><span class="text-base font-black text-slate-900">${qOld + qNew}</span></div>`;
    } else if(strat === 'cover') {
        previewHtml = `<div class="text-[10px] font-black text-orange-400 uppercase">完全覆盖</div><div class="text-sm font-bold text-slate-700"><span class="opacity-40 line-through">${qOld}</span><span class="mx-2 text-orange-500">→</span><span class="text-base font-black text-slate-900">${qNew}</span></div>`;
    } else if(strat === 'new') {
        previewHtml = `<div class="text-[10px] font-black text-green-500 uppercase">新建记录</div><div class="text-[10px] font-bold text-slate-500 italic text-right">现有 ${qOld} 不变<br>另增 ${qNew} 的记录</div>`;
    } else { 
        previewHtml = `<div class="text-[10px] font-black text-slate-300 uppercase w-full text-center tracking-widest">NO ACTION</div>`; 
    }
    previewEl.innerHTML = previewHtml;
}

async function executeImport(url) {
    const nextBtn = document.getElementById('nextBtn');
    if(nextBtn) { nextBtn.disabled = true; nextBtn.innerText = '正在处理...'; }
    
    // 立即关闭导入向导窗口，防止二次点击或干扰
    closeImportModal();
    showLoading('正在执行 BOM 入库', '正在为您逐一生成二维码并同步云端，请勿关闭页面...');
    
    try {
        const resolved = importData.conflicts.map((c, i) => ({ strategy: document.getElementById(`strat-${i}`).value, new: c.new, old_id: c.old.id }));
        const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ uniques: importData.uniques, resolved: resolved }) }).then(r => r.json());
        if(res.success) { 
            alert(`✅ 入库成功！\n新增: ${res.added}\n更新: ${res.updated}\n跳过: ${res.skipped}`); 
            window.location.reload(); 
        }
        else { 
            alert('入库失败: ' + (res.error || '未知错误')); 
            hideLoading(); 
            openImportModal(); // 失败后重新打开窗口
            if(nextBtn) { nextBtn.disabled = false; nextBtn.innerText = '确认并执行入库'; } 
        }
    } catch(e) { 
        alert('网络请求失败'); 
        hideLoading(); 
        openImportModal();
        if(nextBtn) { nextBtn.disabled = false; nextBtn.innerText = '确认并执行入库'; } 
    }
}

function switchStep(n) {
    [1,2,3].forEach(i => {
        const content = document.getElementById(`stepContent${i}`);
        const dot = document.getElementById(`stepDot${i}`);
        if(content) content.classList.toggle('hidden', i !== n);
        if(dot) dot.className = i <= n ? 'w-10 h-10 rounded-2xl bg-black text-white flex items-center justify-center font-bold text-sm shadow-lg' : 'w-10 h-10 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center font-bold text-sm';
    });
    const nb = document.getElementById('nextBtn');
    if(nb) {
        nb.classList.toggle('hidden', n === 1);
        nb.innerText = n === 3 ? '确认并执行入库' : '下一步：映射数据';
        nb.onclick = n === 2 ? () => verifyConflicts(CONFIG.apiImportVerify) : () => executeImport(CONFIG.apiImportExecute);
    }
}

function initDragAndDrop() {
    const dz = document.getElementById('dropZone');
    if(!dz) return;
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eName => { dz.addEventListener(eName, e => { e.preventDefault(); e.stopPropagation(); }, false); });
    ['dragenter', 'dragover'].forEach(eName => { dz.addEventListener(eName, () => dz.classList.add('drag-active'), false); });
    ['dragleave', 'drop'].forEach(eName => { dz.addEventListener(eName, () => dz.classList.remove('drag-active'), false); });
    dz.addEventListener('drop', e => { const fs = e.dataTransfer.files; if(fs.length > 0) { document.getElementById('fileInput').files = fs; uploadSource('file'); } }, false);
    document.querySelectorAll('input[name="export_fmt"]').forEach(radio => { radio.addEventListener('change', e => { document.getElementById('zipOptions').classList.toggle('hidden', e.target.value !== 'zip'); }); });
}

function openExportModal() {
    const el = document.getElementById('exportModal');
    if(!el) return;
    const count = document.querySelectorAll('.row-checkbox:checked').length;
    const total = document.querySelectorAll('.row-checkbox').length;
    document.getElementById('exportCount').innerText = count > 0 ? count : total;
    loadExportHistory();
    el.classList.remove('hidden');
}
function closeExportModal() { document.getElementById('exportModal').classList.add('hidden'); }
function toggleFilenameInput() {
    const mode = document.getElementById('filenameMode').value;
    const input = document.getElementById('customFilename');
    if(mode === 'custom') input.classList.remove('hidden');
    else input.classList.add('hidden');
}
async function loadExportHistory() {
    const list = document.getElementById('exportHistoryList');
    list.innerHTML = '<div class="text-center text-slate-400 text-xs py-4">加载中...</div>';
    try {
        const res = await fetch('/inventory/get_export_files').then(r => r.json());
        if(res.files && res.files.length > 0) {
            list.innerHTML = res.files.map(f => `
                <div class="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center group relative">
                    <div class="truncate">
                        <div class="text-xs font-bold text-slate-700 truncate" title="${f.name}">${f.name}</div>
                        <div class="text-[9px] text-slate-400 mt-0.5">${f.time} · ${f.size}</div>
                    </div>
                    <div class="flex items-center gap-1">
                        <a href="/inventory/static/exports/${f.name}" download class="text-slate-400 hover:text-blue-600 transition p-2"><i class="bi bi-download"></i></a>
                        <button onclick="deleteExportFile('${f.name}')" class="text-slate-400 hover:text-red-500 transition p-2"><i class="bi bi-trash"></i></button>
                    </div>
                </div>`).join('');
        } else { list.innerHTML = '<div class="text-center text-slate-300 text-xs py-10 italic">暂无导出记录</div>'; }
    } catch(e) { list.innerHTML = '加载失败'; }
}

async function deleteExportFile(filename) {
    if(!confirm('确定要彻底删除这个导出记录吗？')) return;
    try {
        const res = await fetch(`/inventory/delete_export_file/${filename}`).then(r => r.json());
        if(res.success) {
            loadExportHistory();
        } else {
            alert('删除失败: ' + res.error);
        }
    } catch(e) {
        alert('网络请求失败');
    }
}

async function clearExportHistory() {
    if(!confirm('确定要清空所有导出历史记录吗？此操作不可撤销！')) return;
    try {
        const res = await fetch('/inventory/clear_export_history').then(r => r.json());
        if(res.success) {
            loadExportHistory();
        } else {
            alert('清空失败: ' + res.error);
        }
    } catch(e) {
        alert('网络请求失败');
    }
}

async function submitExport() {
    showLoading('正在准备导出文件', '正在抓取数据并打包云端资源 (ZIP 模式耗时较长)...');
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
            const disposition = res.headers.get('Content-Disposition');
            let filename = `export.${fmt}`;
            if (disposition && disposition.indexOf('attachment') !== -1) {
                const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
                const matches = filenameRegex.exec(disposition);
                if (matches != null && matches[1]) { filename = matches[1].replace(/['"]/g, ''); }
            }
            a.download = decodeURIComponent(filename); document.body.appendChild(a); a.click(); a.remove();
            closeExportModal(); alert('导出成功！文件已开始下载。');
        } else { const err = await res.json(); alert('导出失败: ' + (err.error || '服务器错误')); }
    } catch(e) { alert('网络请求失败: ' + e.message); }
    finally { hideLoading(); }
}

async function runBackup() {
    showLoading('正在生成备份', '正在打包云端数据记录 (Local Backup)...');
    try {
        const res = await fetch('/inventory/backup');
        if(res.ok) {
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url;
            a.download = `Inventory_Full_Backup_${new Date().getTime()}.zip`;
            document.body.appendChild(a); a.click(); a.remove();
            alert('✅ 备份成功！请妥善保存下载的 ZIP 文件。');
        } else { alert('备份失败'); }
    } catch(e) { alert('网络错误'); }
    finally { hideLoading(); }
}

async function submitRestore(input) {
    if(!input.files[0]) return;
    if(!confirm('确定要从该备份文件还原吗？这将覆盖匹配 ID 的现有数据！')) { input.value = ''; return; }
    showLoading('正在还原数据', '正在解析备份包并同步至云端数据库...');
    const fd = new FormData(); fd.append('backup_zip', input.files[0]);
    try {
        const res = await fetch('/inventory/restore', { method: 'POST', body: fd }).then(r => r.json());
        if(res.success) { 
            alert(`✅ 还原成功！\n\n📄 数据库记录: ${res.count} 条\n☁️ 云端资源包: ${res.asset_count} 个`); 
            window.location.reload(); 
        }
        else { alert('还原失败: ' + res.error); }
    } catch(e) { alert('请求失败'); }
    finally { hideLoading(); input.value = ''; closeModal('restoreModal'); }
}
