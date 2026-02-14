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
                let html = d.content.replace(/\r\n/g, '\n');
                let placeholders = [];

                // 1. 保护代码块 (优先级最高)
                html = html.replace(/```([\s\S]*?)```/g, (match, code) => {
                    const lines = code.trim().split('\n');
                    const cleanCode = (lines[0].length < 10) ? lines.slice(1).join('\n') : code.trim();
                    const pre = `<pre style="background:#0f172a; color:#e2e8f0; padding:16px; border-radius:12px; font-family:'JetBrains Mono',monospace; font-size:12px; line-height:1.5; overflow-x:auto; margin:12px 0; border:1px solid #1e293b; white-space:pre;"><code>${cleanCode}</code></pre>`;
                    placeholders.push(pre);
                    return `\n\n__PLACEHOLDER_${placeholders.length - 1}__\n\n`;
                });

                // 2. 保护表格
                html = html.replace(/(\|.*\|)\n(\|.*---.*\|)\n((?:\|.*\|\n?)*)/g, (match, header, divider, body) => {
                    let table = '<div style="overflow-x:auto; margin:16px 0;"><table style="width:100%; border-collapse:collapse; font-size:12px; border:1px solid #e2e8f0; border-radius:10px; overflow:hidden;">';
                    table += '<thead style="background:#f8fafc; border-bottom:2px solid #e2e8f0;"><tr>';
                    header.split('|').filter(c => c.trim()).forEach(c => {
                        table += `<th style="padding:10px; text-align:left; font-weight:900; color:#1e293b;">${c.trim()}</th>`;
                    });
                    table += '</tr></thead><tbody>';
                    body.trim().split('\n').forEach(line => {
                        table += '<tr style="border-bottom:1px solid #f1f5f9;">';
                        line.split('|').filter(c => c.trim()).forEach(c => {
                            table += `<td style="padding:10px; color:#475569;">${c.trim()}</td>`;
                        });
                        table += '</tr>';
                    });
                    table += '</tbody></table></div>';
                    placeholders.push(table);
                    return `\n\n__PLACEHOLDER_${placeholders.length - 1}__\n\n`;
                });

                // 3. 处理块级语法
                html = html
                    .replace(/^# (.*$)/gm, '<h2 style="font-size:20px; font-weight:900; margin:20px 0 12px 0; border-bottom:3px solid #3b82f6; padding-bottom:6px; color:#1e293b;">$1</h2>')
                    .replace(/^## (.*$)/gm, '<h3 style="font-size:16px; font-weight:800; margin:20px 0 10px 0; display:flex; align-items:center; gap:8px; color:#1e293b;"><i class="ri-settings-3-fill" style="color:#3b82f6; font-size:14px;"></i> $1</h3>')
                    .replace(/^### (.*$)/gm, '<h4 style="font-size:14px; font-weight:800; margin:16px 0 8px 0; color:#334155;">$1</h4>')
                    .replace(/^---$/gm, '<hr style="margin:20px 0; border:none; border-top:1px solid #e2e8f0;">')
                    .replace(/^- (.*$)/gm, '<div style="margin-left:8px; margin-bottom:6px; display:flex; align-items:start; gap:8px;"><div style="width:5px; height:5px; border-radius:50%; background:#60a5fa; margin-top:7px; flex-shrink:0;"></div><span style="font-weight:700; color:#475569; font-size:13px; line-height:1.4;">$1</span></div>');

                // 4. 处理行内语法
                html = html
                    .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#1e293b; font-weight:900;">$1</strong>')
                    .replace(/`(.*?)`/g, '<code style="background:#eff6ff; color:#2563eb; padding:2px 5px; border-radius:4px; font-family:monospace; font-size:12px; font-weight:900;">$1</code>');

                // 5. 段落封装与换行处理
                const lines = html.split('\n');
                let result = "";
                lines.forEach(line => {
                    let l = line.trim();
                    if (!l) return;
                    if (l.startsWith('<h') || l.startsWith('<div') || l.startsWith('<hr') || l.startsWith('<table') || l.startsWith('__PLACEHOLDER')) {
                        result += l;
                    } else {
                        result += `<p style="margin-bottom:8px; line-height:1.6; color:#475569; font-size:13.5px; font-weight:500;">${l}</p>`;
                    }
                });

                // 6. 还原占位符
                placeholders.forEach((p, i) => {
                    result = result.replace(`__PLACEHOLDER_${i}__`, p);
                });

                contentDiv.innerHTML = result;
            } else {
                contentDiv.innerHTML = '<div style="text-align:center; padding:20px; color:#94a3b8; font-weight:700;">' + (lang==='en'?'No documentation available':'暂无帮助文档') + '</div>';
            }
        } catch(e) {
            console.error(e);
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
