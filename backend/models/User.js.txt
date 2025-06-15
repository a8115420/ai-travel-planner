// backend/models/User.js

const mongoose = require('mongoose');

// 1. 定義 User Schema (我們的會員註冊表格)
const UserSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true, // 必填欄位
        unique: true,   // 資料庫中不能有重複的 email
        trim: true,     // 自動移除頭尾的空白
        lowercase: true // 自動轉換為小寫
    },
    password: {
        type: String,
        required: true // 必填欄位
    },
    createdAt: {
        type: Date,
        default: Date.now // 預設為當下時間
    }
});

// 2. 根據 Schema 建立 User Model
// mongoose.model 的第一個參數是模型的「單數」名稱，Mongoose 會自動將其轉為「複數」作為資料庫中的 collection 名稱 (User -> users)
const User = mongoose.model('User', UserSchema);

// 3. 將 User Model 匯出，讓其他檔案可以使用
module.exports = User;