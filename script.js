// script.js (UI/UX 優化版 - 整合 Toastify.js)

// --- 全域變數 ---
let map = null;
let routeLayer = null;
let conversationHistory = [];

// --- DOMContentLoaded 事件監聽 ---
document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
    updateAuthUI();
});

// --- 統一的事件綁定函式 ---
function setupEventListeners() {
    document.getElementById('register-btn')?.addEventListener('click', () => openModal('register-modal'));
    document.getElementById('login-btn')?.addEventListener('click', () => openModal('login-modal'));
    document.getElementById('logout-btn')?.addEventListener('click', handleLogout);
    document.querySelectorAll('.modal-overlay .close-btn').forEach(btn => btn.addEventListener('click', () => closeModal(btn.closest('.modal-overlay').id)));
    document.getElementById('register-form')?.addEventListener('submit', handleRegisterSubmit);
    document.getElementById('login-form')?.addEventListener('submit', handleLoginSubmit);
    document.getElementById('save-itinerary-btn')?.addEventListener('click', saveItinerary);
    document.querySelectorAll('.tab-btn').forEach(tab => tab.addEventListener('click', handleTabClick));
    document.getElementById('itinerary-list')?.addEventListener('click', handleItineraryListClick);
    document.querySelector('.chat-input-area button')?.addEventListener('click', handleSendMessage);
    document.querySelector('.chat-input-area input')?.addEventListener('keypress', e => { if (e.key === 'Enter') handleSendMessage(); });
    document.getElementById('plan-route-btn')?.addEventListener('click', planRoute);
    document.getElementById('send-pdf-btn')?.addEventListener('click', sendPdf);
}

// --- UI 控制函式 ---
function openModal(modalId) { document.getElementById(modalId)?.classList.remove('hidden'); }
function closeModal(modalId) { document.getElementById(modalId)?.classList.add('hidden'); }

function showToast(message, type = 'success') {
    Toastify({
        text: message,
        duration: 3000,
        close: true,
        gravity: "top",
        position: "right",
        stopOnFocus: true,
        style: {
            background: type === 'success' ? "linear-gradient(to right, #00b09b, #96c93d)" : "linear-gradient(to right, #ff5f6d, #ffc371)",
        },
    }).showToast();
}

function updateAuthUI() {
    const token = localStorage.getItem('token');
    const elementsForLoggedIn = ['user-info', 'save-form-container', 'my-itineraries-tab-btn'];
    const elementsForLoggedOut = ['register-btn', 'login-btn'];
    if (token) {
        elementsForLoggedIn.forEach(id => document.getElementById(id)?.classList.remove('hidden'));
        elementsForLoggedOut.forEach(id => document.getElementById(id)?.classList.add('hidden'));
        document.getElementById('user-email-display').textContent = '歡迎您！';
    } else {
        elementsForLoggedIn.forEach(id => document.getElementById(id)?.classList.add('hidden'));
        elementsForLoggedOut.forEach(id => document.getElementById(id)?.classList.remove('hidden'));
    }
}

// --- 事件處理函式 ---
function handleTabClick() {
    const tabs = document.querySelectorAll('.tab-btn');
    const panes = document.querySelectorAll('.tab-pane');
    tabs.forEach(t => t.classList.remove('active'));
    panes.forEach(p => p.classList.remove('active'));
    this.classList.add('active');
    const targetPane = document.getElementById(this.dataset.tab);
    if (targetPane) targetPane.classList.add('active');
    if (this.dataset.tab === 'tab-2') { setTimeout(() => { if (map) map.invalidateSize(); }, 10); }
    if (this.dataset.tab === 'tab-4') { loadItineraries(); }
}

function handleItineraryListClick(event) {
    const target = event.target;
    const itineraryLi = target.closest('li');
    if (!itineraryLi) return;
    const itineraryId = itineraryLi.dataset.id;
    const currentTitle = itineraryLi.querySelector('h5').textContent;
    if (target.classList.contains('edit-btn')) {
        handleEditItinerary(itineraryId, currentTitle);
    } else if (target.classList.contains('delete-btn')) {
        handleDeleteItinerary(itineraryId);
    } else {
        fetchAndLoadItinerary(itineraryId);
    }
}

// --- 核心功能函式 ---

function initMap() {
    if (map) return;
    try {
        map = L.map('map').setView([48.8566, 2.3522], 5);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);
    } catch (error) {
        console.error("地圖初始化失敗:", error);
    }
}

async function handleRegisterSubmit(event) {
    event.preventDefault();
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    try {
        const response = await fetch('http://localhost:3000/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '註冊失敗');
        showToast('註冊成功！現在您可以使用這組帳號密碼登入。');
        closeModal('register-modal');
    } catch (error) {
        showToast(`註冊失敗：${error.message}`, 'error');
    }
}

async function handleLoginSubmit(event) {
    event.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    try {
        const response = await fetch('http://localhost:3000/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '登入失敗');
        localStorage.setItem('token', data.token);
        showToast('登入成功！');
        closeModal('login-modal');
        updateAuthUI();
    } catch (error) {
        showToast(`登入失敗：${error.message}`, 'error');
    }
}

function handleLogout() {
    localStorage.removeItem('token');
    showToast('您已成功登出。');
    updateAuthUI();
}

async function handleSendMessage() {
    const chatInput = document.querySelector('.chat-input-area input');
    const chatWindow = document.querySelector('.chat-window');
    const userMessage = chatInput.value;
    if (!userMessage.trim()) return;
    appendMessage(userMessage, 'user-message', chatWindow);
    conversationHistory.push({ role: 'user', content: userMessage });
    chatInput.value = '';
    try {
        const response = await fetch('http://localhost:3000/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: userMessage }),
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: '無法解析錯誤訊息' }));
            throw new Error(errorData.error || 'Network response was not ok');
        }
        const data = await response.json();
        appendMessage(data.reply, 'ai-message', chatWindow);
        conversationHistory.push({ role: 'ai', content: data.reply });
    } catch (error) {
        console.error('Fetch error:', error);
        appendMessage(`與 AI 連線時發生錯誤... (${error.message})`, 'ai-message', chatWindow);
    }
}

function appendMessage(text, className, window) {
    const messageElem = document.createElement('div');
    messageElem.className = `message ${className}`;
    messageElem.textContent = text;
    window.appendChild(messageElem);
    window.scrollTop = window.scrollHeight;
}

async function planRoute() {
    const startInput = document.getElementById('start-city');
    const endInput = document.getElementById('end-city');
    const planBtn = document.getElementById('plan-route-btn');
    const startCity = startInput.value;
    const endCity = endInput.value;
    if (!startCity || !endCity) return showToast('請輸入起點和終點！', 'error');
    planBtn.textContent = '規劃中...';
    planBtn.disabled = true;
    try {
        const response = await fetch('http://localhost:3000/api/route', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ startCity, endCity }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '路線規劃失敗');
        if (routeLayer) map.removeLayer(routeLayer);
        routeLayer = L.geoJSON(data.route, { style: { color: '#00A9FF', weight: 5, opacity: 0.8 } }).addTo(map);
        map.fitBounds(routeLayer.getBounds());
    } catch (error) {
        console.error('規劃路線時發生錯誤:', error);
        showToast(`發生錯誤：${error.message}`, 'error');
    } finally {
        planBtn.textContent = '規劃路線';
        planBtn.disabled = false;
    }
}

async function sendPdf() {
    const emailInput = document.getElementById('user-email');
    const sendBtn = document.getElementById('send-pdf-btn');
    const email = emailInput.value;
    if (!email || !email.includes('@')) return showToast('請輸入有效的 Email 地址！', 'error');
    if (conversationHistory.length === 0) return showToast('請先與 AI 對話以產生行程！', 'error');
    sendBtn.textContent = '寄送中...';
    sendBtn.disabled = true;
    try {
        const response = await fetch('http://localhost:3000/api/export/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email, history: conversationHistory }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '寄送失敗');
        showToast(data.message);
    } catch (error) {
        console.error('寄送 PDF 時發生錯誤:', error);
        showToast(`發生錯誤：${error.message}`, 'error');
    } finally {
        sendBtn.textContent = '寄送到信箱';
        sendBtn.disabled = false;
    }
}

async function saveItinerary() {
    const titleInput = document.getElementById('itinerary-title');
    const title = titleInput.value;
    const token = localStorage.getItem('token');
    if (!title.trim()) return showToast('請為您的行程取一個標題！', 'error');
    if (!token) return showToast('請先登入才能儲存行程。', 'error');
    const itineraryData = {
        title,
        conversation: conversationHistory,
        route: { startCity: document.getElementById('start-city').value, endCity: document.getElementById('end-city').value, }
    };
    try {
        const response = await fetch('http://localhost:3000/api/itineraries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(itineraryData)
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || '儲存失敗');
        }
        showToast('行程已成功儲存！');
        titleInput.value = '';
        document.getElementById('my-itineraries-tab-btn').click();
    } catch (error) {
        console.error('儲存行程時發生錯誤:', error);
        showToast(`錯誤：${error.message}`, 'error');
    }
}

async function loadItineraries() {
    const token = localStorage.getItem('token');
    const listElement = document.getElementById('itinerary-list');
    if (!token) return;
    listElement.innerHTML = '<p>讀取中...</p>';
    try {
        const response = await fetch('http://localhost:3000/api/itineraries', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('讀取行程失敗');
        const itineraries = await response.json();
        listElement.innerHTML = '';
        if (itineraries.length === 0) {
            listElement.innerHTML = '<p>目前沒有已儲存的行程。</p>';
        } else {
            itineraries.forEach(it => {
                const li = document.createElement('li');
                li.dataset.id = it._id;
                const date = new Date(it.createdAt).toLocaleDateString();
                li.innerHTML = `
                    <div class="itinerary-list-item">
                        <div>
                            <h5>${it.title}</h5>
                            <p>儲存於：${date}</p>
                        </div>
                        <div class="itinerary-item-actions">
                            <button class="edit-btn">編輯</button>
                            <button class="delete-btn">刪除</button>
                        </div>
                    </div>
                `;
                listElement.appendChild(li);
            });
        }
    } catch (error) {
        console.error('讀取行程時發生錯誤:', error);
        listElement.innerHTML = '<p>讀取行程時發生錯誤。</p>';
    }
}

async function fetchAndLoadItinerary(id) {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
        const response = await fetch(`http://localhost:3000/api/itineraries/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('無法載入行程詳細資料');
        const itinerary = await response.json();
        conversationHistory = itinerary.conversation || [];
        const chatWindow = document.querySelector('.chat-window');
        chatWindow.innerHTML = '';
        conversationHistory.forEach(item => {
            appendMessage(item.content, item.role === 'user' ? 'user-message' : 'ai-message', chatWindow);
        });
        document.getElementById('start-city').value = itinerary.route?.startCity || '';
        document.getElementById('end-city').value = itinerary.route?.endCity || '';
        if (routeLayer) {
            map.removeLayer(routeLayer);
            routeLayer = null;
        }
        showToast(`行程 "${itinerary.title}" 已成功載入！`);
        document.querySelector('.tab-btn[data-tab="tab-1"]').click();
    } catch (error) {
        console.error('載入行程時發生錯誤:', error);
        showToast(error.message, 'error');
    }
}

async function handleDeleteItinerary(id) {
    if (!confirm('您確定要刪除這個行程嗎？此操作無法復原。')) return;
    const token = localStorage.getItem('token');
    if (!token) return showToast('授權失效，請重新登入。', 'error');
    try {
        const response = await fetch(`http://localhost:3000/api/itineraries/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '刪除失敗');
        showToast(data.message);
        loadItineraries();
    } catch (error) {
        console.error('刪除行程時發生錯誤:', error);
        showToast(`錯誤：${error.message}`, 'error');
    }
}

async function handleEditItinerary(id, currentTitle) {
    const newTitle = prompt("請輸入新的行程標題：", currentTitle);
    if (!newTitle || newTitle.trim() === "") return;
    const token = localStorage.getItem('token');
    if (!token) return showToast('授權失效，請重新登入。', 'error');
    try {
        const response = await fetch(`http://localhost:3000/api/itineraries/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ title: newTitle })
        });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || '更新失敗');
        }
        showToast('行程標題已成功更新！');
        loadItineraries();
    } catch (error) {
        console.error('更新行程時發生錯誤:', error);
        showToast(`錯誤：${error.message}`, 'error');
    }
}