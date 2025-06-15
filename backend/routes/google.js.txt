// backend/routes/google.js

const express = require('express');
const router = express.Router();
const { google } = require('googleapis');

// 建立 OAuth2 用戶端
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

// --- API 1: 產生並導向授權 URL ---
// 當使用者點擊前端按鈕時，會被導向這個 API
router.get('/', (req, res) => {
    // 我們需要的權限範圍 (scope)：讀寫日曆事件
    const scopes = [
        'https://www.googleapis.com/auth/calendar.events'
    ];

    // 產生授權頁面的 URL
    const authorizationUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline', // 'offline' 會回傳 refresh_token
        scope: scopes,
        include_granted_scopes: true
    });

    // 將使用者重新導向到 Google 的授權頁面
    res.redirect(authorizationUrl);
});


// --- API 2: 接收 Google 授權後的回呼 (Callback) ---
// 當使用者在 Google 頁面按下「同意」後，Google 會將他導回這個 API
router.get('/callback', async (req, res) => {
    try {
        // 從 Google 回傳的 URL 中取得授權碼 (code)
        const { code } = req.query;

        console.log('從 Google 收到的授權碼:', code);

        // 用授權碼 (code) 換取通行證 (tokens)
        const { tokens } = await oauth2Client.getToken(code);
        console.log('成功換取到的 Tokens:', tokens);

        // 將通行證設定到我們的 OAuth2 用戶端上
        oauth2Client.setCredentials(tokens);

        // 在真實應用中，您應該將 'tokens' (特別是 refresh_token)
        // 儲存到該使用者的資料庫記錄中，以便未來可以直接使用，無需使用者再次授權。

        // --- 成功取得授權！現在來執行新增日曆事件的操作 ---
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        // 建立一個範例事件
        const event = {
            'summary': '我的AI規劃歐洲之旅',
            'description': '這是一個由 AI 智慧導遊 App 自動新增的行程。',
            'start': {
                'dateTime': '2025-07-20T09:00:00-07:00',
                'timeZone': 'Europe/Rome',
            },
            'end': {
                'dateTime': '2025-07-20T17:00:00-07:00',
                'timeZone': 'Europe/Rome',
            },
        };

        await calendar.events.insert({
            calendarId: 'primary', // 'primary' 代表使用者的主要日曆
            resource: event,
        });

        console.log('成功新增日曆事件！');

        // 操作完成後，將使用者導回前端頁面
        // 請將此處的 URL 換成您本地端 index.html 的訪問路徑，如果您是用 VS Code 的 Live Server，通常是 http://127.0.0.1:5500/index.html
        res.redirect('http://127.0.0.1:5500/index.html'); 

    } catch (error) {
        console.error('處理 Google Callback 時發生錯誤:', error);
        res.status(500).send('與 Google 授權時發生錯誤');
    }
});


module.exports = router;