let tg = window.Telegram.WebApp;
tg.expand();

const API_BASE = '/api';
let products = [];
let currentFilters = {
    search: '',
    minPrice: null,
    maxPrice: null
};

const MANAGER_USERNAME = 'kuptyomik';

async function loadProducts() {
    const loading = document.getElementById('loading');
    const productsDiv = document.getElementById('products');

    loading.style.display = 'block';
    productsDiv.innerHTML = '';

    try {
        let url = `${API_BASE}/products?`;
        const params = [];
        
        if (currentFilters.search) {
            params.push(`search=${encodeURIComponent(currentFilters.search)}`);
        }
        
        if (currentFilters.minPrice !== null && currentFilters.minPrice > 0) {
            params.push(`min_price=${currentFilters.minPrice}`);
        }
        
        if (currentFilters.maxPrice !== null && currentFilters.maxPrice > 0) {
            params.push(`max_price=${currentFilters.maxPrice}`);
        }
        
        url += params.join('&');
        
        console.log('Loading products with filters:', currentFilters);
        
        const response = await fetch(url);
        const data = await response.json();
        products = data.products;

        renderProducts(products);
        
        // Обновляем информацию о фильтре
        updateFilterInfo();
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
                <div class="product-price">${product.price.toLocaleString()} ₽</div>
            </div>
        </div>
    `).join('');
}

function showProductDetail(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    tg.showPopup({
        title: product.name,
        message: `Цена: ${product.price.toLocaleString()} ₽\n\n${product.description || ''}\n\nОтправить заявку менеджеру?`,
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
    
    if (MANAGER_USERNAME && MANAGER_USERNAME.trim() !== '') {
        const chatUrl = `https://t.me/${MANAGER_USERNAME}?text=${encodeURIComponent(message)}`;
        tg.openTelegramLink(chatUrl);
    } else {
        tg.showAlert('Пожалуйста, укажите username менеджера в настройках приложения');
    }
}

// Фильтры
function toggleFilter() {
    const filterDiv = document.getElementById('priceFilter');
    const toggleBtn = document.querySelector('.filter-toggle');
    
    if (filterDiv.style.display === 'none') {
        filterDiv.style.display = 'block';
        toggleBtn.innerHTML = 'Фильтр по цене ▲';
    } else {
        filterDiv.style.display = 'none';
        toggleBtn.innerHTML = 'Фильтр по цене ▼';
    }
}

function applyPriceFilter() {
    const minPrice = document.getElementById('minPrice').value;
    const maxPrice = document.getElementById('maxPrice').value;
    
    currentFilters.minPrice = minPrice ? parseFloat(minPrice) : null;
    currentFilters.maxPrice = maxPrice ? parseFloat(maxPrice) : null;
    
    loadProducts();
}

function setPriceRange(min, max) {
    document.getElementById('minPrice').value = min;
    document.getElementById('maxPrice').value = max;
    applyPriceFilter();
}

function clearPriceFilter() {
    document.getElementById('minPrice').value = '';
    document.getElementById('maxPrice').value = '';
    currentFilters.minPrice = null;
    currentFilters.maxPrice = null;
    loadProducts();
}

function updateFilterInfo() {
    const filterInfo = document.getElementById('filterInfo');
    if (!filterInfo) return;
    
    let info = [];
    if (currentFilters.minPrice) info.push(`от ${currentFilters.minPrice}₽`);
    if (currentFilters.maxPrice) info.push(`до ${currentFilters.maxPrice}₽`);
    
    filterInfo.textContent = info.length ? `Фильтр: ${info.join(' ')}` : '';
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Поиск с задержкой
let searchTimeout;
const searchInput = document.getElementById('search');
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentFilters.search = e.target.value;
            loadProducts();
        }, 500);
    });
}

// Загрузка товаров при старте
loadProducts();