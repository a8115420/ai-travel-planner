// server.js (極簡化測試版)

const express = require('express');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());

// 測試路由一：根目錄
app.get('/', (req, res) => {
    res.send('Hello from the root! The server is running.');
});

// 測試路由二：API 子路徑
app.get('/api/test', (req, res) => {
    res.json({ 
        status: 'Success',
        message: 'The /api/test route is working correctly!' 
    });
});

app.listen(port, () => {
    console.log(`Minimal test server listening on port ${port}`);
});