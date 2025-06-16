// server.js (最終淨化版 - 修正隱形字元)

require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const session = require('express-session');
const mongoose = require('mongoose');
const { OpenAI } = require('openai');
const axios = require('axios');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { google } = require('googleapis');

// 引入資料庫模型和中間件
const User = require('./models/User');
const Itinerary = require('./models/Itinerary');
const authMiddleware = require('./middleware/auth');

const app = express();
const port = process.env.PORT || 3000;

// --- 中間件 (Middleware) ---
const corsOptions = {
    origin: process.env.NETLIFY_SITE_URL || 'https://incredible-swan-2f06e7.netlify.app',
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(bodyParser.json());
app.use(session({
    secret: process.env.JWT_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// 初始化 OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// --- API 路由設定 ---

// 根目錄路由
app.get('/', (req, res) => {
    res.json({
        message: "歡迎來到 AI 旅遊規劃師後端！伺服器運行中！",
        timestamp: new Date().toISOString()
    });
});

// Auth 路由
app.post('/api/auth/register', async (req, res) => { try { const { email, password } = req.body; let user = await User.findOne({ email }); if (user) { return res.status(400).json({ error: '此 Email 已被註冊' }); } user = new User({ email, password }); const salt = await bcrypt.genSalt(10); user.password = await bcrypt.hash(password, salt); await user.save(); res.status(201).json({ message: '使用者註冊成功！' }); } catch (error) { console.error('註冊 API 發生錯誤:', error.message); res.status(500).json({ error: '伺服器內部錯誤' }); } });
app.post('/api/auth/login', async (req, res) => { try { const { email, password } = req.body; const user = await User.findOne({ email }); if (!user) { return res.status(400).json({ error: '使用者不存在' }); } const isMatch = await bcrypt.compare(password, user.password); if (!isMatch) { return res.status(400).json({ error: '密碼錯誤' }); } const payload = { user: { id: user.id } }; jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: 3600 }, (err, token) => { if (err) throw err; res.json({ token }); }); } catch (error) { console.error('登入 API 發生錯誤:', error.message); res.status(500).json({ error: '伺服器內部錯誤' }); } });

// Itineraries 路由
app.post('/api/itineraries', authMiddleware, async (req, res) => { try { const { title, conversation, route } = req.body; const newItinerary = new Itinerary({ title, conversation, route, user: req.user.id }); const itinerary = await newItinerary.save(); res.status(201).json(itinerary); } catch (err) { console.error(err.message); res.status(500).send('伺服器錯誤'); } });
app.get('/api/itineraries', authMiddleware, async (req, res) => { try { const itineraries = await Itinerary.find({ user: req.user.id }).sort({ createdAt: -1 }); res.json(itineraries); } catch (err) { console.error(err.message); res.status(500).send('伺服器錯誤'); } });
app.get('/api/itineraries/:id', authMiddleware, async (req, res) => { try { const itinerary = await Itinerary.findById(req.params.id); if (!itinerary) { return res.status(404).json({ error: '找不到該行程' }); } if (itinerary.user.toString() !== req.user.id) { return res.status(401).json({ error: '沒有權限存取此行程' }); } res.json(itinerary); } catch (err) { console.error(err.message); if (err.kind === 'ObjectId') { return res.status(404).json({ error: '找不到該行程' }); } res.status(500).send('伺服器錯誤'); } });
app.put('/api/itineraries/:id', authMiddleware, async (req, res) => { try { const { title } = req.body; if (!title) { return res.status(400).json({ error: '標題為必填欄位' }); } let itinerary = await Itinerary.findById(req.params.id); if (!itinerary) { return res.status(404).json({ error: '找不到該行程' }); } if (itinerary.user.toString() !== req.user.id) { return res.status(401).json({ error: '沒有權限修改此行程' }); } itinerary = await Itinerary.findByIdAndUpdate(req.params.id, { $set: { title: title } }, { new: true }); res.json(itinerary); } catch (err) { console.error(err.message); res.status(500).send('伺服器錯誤'); } });
app.delete('/api/itineraries/:id', authMiddleware, async (req, res) => { try { let itinerary = await Itinerary.findById(req.params.id); if (!itinerary) { return res.status(404).json({ error: '找不到該行程' }); } if (itinerary.user.toString() !== req.user.id) { return res.status(401).json({ error: '沒有權限刪除此行程' }); } await Itinerary.findByIdAndDelete(req.params.id); res.json({ message: '行程已成功刪除' }); } catch (err) { console.error(err.message); res.status(500).send('伺服器錯誤'); } });

// Google 路由
const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
app.post('/api/google/prepare-sync', authMiddleware, async (req, res) => { try { const { itineraryId, startDate, endDate } = req.body; if (!itineraryId || !startDate || !endDate) { return res.status(400).json({ error: '缺少必要的行程資訊' }); } req.session.syncData = { itineraryId, startDate, endDate }; const scopes = ['https://www.googleapis.com/auth/calendar.events']; const authorizationUrl = oauth2Client.generateAuthUrl({ access_type: 'offline', scope: scopes, include_granted_scopes: true }); res.json({ authorizationUrl }); } catch (error) { console.error('準備同步時發生錯誤:', error); res.status(500).send('伺服器錯誤'); } });
app.get('/api/google/callback', async (req, res) => { try { const syncData = req.session.syncData; if (!syncData) { return res.status(400).send('授權階段作業已過期或無效，請重試。'); } const { code } = req.query; const { tokens } = await oauth2Client.getToken(code); oauth2Client.setCredentials(tokens); const itinerary = await Itinerary.findById(syncData.itineraryId); if (!itinerary) { return res.status(404).send('找不到對應的行程資料'); } const calendar = google.calendar({ version: 'v3', auth: oauth2Client }); const endDate = new Date(syncData.endDate); endDate.setDate(endDate.getDate() + 1); const endDateString = endDate.toISOString().split('T')[0]; const event = { 'summary': itinerary.title, 'description': itinerary.conversation.map(c => `${c.role === 'user' ? '你' : 'AI'}: ${c.content}`).join('\n\n'), 'location': itinerary.route.startCity, 'start': { 'date': syncData.startDate, }, 'end': { 'date': endDateString, }, }; await calendar.events.insert({ calendarId: 'primary', resource: event, }); req.session.syncData = null; const successUrl = new URL(process.env.NETLIFY_SITE_URL || 'https://incredible-swan-2f06e7.netlify.app'); successUrl.searchParams.set('sync_success', 'true'); res.redirect(successUrl.href); } catch (error) { console.error('處理 Google Callback 時發生錯誤:', error); res.status(500).send('與 Google 授權時發生錯誤'); } });

// 其他 API 路由
app.post('/api/chat', async (req, res) => { try { const userMessage = req.body.message; if (!userMessage) { return res.status(400).json({ error: '沒有收到訊息' }); } const completion = await openai.chat.completions.create({ messages: [ { role: 'system', content: '你是一位專業的歐洲旅遊規劃師。' }, { role: 'user', content: userMessage } ], model: 'gpt-3.5-turbo', }); res.json({ reply: completion.choices[0].message.content }); } catch (error) { console.error('後端 /api/chat 處理時發生錯誤:', error); res.status(500).json({ error: '與 AI 溝通時發生錯誤' }); } });
app.post('/api/route', async (req, res) => { try { const { startCity, endCity } = req.body; if (!startCity || !endCity) { return res.status(400).json({ error: '起點和終點為必填欄位' }); } const geocode = async (city) => { const url = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(city)}&format=json&limit=1`; const response = await axios.get(url, { headers: { 'User-Agent': 'MyTourPlanner/1.0' } }); if (response.data.length === 0) { throw new Error(`找不到城市: ${city}`); } const { lat, lon } = response.data[0]; return { lat: parseFloat(lat), lon: parseFloat(lon) }; }; const startCoords = await geocode(startCity); const endCoords = await geocode(endCity); const osrmUrl = `http://router.project-osrm.org/route/v1/driving/${startCoords.lon},${startCoords.lat};${endCoords.lon},${endCoords.lat}?overview=full&geometries=geojson`; const routeResponse = await axios.get(osrmUrl); if (routeResponse.data.routes && routeResponse.data.routes.length > 0) { res.json({ route: routeResponse.data.routes[0].geometry }); } else { throw new Error('無法規劃路線'); } } catch (error) { console.error('後端 /api/route 處理時發生錯誤:', error.message); res.status(500).json({ error: `路線規劃失敗: ${error.message}` }); } });
app.post('/api/export/email', async (req, res) => { const { email, history } = req.body; if (!email) { return res.status(400).json({ error: 'Email為必填欄位' }); } if (!history || history.length === 0) { return res.status(400).json({ error: '沒有行程內容可供匯出' }); } try { const createPdfBuffer = (itinerary) => { return new Promise((resolve) => { const doc = new PDFDocument({ margin: 50 }); const buffers = []; doc.on('data', buffers.push.bind(buffers)); doc.on('end', () => resolve(Buffer.concat(buffers))); const fontPath = path.join(__dirname, 'fonts', 'NotoSansTC-Regular.ttf'); doc.font(fontPath); doc.fontSize(25).text('你的專屬 AI 旅遊手冊', { align: 'center' }).moveDown(2); itinerary.forEach(item => { doc.fontSize(14).fillColor(item.role === 'user' ? 'blue' : 'black').text(`${item.role === 'user' ? '你問' : 'AI 導遊建議'}： ${item.content}`).moveDown(); }); doc.end(); }); }; const pdfBuffer = await createPdfBuffer(history); const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }, }); const mailOptions = { from: `"導遊智慧行程規劃系統" <${process.env.EMAIL_USER}>`, to: email, subject: '您的專屬 AI 旅遊手冊已準備就緒！', text: '您好，感謝您使用我們的服務！您與 AI 導遊的完整對話紀錄已附在信中，祝您旅途愉快！', attachments: [{ filename: 'AI旅遊手冊.pdf', content: pdfBuffer, contentType: 'application/pdf' }], }; await transporter.sendMail(mailOptions); res.status(200).json({ message: 'AI 旅遊手冊已成功寄送至您的信箱！' }); } catch (error) { console.error('後端 /api/export/email 處理時發生錯誤:', error); res.status(500).json({ error: '寄送郵件時發生內部錯誤' }); } });

// --- 步驟四：啟動伺服器與資料庫連線 ---
const startServer = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("MongoDB 連線成功！");
        app.listen(port, () => {
            console.log(`伺服器在資料庫連線成功後，正在 http://localhost:${port} 上運行`);
        });
    } catch (error) {
        console.error("無法連線至 MongoDB 或啟動伺服器:", error);
        process.exit(1);
    }
};

startServer();