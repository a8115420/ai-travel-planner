// backend/routes/google.js (最終優化版)

const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const Itinerary = require('../models/Itinerary');
const authMiddleware = require('../middleware/auth');

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

// API 1: 準備行程資料並產生授權 URL
router.post('/prepare-sync', authMiddleware, async (req, res) => {
    try {
        const { itineraryId, startDate, endDate } = req.body;
        if (!itineraryId || !startDate || !endDate) {
            return res.status(400).json({ error: '缺少必要的行程資訊' });
        }
        req.session.syncData = { itineraryId, startDate, endDate };
        const scopes = ['https://www.googleapis.com/auth/calendar.events'];
        const authorizationUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: scopes,
            include_granted_scopes: true
        });
        res.json({ authorizationUrl });
    } catch (error) {
        console.error('準備同步時發生錯誤:', error);
        res.status(500).send('伺服器錯誤');
    }
});


// API 2: Google 授權後的回呼 (Callback)
router.get('/callback', async (req, res) => {
    try {
        const syncData = req.session.syncData;
        if (!syncData) {
            return res.status(400).send('授權階段作業已過期或無效，請重試。');
        }

        const { code } = req.query;
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        const itinerary = await Itinerary.findById(syncData.itineraryId);
        if (!itinerary) {
            return res.status(404).send('找不到對應的行程資料');
        }

        // --- 關鍵修正處：建立動態的日曆事件 ---
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
        
        // 為了建立正確的全天事件，結束日期需要加一天
        const endDate = new Date(syncData.endDate);
        endDate.setDate(endDate.getDate() + 1);
        const endDateString = endDate.toISOString().split('T')[0]; // 格式化為 'YYYY-MM-DD'

        const event = {
            'summary': itinerary.title, // 使用行程標題
            'description': itinerary.conversation.map(c => `${c.role === 'user' ? '你' : 'AI'}: ${c.content}`).join('\n\n'), // 使用對話紀錄作為描述
            'location': itinerary.route.startCity, // 使用起點城市作為地點
            'start': {
                'date': syncData.startDate, // 使用使用者選擇的開始日期
            },
            'end': {
                'date': endDateString, // 使用處理過的結束日期
            },
        };

        await calendar.events.insert({
            calendarId: 'primary',
            resource: event,
        });

        req.session.syncData = null; // 清除 session
        
        // 跳轉回 Netlify 網站，並附上成功訊息的查詢參數
        const successUrl = new URL(process.env.NETLIFY_SITE_URL || 'https://incredible-swan-2f06e7.netlify.app');
        successUrl.searchParams.set('sync_success', 'true');
        res.redirect(successUrl.href);

    } catch (error) {
        console.error('處理 Google Callback 時發生錯誤:', error);
        res.status(500).send('與 Google 授權時發生錯誤');
    }
});

module.exports = router;