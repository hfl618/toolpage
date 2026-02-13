/**
 * Serial Studio Pro - Web Serial API Implementation
 */

let port, reader, writer;
let keepReading = false;
let rxCount = 0;

async function toggleConnection() {
    const btn = document.getElementById('connectBtn');
    const dot = document.getElementById('statusDot');
    const textSpan = btn.querySelector('span');

    if (port) {
        keepReading = false;
        if(reader) await reader.cancel();
        if(writer) await writer.releaseLock();
        await port.close();
        port = null;
        
        btn.className = 'serial-btn btn-connect';
        textSpan.innerText = '开启串口连接';
        dot.classList.remove('connected');
        appendLog("System", "串口已安全关闭");
        return;
    }

    try {
        if (!navigator.serial) {
            alert("您的浏览器不支持 Web Serial API，请使用最新版 Chrome 或 Edge。");
            return;
        }

        port = await navigator.serial.requestPort();
        
        const options = {
            baudRate: parseInt(document.getElementById('baudRate').value),
            dataBits: parseInt(document.getElementById('dataBits').value),
            stopBits: parseInt(document.getElementById('stopBits').value),
            parity: document.getElementById('parity').value
        };

        await port.open(options);

        btn.className = 'serial-btn btn-disconnect';
        textSpan.innerText = '断开串口连接';
        dot.classList.add('connected');
        document.getElementById('terminal').innerHTML = ''; 
        appendLog("System", `成功连接到设备 (波特率: ${options.baudRate})`);

        keepReading = true;
        readLoop();

    } catch (err) {
        console.error(err);
        showToast("无法连接串口: " + err.message, "error");
    }
}

async function readLoop() {
    while (port && port.readable && keepReading) {
        const textDecoder = new TextDecoderStream();
        const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
        reader = textDecoder.readable.getReader();

        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                if (value) processData(value);
            }
        } catch (error) {
            console.error(error);
            appendLog("Error", "接收中断: " + error.message);
        } finally {
            reader.releaseLock();
        }
    }
}

function processData(text) {
    rxCount += text.length;
    document.getElementById('rxCounter').innerText = rxCount;

    const isHex = document.getElementById('rxHex').checked;
    if (isHex) {
        const encoder = new TextEncoder();
        const view = encoder.encode(text);
        const hexStr = Array.from(view).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
        appendLog("RX", hexStr, true);
    } else {
        appendLog("RX", text, false);
    }
}

function appendLog(type, msg, isHexMode = false) {
    const term = document.getElementById('terminal');
    const now = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const showTime = document.getElementById('showTimestamp').checked;
    
    const div = document.createElement('div');
    div.className = 'mb-1';
    
    let colorClass = '';
    if(type === 'RX') colorClass = isHexMode ? 'rx-hex' : 'text-success';
    else if(type === 'TX') colorClass = 'tx-msg';
    else colorClass = 'text-slate-500 italic text-[11px]';
    
    const timeHtml = showTime ? `<span class="timestamp">[${now}]</span>` : '';
    const safeMsg = msg.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    
    div.innerHTML = `${timeHtml}<span class="${colorClass}">${safeMsg}</span>`;
    term.appendChild(div);

    if (document.getElementById('autoScroll').checked) {
        term.scrollTop = term.scrollHeight;
    }
}

async function sendFromInput() {
    const input = document.getElementById('txInput');
    let text = input.value;
    if (!text) return;

    const isHex = document.getElementById('txHex').checked;
    const addLine = document.getElementById('txNewline').checked;

    if (!isHex && addLine) text += "
";
    await sendText(text, isHex);
}

async function sendText(data, isHex = false) {
    if (!port || !port.writable) {
        showToast("硬件未连接", "error");
        return;
    }

    const writer = port.writable.getWriter();
    try {
        let dataArray;
        if (isHex) {
            const cleanHex = data.replace(/\s+/g, '');
            if (cleanHex.length % 2 !== 0) throw new Error("HEX 字符串长度不合法");
            dataArray = new Uint8Array(cleanHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
            appendLog("TX", `[HEX] ${data}`);
        } else {
            dataArray = new TextEncoder().encode(data);
            appendLog("TX", data);
        }
        await writer.write(dataArray);
    } catch (err) {
        showToast("发送失败: " + err.message, "error");
    } finally {
        writer.releaseLock();
    }
}

function clearLog() {
    document.getElementById('terminal').innerHTML = '<div class="text-center text-slate-700 py-10 opacity-20">终端已清空</div>';
    rxCount = 0;
    document.getElementById('rxCounter').innerText = '0';
}
