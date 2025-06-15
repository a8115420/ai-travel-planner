// server.js (真正的最終、完整、無省略版)

require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const { OpenAI } = require('openai');
const axios = require('axios');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');

const app = express();
const port = process.env.PORT || 3000;

// --- 中間件 (Middleware) ---
app.use(cors());
app.use(bodyParser.json());

// 初始化 OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// --- API 路由設定 ---

// 引入各個部門的路由檔案
const authRoutes = require('./routes/auth');
const itineraryRoutes = require('./routes/itineraries');
const googleRoutes = require('./routes/google');

// 指派總機的轉接任務
app.use('/api/auth', authRoutes);
app.use('/api/itineraries', itineraryRoutes);
app.use('/api/google', googleRoutes);


// --- 由總機直接處理的 API ---

// 根目錄測試路由
app.get('/', (req, res) => {
    res.json({
        message: "歡迎來到 AI 旅遊規劃師後端！伺服器運行中！",
        timestamp: new Date().toISOString()
    });
});

// AI 聊天 API
app.post('/api/chat', async (req, res) => {
    try {
        const userMessage = req.body.message;
        if (!userMessage) return res.status(400).json({ error: '沒有收到訊息' });
        
        const completion = await openai.chat.completions.create({
            messages: [
                { role: 'system', content: '你是一位專業的歐洲旅遊規劃師。' },
                { role: 'user', content: userMessage }
            ],
            model: 'gpt-3.5-turbo',
        });
        res.json({ reply: completion.choices[0].message.content });
    } catch (error) {
        console.error('後端 /api/chat 處理時發生錯誤:', error);
        res.status(500).json({ error: '與 AI 溝通時發生錯誤' });
    }
});

// 路線規劃 API
app.post('/api/route', async (req, res) => {
    try {
        const { startCity, endCity } = req.body;
        if (!startCity || !endCity) return res.status(400).json({ error: '起點和終點為必填欄位' });
        
        const geocode = async (city) => {
            const url = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(city)}&format=json&limit=1`;
            const response = await axios.get(url, { headers: { 'User-Agent': 'MyTourPlanner/1.0' } });
            if (response.data.length === 0) throw new Error(`找不到城市: ${city}`);
            const { lat, lon } = response.data[0];
            return { lat: parseFloat(lat), lon: parseFloat(lon) };
        };

        const startCoords = await geocode(startCity);
        const endCoords = await geocode(endCity);
        const osrmUrl = `http://router.project-osrm.org/route/v1/driving/${startCoords.lon},${startCoords.lat};${endCoords.lon},${endCoords.lat}?overview=full&geometries=geojson`;
        const routeResponse = await axios.get(osrmUrl);

        if (routeResponse.data.routes && routeResponse.data.routes.length > 0) {
            res.json({ route: routeResponse.data.routes[0].geometry });
        } else {
            throw new Error('無法規劃路線');
        }
    } catch (error) {
        console.error('後端 /api/route 處理時發生錯誤:', error.message);
        res.status(500).json({ error: `路線規劃失敗: ${error.message}` });
    }
});

// 匯出 PDF 並寄送郵件 API
app.post('/api/export/email', async (req, res) => {
    const { email, history } = req.body;
    if (!email) return res.status(400).json({ error: 'Email為必填欄位' });
    if (!history || history.length === 0) return res.status(400).json({ error: '沒有行程內容可供匯出' });
    try {
        const createPdfBuffer = (itinerary) => {
            return new Promise((resolve) => {
                const doc = new PDFDocument({ margin: 50 });
                const buffers = [];
                doc.on('data', buffers.push.bind(buffers));
                doc.on('end', () => resolve(Buffer.concat(buffers)));
                const fontPath = path.join(__dirname, 'fonts', 'NotoSansTC-Regular.ttf');
                doc.font(fontPath);
                doc.fontSize(25).text('你的專屬 AI 旅遊手冊', { align: 'center' }).moveDown(2);
                itinerary.forEach(item => {
                    doc.fontSize(14).fillColor(item.role === 'user' ? 'blue' : 'black').text(`${item.role === 'user' ? '你問' : 'AI 導遊建議'}： ${item.content}`).moveDown();
                });
                doc.end();
            });
        };
        const pdfBuffer = await createPdfBuffer(history);
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
        });
        const mailOptions = {
            from: `"導遊智慧行程規劃系統" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: '您的專屬 AI 旅遊手冊已準備就緒！',
            text: '您好，感謝您使用我們的服務！您與 AI 導遊的完整對話紀錄已附在信中，祝您旅途愉快！',
            attachments: [{ filename: 'AI旅遊手冊.pdf', content: pdfBuffer, contentType: 'application/pdf' }],
        };
        await transporter.sendMail(mailOptions);
        res.status(200).json({ message: 'AI 旅遊手冊已成功寄送至您的信箱！' });
    } catch (error) {
        console.error('後端 /api/export/email 處理時發生錯誤:', error);
        res.status(500).json({ error: '寄送郵件時發生內部錯誤' });
    }
});


// --- 啟動伺服器與資料庫連線 ---
const startServer = async () => {
    try {
        const mongoURI = process.env.MONGO_URI;
        if (!mongoURI) {
            throw new Error('讀取不到 MONGO_URI，請檢查 .env 檔案！');
        }
        await mongoose.connect(mongoURI);
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