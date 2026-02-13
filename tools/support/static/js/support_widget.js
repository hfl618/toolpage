async function toggleHelpModal() {
    const m = document.getElementById('help-modal');
    if(!m) return;
    const isHidden = m.style.display === 'none';
    m.style.display = isHidden ? 'flex' : 'none';
    
    if(isHidden) {
        const lang = localStorage.getItem('lang') || 'zh';
        const contentDiv = document.getElementById('help-content');
        contentDiv.innerHTML = '<div style="text-align:center; padding:20px;"><i class="ri-loader-4-line animate-spin" style="font-size:24px;"></i></div>';
        
        m.querySelectorAll('.bug-i18n').forEach(el => { el.innerText = el.getAttribute('data-' + lang); });

        try {
            const r = await fetch('/support/help_doc?lang=' + lang + '&path=' + window.location.pathname);
            const d = await r.json();
            if(d.success && d.content) {
                let html = d.content
                    .replace(/^# (.*$)/gm, '<h2 style="font-size:24px; font-weight:900; margin-bottom:16px; border-bottom:4px solid #3b82f6; padding-bottom:8px;">$1</h2>')
                    .replace(/^## (.*$)/gm, '<h3 style="font-size:18px; font-weight:800; margin-top:24px; margin-bottom:12px; display:flex; align-items:center; gap:8px;"><i class="ri-settings-3-fill" style="color:#3b82f6;"></i> $1</h3>')
                    .replace(/^- (.*$)/gm, '<div style="margin-left:16px; margin-bottom:8px; display:flex; align-items:start; gap:8px;"><div style="width:6px; height:6px; border-radius:50%; background:#60a5fa; margin-top:8px; flex-shrink:0;"></div><span style="font-weight:700; color:#475569;">$1</span></div>')
                    .replace(/^---$/gm, '<hr style="margin:24px 0; border:none; border-top:1px solid #e2e8f0;">')
                    .replace(/\*(.*?)\*/g, '<i style="color:#94a3b8; font-size:12px;">$1</i>')
                    .replace(/`(.*?)`/g, '<code style="background:#eff6ff; color:#2563eb; padding:2px 6px; border-radius:6px; font-family:monospace; font-size:12px; font-weight:900;">$1</code>');
                 contentDiv.innerHTML = html;
            } else {
                contentDiv.innerHTML = '<div style="text-align:center; padding:20px; color:#94a3b8; font-weight:700;">' + (lang==='en'?'No documentation available':'暂无帮助文档') + '</div>';
            }
        } catch(e) {
            contentDiv.innerHTML = '<div style="text-align:center; color:red;">Error loading docs</div>';
        }
    }
}

function updateBugPreview(i) {
    const l = document.getElementById('bug-preview-name');
    const lang = localStorage.getItem('lang') || 'zh';
    if (i.files && i.files.length > 0) { 
        l.innerText = (lang === 'en' ? "Selected: " : "已选择: ") + i.files.length + (lang === 'en' ? " images" : " 张图片");
        l.style.color = "#3b82f6"; 
    }
}

function toggleBugModal() {
    const m = document.getElementById('bug-modal');
    const isHidden = m.style.display === 'none';
    m.style.display = isHidden ? 'flex' : 'none';
    if(isHidden) {
        const lang = localStorage.getItem('lang') || 'zh';
        document.querySelectorAll('.bug-i18n').forEach(el => { el.innerText = el.getAttribute('data-' + lang); });
        document.querySelectorAll('.bug-i18n-ph').forEach(el => { el.placeholder = el.getAttribute('data-' + lang + '-ph'); });
    }
}

async function submitBug() {
    const btn = document.getElementById('bug-submit-btn');
    const content = document.getElementById('bug-content').value.trim();
    const fileInput = document.getElementById('bug-image');
    const lang = localStorage.getItem('lang') || 'zh';
    if(!content) return;
    btn.disabled = true; btn.innerText = lang === 'en' ? "Sending..." : "发送中...";
    const fd = new FormData();
    fd.append('content', content);
    fd.append('page_url', window.location.href);
    fd.append('device_info', navigator.userAgent);
    for(let i=0; i<fileInput.files.length; i++) { fd.append('image', fileInput.files[i]); }
    try {
        const r = await fetch('/support/report_bug', { method: 'POST', body: fd });
        if(r.ok) { 
            alert(lang === 'en' ? "Thank you!" : "反馈已收到，感谢支持！"); 
            document.getElementById('bug-content').value=""; 
            fileInput.value=""; 
            document.getElementById('bug-preview-name').innerText = lang === 'en' ? "Upload Screenshots" : "上传截图 (支持多选)";
            toggleBugModal(); 
        } else { alert("Failed"); }
    } catch(e) { alert("Network error"); }
    finally { 
        btn.disabled = false; 
        btn.innerText = lang === 'en' ? "Submit Feedback" : "提交反馈"; 
    }
}
