let tg = window.Telegram.WebApp;
tg.expand();
tg.enableClosingConfirmation();

const API_BASE = '/api';
let products = [];

// Укажите здесь username менеджера (без символа @)
// УБЕРИТЕ ПРОВЕРКУ НА ЗНАЧЕНИЕ ПО УМОЛЧАНИЮ
const MANAGER_USERNAME = 'kuptyomik'; // Это реальный username

async function loadProducts(search = '') {
    const loading = document.getElementById('loading');
    const productsDiv = document.getElementById('products');

    loading.style.display = 'block';
    productsDiv.innerHTML = '';

    try {
        let url = `${API_BASE}/products`;
        if (search) {
            url += `?search=${encodeURIComponent(search)}`;
        }

        const response = await fetch(url);
        const data = await response.json();
        products = data.products;

        renderProducts(products);
    } catch (error) {
        console.error('Error loading products:', error);
        productsDiv.innerHTML = '<div class="error">Ошибка загрузки товаров</div>';
    } finally {
        loading.style.display = 'none';
    }
}

function renderProducts(productsList) {
    const productsDiv = document.getElementById('products');

    if (productsList.length === 0) {
        productsDiv.innerHTML = '<div class="empty">Товары не найдены</div>';
        return;
    }

    productsDiv.innerHTML = productsList.map(product => `
        <div class="product-card" onclick="showProductDetail(${product.id})">
            ${product.photos && product.photos[0] ?
            `<img src="${product.photos[0]}" alt="${product.name}" class="product-image">` :
            '<div class="product-image" style="background: #ccc; display: flex; align-items: center; justify-content: center;">Нет фото</div>'
        }
            <div class="product-info">
                <div class="product-title">${escapeHtml(product.name)}</div>
                <div class="product-price">${product.price} ₽</div>
            </div>
        </div>
    `).join('');
}

function showProductDetail(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    // Создаем всплывающее окно Telegram
    tg.showPopup({
        title: product.name,
        message: `Цена: ${product.price} ₽\n\n${product.description || ''}\n\nОтправить заявку менеджеру?`,
        buttons: [
            { id: 'buy', type: 'default', text: 'Купить' },
            { id: 'cancel', type: 'cancel', text: 'Отмена' }
        ]
    }, (buttonId) => {
        if (buttonId === 'buy') {
            contactManager(product.name);
        }
    });
}

function contactManager(productName) {
    const message = `Здравствуйте, я хочу купить "${productName}"`;

    // УБИРАЕМ ПРОВЕРКУ, ПРОСТО ПРОВЕРЯЕМ ЕСТЬ ЛИ USERNAME
    if (MANAGER_USERNAME && MANAGER_USERNAME.trim() !== '') {
        // Открываем чат с менеджером
        const chatUrl = `https://t.me/${MANAGER_USERNAME}?text=${encodeURIComponent(message)}`;
        console.log('Opening URL:', chatUrl); // Для отладки
        tg.openTelegramLink(chatUrl);
    } else {
        tg.showAlert('Пожалуйста, укажите username менеджера в настройках приложения');
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

let searchTimeout;
const searchInput = document.getElementById('search');
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            loadProducts(e.target.value);
        }, 500);
    });
}

// Инициализация
loadProducts();

// Устанавливаем основную кнопку (опционально)
tg.MainButton.setText('Обновить');
tg.MainButton.onClick(() => {
    loadProducts();
});