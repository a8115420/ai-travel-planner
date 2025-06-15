// backend/routes/auth.js

const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');

// --- 註冊 API ---
// @route   POST /api/auth/register
// @desc    註冊新使用者
router.post('/register', async (req, res) => {
    try {
        // 1. 從請求的 body 中取得 email 和 password
        const { email, password } = req.body;

        // 2. 檢查使用者是否已存在
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ error: '此 Email 已被註冊' });
        }

        // 3. 建立新使用者實例
        user = new User({
            email,
            password,
        });

        // 4. 將密碼加密 (加鹽處理)
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);

        // 5. 將新使用者存入資料庫
        await user.save();

        // 6. 回傳成功訊息 (未來這裡會改成回傳 JWT Token)
        res.status(201).json({ message: '使用者註冊成功！' });

    } catch (error) {
        console.error('註冊 API 發生錯誤:', error.message);
        res.status(500).json({ error: '伺服器內部錯誤' });
    }
});

module.exports = router;

// --- 登入 API ---
// @route   POST /api/auth/login
// @desc    登入使用者並回傳 JWT Token
router.post('/login', async (req, res) => {
    try {
        // 1. 從請求的 body 中取得 email 和 password
        const { email, password } = req.body;

        // 2. 檢查使用者是否存在
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ error: '使用者不存在' });
        }

        // 3. 比對密碼
        // 將使用者輸入的 password (原始密碼) 與資料庫中的 user.password (加密過的密碼) 進行比對
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: '密碼錯誤' });
        }

        // 4. 密碼正確，準備簽發 JWT
        // 準備要放進 token 的資料 (Payload)，通常只放不敏感的資訊，例如使用者 ID
        const payload = {
            user: {
                id: user.id,
            },
        };

        // 5. 簽發 Token
        // jwt.sign(payload, 私鑰, {選項}, callback)
        jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: 3600 }, // token 有效期為 3600 秒 (1 小時)
            (err, token) => {
                if (err) throw err;
                // 6. 將 token 回傳給前端
                res.json({ token });
            }
        );

    } catch (error) {
        console.error('登入 API 發生錯誤:', error.message);
        res.status(500).json({ error: '伺服器內部錯誤' });
    }
});

module.exports = router;