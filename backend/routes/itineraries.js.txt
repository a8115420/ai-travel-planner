// backend/routes/itineraries.js

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth'); // 引入我們剛剛建立的 auth 檢查哨
const Itinerary = require('../models/Itinerary'); // 引入行程模型

// --- 儲存新行程 API ---
// @route   POST /api/itineraries
// @desc    儲存一個新的行程
// @access  Private (需要 token)
router.post('/', auth, async (req, res) => { // 注意：在路徑和 async 之間，我們加入了 auth 這個中間件
    try {
        const { title, conversation, route } = req.body;

        const newItinerary = new Itinerary({
            title,
            conversation,
            route,
            user: req.user.id // 從 auth 中間件解碼出來的使用者 ID
        });

        const itinerary = await newItinerary.save();
        res.status(201).json(itinerary);

    } catch (err) {
        console.error(err.message);
        res.status(500).send('伺服器錯誤');
    }
});

// --- 讀取我的所有行程 API ---
// @route   GET /api/itineraries
// @desc    取得登入使用者的所有行程
// @access  Private (需要 token)
router.get('/', auth, async (req, res) => {
    try {
        // 根據使用者 ID 尋找所有行程，並依照建立時間倒序排列
        const itineraries = await Itinerary.find({ user: req.user.id }).sort({ createdAt: -1 });
        res.json(itineraries);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('伺服器錯誤');
    }
});
// backend/routes/itineraries.js

// ... 您已有的 GET '/' 和 POST '/' 路由 ...

// --- 讀取單筆行程 API ---
// @route   GET /api/itineraries/:id
// @desc    根據 ID 取得單筆行程
// @access  Private
router.get('/:id', auth, async (req, res) => {
    try {
        // 1. 根據 URL 傳來的 ID 尋找行程
        const itinerary = await Itinerary.findById(req.params.id);

        // 2. 如果找不到行程
        if (!itinerary) {
            return res.status(404).json({ error: '找不到該行程' });
        }

        // 3. 安全驗證：確保這個行程屬於當前登入的使用者
        // toString() 是為了確保型別一致
        if (itinerary.user.toString() !== req.user.id) {
            return res.status(401).json({ error: '沒有權限存取此行程' });
        }

        // 4. 回傳完整的行程資料
        res.json(itinerary);

    } catch (err) {
        console.error(err.message);
        // 如果 ID 格式不正確，也會觸發錯誤
        if (err.kind === 'ObjectId') {
            return res.status(404).json({ error: '找不到該行程' });
        }
        res.status(500).send('伺服器錯誤');
    }
});
// --- 讀取單筆行程 API ---
// @route   GET /api/itineraries/:id
// @desc    根據 ID 取得單筆行程
// @access  Private
router.get('/:id', auth, async (req, res) => {
    try {
        // 1. 根據 URL 傳來的 ID 尋找行程
        const itinerary = await Itinerary.findById(req.params.id);

        // 2. 如果找不到行程
        if (!itinerary) {
            return res.status(404).json({ error: '找不到該行程' });
        }

        // 3. 安全驗證：確保這個行程屬於當前登入的使用者
        // toString() 是為了確保型別一致
        if (itinerary.user.toString() !== req.user.id) {
            return res.status(401).json({ error: '沒有權限存取此行程' });
        }

        // 4. 回傳完整的行程資料
        res.json(itinerary);

    } catch (err) {
        console.error(err.message);
        // 如果 ID 格式不正確，也會觸發錯誤
        if (err.kind === 'ObjectId') {
            return res.status(404).json({ error: '找不到該行程' });
        }
        res.status(500).send('伺服器錯誤');
    }
});
// --- 刪除單筆行程 API ---
// @route   DELETE /api/itineraries/:id
// @desc    根據 ID 刪除單筆行程
// @access  Private
router.delete('/:id', auth, async (req, res) => {
    try {
        // 1. 根據 ID 尋找行程
        let itinerary = await Itinerary.findById(req.params.id);

        if (!itinerary) {
            return res.status(404).json({ error: '找不到該行程' });
        }

        // 2. 安全驗證：確保這個行程屬於當前登入的使用者
        if (itinerary.user.toString() !== req.user.id) {
            return res.status(401).json({ error: '沒有權限刪除此行程' });
        }

        // 3. 執行刪除
        await Itinerary.findByIdAndDelete(req.params.id);

        res.json({ message: '行程已成功刪除' });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('伺服器錯誤');
    }
});
// --- 更新單筆行程 API ---
// @route   PUT /api/itineraries/:id
// @desc    根據 ID 更新單筆行程的標題
// @access  Private
router.put('/:id', auth, async (req, res) => {
    try {
        const { title } = req.body; // 從請求主體中取得新標題

        // 檢查新標題是否存在
        if (!title) {
            return res.status(400).json({ error: '標題為必填欄位' });
        }

        let itinerary = await Itinerary.findById(req.params.id);

        if (!itinerary) {
            return res.status(404).json({ error: '找不到該行程' });
        }

        // 安全驗證：確保行程屬於當前使用者
        if (itinerary.user.toString() !== req.user.id) {
            return res.status(401).json({ error: '沒有權限修改此行程' });
        }

        // 尋找並更新行程
        // { new: true } 這個選項會讓函式回傳更新「後」的最新資料
        itinerary = await Itinerary.findByIdAndUpdate(
            req.params.id,
            { $set: { title: title } },
            { new: true }
        );

        res.json(itinerary); // 回傳更新後的行程

    } catch (err) {
        console.error(err.message);
        res.status(500).send('伺服器錯誤');
    }
});


module.exports = router;