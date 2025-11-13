// ============================================
// CONFIGURACIÓN DE GOOGLE SHEETS
// ============================================

// INSTRUCCIONES PARA CONFIGURAR:
// 1. Ve a https://console.cloud.google.com/
// 2. Crea un proyecto nuevo
// 3. Habilita "Google Sheets API"
// 4. Crea credenciales (API Key)
// 5. También puedes usar Apps Script Web App (más fácil)

// Apps Script Web App URL
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxf2zjJq_dpOeSYdROSJ72BLpm6QzBoiubZCiQrpnE2GN-FbqUfBRVh7b1lUVbBSEMw/exec';

// Sheet ID
const SHEET_ID = '1C9JdA-_eJ6sI9_fa1Q_8oY9vxXUuxXESjCcMfcFGOWc';

// ============================================
// ESTRUCTURA DE DATOS EN GOOGLE SHEETS
// ============================================
/*
Hoja "Users" (usuarios):
| Email              | Password | Name     |
|--------------------|----------|----------|
| user@example.com   | pass123  | Juan     |

Hoja "Teams" (equipos):
| TeamID | UserEmail         | TeamName      | Description     |
|--------|-------------------|---------------|-----------------|
| 1      | user@example.com  | Equipo Alpha  | Primer equipo   |

Hoja "Photos" (fotos):
| PhotoID | TeamID | ImageData (base64 o URL) | UploadDate |
|---------|--------|--------------------------|------------|
| 1       | 1      | data:image/jpeg;base64...| 2025-01-15 |

Hoja "Messages" (mensajes del chat):
| MessageID | TeamID | UserEmail        | Message          | Timestamp  |
|-----------|--------|------------------|------------------|------------|
| 1         | 1      | user@example.com | Hola equipo!     | 2025-01-15 |
*/

// ============================================
// VARIABLES GLOBALES
// ============================================
let currentUser = null;
let currentTeam = null;
let allTeams = [];
let currentPhotos = [];
let currentSlideIndex = 0;
let slideshowInterval = null;
let recognition = null;

// ============================================
// INICIALIZACIÓN
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    setupEventListeners();
    setupSpeechRecognition();
});

function initializeApp() {
    // Verificar si hay sesión guardada
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        showMainScreen();
    } else {
        showLoginScreen();
    }
}

function setupEventListeners() {
    // Login
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    
    // Equipos
    document.getElementById('team-form').addEventListener('submit', handleCreateTeam);
    document.getElementById('back-btn').addEventListener('click', showMainScreen);
    
    // Fotos
    document.getElementById('upload-btn').addEventListener('click', handleUploadPhotos);
    document.getElementById('prev-btn').addEventListener('click', () => changeSlide(-1));
    document.getElementById('next-btn').addEventListener('click', () => changeSlide(1));
    
    // Chat
    document.getElementById('send-btn').addEventListener('click', handleSendMessage);
    document.getElementById('chat-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSendMessage();
    });
    document.getElementById('mic-btn').addEventListener('click', handleVoiceInput);
    
    // Modal
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('modal-delete').addEventListener('click', handleDeletePhoto);
    document.getElementById('modal-zoom').addEventListener('click', toggleZoom);
}

// ============================================
// AUTENTICACIÓN
// ============================================
async function handleLogin(e) {
    e.preventDefault();
    showLoading(true);
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    try {
        const isValid = await loginUser(email, password);
        
        if (isValid) {
            currentUser = { email };
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            document.getElementById('login-error').textContent = '';
            showMainScreen();
        } else {
            document.getElementById('login-error').textContent = 'Email o contraseña incorrectos';
        }
    } catch (error) {
        console.error('Error en login:', error);
        document.getElementById('login-error').textContent = 'Error al iniciar sesión';
    }
    
    showLoading(false);
}

async function loginUser(email, password) {
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=login&email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`);
        const data = await response.json();
        return data.success;
    } catch (error) {
        console.error('Error en loginUser:', error);
        return false;
    }
}

function handleLogout() {
    currentUser = null;
    currentTeam = null;
    localStorage.removeItem('currentUser');
    showLoginScreen();
}

// ============================================
// NAVEGACIÓN ENTRE PANTALLAS
// ============================================
function showLoginScreen() {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('login-screen').classList.add('active');
}

function showMainScreen() {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('main-screen').classList.add('active');
    document.getElementById('user-email').textContent = currentUser.email;
    loadTeams();
}

function showTeamDetailScreen(team) {
    currentTeam = team;
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('team-detail-screen').classList.add('active');
    document.getElementById('team-detail-name').textContent = team.name;
    
    loadTeamPhotos(team.id);
    loadTeamChat(team.id);
    updateBudget(team.id);
}

// ============================================
// GESTIÓN DE EQUIPOS
// ============================================
async function loadTeams() {
    showLoading(true);
    
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=getTeams&email=${encodeURIComponent(currentUser.email)}`);
        const data = await response.json();
        allTeams = data.teams || [];
        
        renderTeams();
    } catch (error) {
        console.error('Error cargando equipos:', error);
        allTeams = [];
        renderTeams();
    }
    
    showLoading(false);
}

function renderTeams() {
    const container = document.getElementById('teams-list');
    container.innerHTML = '';
    
    allTeams.forEach(team => {
        const card = document.createElement('div');
        card.className = 'team-card';
        card.innerHTML = `
            <h3>${team.name}</h3>
            <p>${team.description || 'Sin descripción'}</p>
        `;
        card.addEventListener('click', () => showTeamDetailScreen(team));
        container.appendChild(card);
    });
}

async function handleCreateTeam(e) {
    e.preventDefault();
    showLoading(true);
    
    const name = document.getElementById('team-name').value;
    const description = document.getElementById('team-description').value;
    
    console.log('Creando equipo:', { name, description, userEmail: currentUser.email });
    
    try {
        const newTeam = await addTeam(name, description);
        console.log('Equipo creado:', newTeam);
        
        if (newTeam && newTeam.id) {
            allTeams.push(newTeam);
            renderTeams();
            document.getElementById('team-form').reset();
            alert('Equipo creado exitosamente!');
        } else {
            console.error('Error: respuesta sin ID', newTeam);
            alert('Error al crear equipo. Revisa la consola.');
        }
    } catch (error) {
        console.error('Error creando equipo:', error);
        alert('Error al crear equipo: ' + error.message);
    }
    
    showLoading(false);
}

async function addTeam(name, description) {
    try {
        console.log('Enviando request a Apps Script...');
        const payload = {
            action: 'addTeam',
            userEmail: currentUser.email,
            name,
            description
        };
        console.log('Payload:', payload);
        
        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });
        
        console.log('Response status:', response.status);
        const data = await response.json();
        console.log('Response data:', data);
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        return data.team;
    } catch (error) {
        console.error('Error en addTeam:', error);
        throw error;
    }
}

// ============================================
// GESTIÓN DE FOTOS
// ============================================
async function loadTeamPhotos(teamId) {
    showLoading(true);
    
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=getPhotos&teamId=${teamId}`);
        const data = await response.json();
        currentPhotos = data.photos || [];
        
        showSlideshow();
    } catch (error) {
        console.error('Error cargando fotos:', error);
        currentPhotos = [];
        showSlideshow();
    }
    
    showLoading(false);
}

function showSlideshow() {
    const container = document.getElementById('slideshow-images');
    container.innerHTML = '';
    
    if (currentPhotos.length === 0) {
        container.innerHTML = '<p style="color: #999;">No hay fotos aún</p>';
        return;
    }
    
    currentPhotos.forEach((photo, index) => {
        const img = document.createElement('img');
        img.src = photo.imageData;
        img.className = 'slide-image';
        img.dataset.photoId = photo.id;
        if (index === 0) img.classList.add('active');
        img.addEventListener('click', () => openModal(photo));
        container.appendChild(img);
    });
    
    currentSlideIndex = 0;
    startSlideshow();
}

function startSlideshow() {
    if (slideshowInterval) clearInterval(slideshowInterval);
    
    if (currentPhotos.length > 1) {
        slideshowInterval = setInterval(() => {
            changeSlide(1);
        }, 3000);
    }
}

function changeSlide(direction) {
    const slides = document.querySelectorAll('.slide-image');
    if (slides.length === 0) return;
    
    slides[currentSlideIndex].classList.remove('active');
    
    currentSlideIndex += direction;
    if (currentSlideIndex >= slides.length) currentSlideIndex = 0;
    if (currentSlideIndex < 0) currentSlideIndex = slides.length - 1;
    
    slides[currentSlideIndex].classList.add('active');
}

async function handleUploadPhotos() {
    const fileInput = document.getElementById('photo-upload');
    const files = fileInput.files;
    
    if (files.length === 0) {
        alert('Por favor selecciona al menos una foto');
        return;
    }
    
    showLoading(true);
    
    for (let file of files) {
        try {
            const base64 = await convertToBase64(file);
            await uploadPhoto(currentTeam.id, base64);
        } catch (error) {
            console.error('Error subiendo foto:', error);
        }
    }
    
    fileInput.value = '';
    await loadTeamPhotos(currentTeam.id);
    showLoading(false);
}

async function uploadPhoto(teamId, imageData) {
    try {
        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'uploadPhoto',
                teamId,
                imageData,
                uploadDate: new Date().toISOString()
            })
        });
        return await response.json();
    } catch (error) {
        console.error('Error en uploadPhoto:', error);
        throw error;
    }
}

function convertToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ============================================
// MODAL DE FOTOS
// ============================================
let currentModalPhoto = null;

function openModal(photo) {
    currentModalPhoto = photo;
    const modal = document.getElementById('photo-modal');
    const img = document.getElementById('modal-image');
    
    img.src = photo.imageData;
    img.classList.remove('zoomed');
    modal.classList.add('active');
}

function closeModal() {
    document.getElementById('photo-modal').classList.remove('active');
    currentModalPhoto = null;
}

function toggleZoom() {
    const img = document.getElementById('modal-image');
    img.classList.toggle('zoomed');
}

async function handleDeletePhoto() {
    if (!currentModalPhoto) return;
    
    if (!confirm('¿Estás seguro de eliminar esta foto?')) return;
    
    showLoading(true);
    
    try {
        await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'deletePhoto',
                photoId: currentModalPhoto.id
            })
        });
        
        // Recargar fotos del equipo
        closeModal();
        await loadTeamPhotos(currentTeam.id);
    } catch (error) {
        console.error('Error eliminando foto:', error);
        alert('Error al eliminar la foto');
    }
    
    showLoading(false);
}

// ============================================
// CHAT CON IA
// ============================================
async function loadTeamChat(teamId) {
    showLoading(true);
    
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=getMessages&teamId=${teamId}`);
        const data = await response.json();
        renderMessages(data.messages || []);
    } catch (error) {
        console.error('Error cargando chat:', error);
        renderMessages([]);
    }
    
    showLoading(false);
}

function renderMessages(messages) {
    const container = document.getElementById('chat-messages');
    container.innerHTML = '';
    
    messages.forEach(msg => {
        const div = document.createElement('div');
        div.className = 'chat-message';
        div.innerHTML = `
            <strong>${msg.userEmail}</strong>
            <p>${msg.message}</p>
        `;
        container.appendChild(div);
    });
    
    container.scrollTop = container.scrollHeight;
}

async function handleSendMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    
    if (!message) return;
    
    showLoading(true);
    
    try {
        // Guardar mensaje
        await saveMessage(currentTeam.id, message);
        
        // Agregar a UI
        const container = document.getElementById('chat-messages');
        const div = document.createElement('div');
        div.className = 'chat-message';
        div.innerHTML = `
            <strong>${currentUser.email}</strong>
            <p>${message}</p>
        `;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
        
        input.value = '';
        
        // Analizar con IA para detectar montos
        await analyzeMessageWithAI(currentTeam.id, message);
        
    } catch (error) {
        console.error('Error enviando mensaje:', error);
    }
    
    showLoading(false);
}

async function saveMessage(teamId, message) {
    try {
        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'saveMessage',
                teamId,
                userEmail: currentUser.email,
                message,
                timestamp: new Date().toISOString()
            })
        });
        return await response.json();
    } catch (error) {
        console.error('Error en saveMessage:', error);
        throw error;
    }
}

async function analyzeMessageWithAI(teamId, message) {
    try {
        // LLAMADA A GEMINI API (requiere API key de Google AI):
        /*
        const GEMINI_API_KEY = 'TU_GEMINI_API_KEY';
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `Analiza este mensaje y extrae SOLO los valores monetarios mencionados. Responde con un número total o 0 si no hay montos: "${message}"`
                    }]
                }]
            })
        });
        const data = await response.json();
        const amount = parseFloat(data.candidates[0].content.parts[0].text) || 0;
        */
        
        // SIMULACIÓN TEMPORAL - Regex simple para detectar montos:
        const regex = /(\d+(?:\.\d+)?)\s*(?:dólares|dolares|usd|\$|pesos|euros)/gi;
        const matches = message.matchAll(regex);
        let total = 0;
        
        for (let match of matches) {
            total += parseFloat(match[1]);
        }
        
        if (total > 0) {
            await updateBudget(teamId, total);
        }
    } catch (error) {
        console.error('Error analizando con IA:', error);
    }
}

async function updateBudget(teamId, addAmount = 0) {
    // IMPLEMENTACIÓN: Leer el presupuesto actual de Sheets, sumar addAmount y actualizar
    // Por ahora, simulamos:
    
    let currentBudget = parseFloat(localStorage.getItem(`budget_${teamId}`) || '0');
    currentBudget += addAmount;
    localStorage.setItem(`budget_${teamId}`, currentBudget.toString());
    
    document.getElementById('team-budget-amount').textContent = `$${currentBudget.toFixed(2)}`;
}

// ============================================
// RECONOCIMIENTO DE VOZ
// ============================================
function setupSpeechRecognition() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        console.warn('Speech Recognition no soportado en este navegador');
        document.getElementById('mic-btn').disabled = true;
        return;
    }
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = 'es-ES';
    recognition.continuous = false;
    recognition.interimResults = false;
    
    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        document.getElementById('chat-input').value = transcript;
        document.getElementById('mic-btn').classList.remove('recording');
    };
    
    recognition.onerror = (event) => {
        console.error('Error en reconocimiento de voz:', event.error);
        document.getElementById('mic-btn').classList.remove('recording');
    };
    
    recognition.onend = () => {
        document.getElementById('mic-btn').classList.remove('recording');
    };
}

function handleVoiceInput() {
    if (!recognition) {
        alert('Reconocimiento de voz no disponible en este navegador');
        return;
    }
    
    const btn = document.getElementById('mic-btn');
    
    if (btn.classList.contains('recording')) {
        recognition.stop();
        btn.classList.remove('recording');
    } else {
        recognition.start();
        btn.classList.add('recording');
    }
}

// ============================================
// UTILIDADES
// ============================================
function showLoading(show) {
    const loading = document.getElementById('loading');
    if (show) {
        loading.classList.add('active');
    } else {
        loading.classList.remove('active');
    }
}
