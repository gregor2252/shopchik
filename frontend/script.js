let tg = window.Telegram.WebApp;
tg.expand();

const API_BASE = '/api';
let products = [];

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
        <div class="product-card" onclick="showProduct(${product.id})">
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

function showProduct(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    const message = `Здравствуйте, я хочу купить "${product.name}"`;
    const managerUsername = 'ваш_менеджер'; // Замените на username менеджера
    
    tg.showAlert(`
        ${product.name}
        Цена: ${product.price} ₽
        
        ${product.description}
        
        Нажмите OK, чтобы написать менеджеру
    `, () => {
        window.location.href = `https://t.me/${managerUsername}?text=${encodeURIComponent(message)}`;
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Search functionality
let searchTimeout;
document.getElementById('search').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        loadProducts(e.target.value);
    }, 500);
});

// Load products on page load
loadProducts();

// Set theme colors from Telegram
tg.setHeaderColor('bg_color');
tg.setBackgroundColor('bg_color');