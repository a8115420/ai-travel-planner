// backend/middleware/auth.js

const jwt = require('jsonwebtoken');

module.exports = function(req, res, next) {
    // 1. 從請求的 header 中取得 token
    const token = req.header('Authorization');

    // 2. 檢查 token 是否存在
    if (!token) {
        return res.status(401).json({ error: '沒有提供 token，授權失敗' });
    }

    // Token 通常會是 "Bearer <token>" 的格式，我們需要取出 token 的部分
    const tokenValue = token.split(' ')[1];
    if (!tokenValue) {
        return res.status(401).json({ error: 'Token 格式錯誤，授權失敗' });
    }

    try {
        // 3. 驗證 token
        const decoded = jwt.verify(tokenValue, process.env.JWT_SECRET);

        // 4. 將 token 中解碼出來的使用者資訊，附加到 req 物件上
        req.user = decoded.user;

        // 5. 呼叫 next()，放行請求，讓它可以繼續往下執行到真正的 API 邏輯
        next();
    } catch (err) {
        res.status(401).json({ error: '無效的 token' });
    }
};