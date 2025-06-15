// backend/models/Itinerary.js

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ItinerarySchema = new Schema({
    // 這個欄位非常關鍵，它將行程與使用者關聯起來
    user: {
        type: Schema.Types.ObjectId, // 存放一個 User 的 ID
        ref: 'User' // 指向 User 模型
    },
    title: {
        type: String,
        required: true // 行程必須有標題
    },
    // 我們直接將整個對話紀錄儲存起來
    conversation: {
        type: Array,
        default: []
    },
    route: {
        startCity: String,
        endCity: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Itinerary', ItinerarySchema);