// backend/routes/google.js (優化版)

const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const Itinerary = require('../models/Itinerary'); // 引入行程模型
const authMiddleware = require('../middleware/auth'); // 引入我們的 auth 中間件

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

// --- API 1: 準備行程資料並產生授權 URL ---
// 前端會先呼叫這個 API
router.post('/prepare-sync', authMiddleware, async (req, res) => {
    try {
        const { itineraryId, startDate, endDate } = req.body;
        if (!itineraryId || !startDate || !endDate) {
            return res.status(400).json({ error: '缺少必要的行程資訊' });
        }

        // 將需要同步的資料暫存到 session 中
        req.session.syncData = { itineraryId, startDate, endDate };

        const scopes = ['https://www.googleapis.com/auth/calendar.events'];
        const authorizationUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: scopes,
            include_granted_scopes: true
        });

        // 將授權 URL 回傳給前端
        res.json({ authorizationUrl });

    } catch (error) {
        console.error('準備同步時發生錯誤:', error);
        res.status(500).send('伺服器錯誤');
    }
});


// --- API 2: Google 授權後的回呼 (Callback) ---
router.get('/callback', async (req, res) => {
    try {
        // 從 session 中取出我們之前暫存的資料
        const syncData = req.session.syncData;
        if (!syncData) {
            return res.status(400).send('授權階段作業已過期或無效，請重試。');
        }

        const { code } = req.query;
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        // 從資料庫中讀取完整的行程資料
        const itinerary = await Itinerary.findById(syncData.itineraryId);
        if (!itinerary) {
            return res.status(404).send('找不到對應的行程資料');
        }

        // 建立真實的日曆事件
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
        const event = {
            'summary': itinerary.title, // 使用行程標題
            'description': itinerary.conversation.map(c => `${c.role}: ${c.content}`).join('\n\n'), // 使用對話紀錄
            'location': itinerary.route.startCity, // 使用起點城市
            'start': {
                'date': syncData.startDate, // 使用使用者選擇的開始日期 (全天事件)
            },
            'end': {
                'date': syncData.endDate, // 使用使用者選擇的結束日期 (全天事件)
            },
        };

        await calendar.events.insert({
            calendarId: 'primary',
            resource: event,
        });

        // 清除 session 中的暫存資料
        req.session.syncData = null;
        
        // 將使用者導回前端，並帶上成功訊息
        res.redirect('https://cheerful-choux-16e1ba.netlify.app?sync_success=true');

    } catch (error) {
        console.error('處理 Google Callback 時發生錯誤:', error);
        res.status(500).send('與 Google 授權時發生錯誤');
    }
});

module.exports = router;