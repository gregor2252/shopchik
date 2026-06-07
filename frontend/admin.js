const API_BASE = '/api/admin';
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
const initData = tg ? tg.initData : '';
let productPreviewUrls = [];
let currentProductPhotos = [];
let broadcastPreviewUrl = null;

const CATEGORY_LABELS = {
    tshirts: 'Футболки',
    hoodies: 'Худи',
    pants: 'Штаны',
    jackets: 'Куртки',
    shoes: 'Обувь',
    accessories: 'Аксессуары'
};

if (tg) {
    tg.expand();
}

function getAuthHeaders() {
    return {
        'X-Telegram-Init-Data': initData
    };
}

function ensureTelegramAuth() {
    if (initData) return true;

    const productsDiv = document.getElementById('products');
    productsDiv.innerHTML = '<div class="error">Откройте админ-панель через кнопку в Telegram-боте</div>';
    return false;
}

async function adminFetch(url, options = {}) {
    const headers = {
        ...getAuthHeaders(),
        ...(options.headers || {})
    };

    const response = await fetch(url, {
        ...options,
        headers
    });

    if (response.status === 401 || response.status === 403) {
        throw new Error('access_denied');
    }

    return response;
}

async function getErrorMessage(response, fallback) {
    const error = await response.json().catch(() => null);
    if (!error) return fallback;

    if (typeof error.detail === 'string') {
        return error.detail;
    }

    if (Array.isArray(error.detail)) {
        return error.detail
            .map((item) => {
                if (typeof item === 'string') return item;
                if (item && typeof item.msg === 'string') return item.msg;
                return JSON.stringify(item);
            })
            .join('\n');
    }

    if (error.detail && typeof error.detail === 'object') {
        return error.detail.message || JSON.stringify(error.detail);
    }

    return error.message || fallback;
}

async function loadProducts() {
    const productsDiv = document.getElementById('products');
    if (!ensureTelegramAuth()) return;

    productsDiv.innerHTML = '<div class="loading">Загрузка...</div>';
    
    try {
        const response = await adminFetch(`${API_BASE}/products`);
        const products = await response.json();
        
        renderAdminProducts(products);
    } catch (error) {
        console.error('Error loading products:', error);
        productsDiv.innerHTML = '<div class="error">Нет доступа к админ-панели</div>';
    }
}

function renderAdminProducts(products) {
    const productsDiv = document.getElementById('products');
    
    if (products.length === 0) {
        productsDiv.innerHTML = '<div class="empty">Нет товаров. Создайте первый товар!</div>';
        return;
    }
    
    productsDiv.innerHTML = products.map(product => `
        <div class="product-card">
            ${product.photos && product.photos[0] ? 
                `<img src="${product.photos[0]}" alt="${product.name}" class="product-image">` : 
                '<div class="product-image" style="background: #ccc;">Нет фото</div>'
            }
            <div class="product-info">
                ${product.brand ? `<div class="product-brand">${escapeHtml(product.brand)}</div>` : ''}
                <div class="product-title">${escapeHtml(product.name)}</div>
                ${renderProductSizes(product)}
                <div class="product-price">${product.price} ₽</div>
                <button onclick="editProduct(${product.id})" class="btn btn-secondary" style="margin-top: 10px;">Редактировать</button>
            </div>
            <button onclick="deleteProduct(${product.id})" class="delete-btn">×</button>
        </div>
    `).join('');
}

function getProductSizes(product) {
    return normalizeSizeList(Array.isArray(product.sizes) && product.sizes.length ? product.sizes : [product.size]);
}

function normalizeSizeList(values) {
    const seen = new Set();
    return values
        .filter(Boolean)
        .flatMap((value) => String(value).replace(/\n/g, ',').split(','))
        .map((size) => size.trim())
        .filter((size) => {
            const key = size.toLowerCase();
            if (!size || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

function renderProductSizes(product) {
    const sizes = getProductSizes(product);
    if (!sizes.length) return '';

    return `
        <div class="product-size-list">
            ${sizes.map((size) => `<span class="product-size-pill">${escapeHtml(size)}</span>`).join('')}
        </div>
    `;
}

async function toggleBroadcastHistory() {
    const history = document.getElementById('broadcastHistory');
    const productsDiv = document.getElementById('products');

    if (history.style.display === 'none') {
        productsDiv.style.display = 'none';
        history.style.display = 'block';
        await loadBroadcastHistory();
    } else {
        history.style.display = 'none';
        productsDiv.style.display = '';
    }
}

async function loadBroadcastHistory() {
    const historyList = document.getElementById('broadcastHistoryList');
    historyList.innerHTML = '<div class="loading">Загрузка...</div>';

    try {
        const response = await adminFetch(`${API_BASE}/broadcasts`);
        const broadcasts = await response.json();
        renderBroadcastHistory(broadcasts);
    } catch (error) {
        console.error('Error loading broadcasts:', error);
        historyList.innerHTML = '<div class="error">Ошибка загрузки истории рассылок</div>';
    }
}

function renderBroadcastHistory(broadcasts) {
    const historyList = document.getElementById('broadcastHistoryList');

    if (!broadcasts.length) {
        historyList.innerHTML = '<div class="empty">Рассылок пока нет</div>';
        return;
    }

    historyList.innerHTML = broadcasts.map((broadcast) => `
        <div class="broadcast-history-item">
            <div class="broadcast-history-top">
                <strong>${escapeHtml(broadcast.status)}</strong>
                <span>${formatDate(broadcast.sent_at || broadcast.scheduled_time)}</span>
            </div>
            <div class="broadcast-message">${escapeHtml(broadcast.message)}</div>
            ${broadcast.photo_url ? `<img src="${escapeAttribute(broadcast.photo_url)}" class="broadcast-history-photo" alt="Фото рассылки">` : ''}
            <div class="broadcast-stats">Отправлено: ${broadcast.total_sent || 0}, ошибок: ${broadcast.total_failed || 0}</div>
        </div>
    `).join('');
}

function formatDate(value) {
    if (!value) return 'без даты';
    return new Date(value).toLocaleString('ru-RU');
}

function showProductForm() {
    document.getElementById('modalTitle').innerText = 'Добавить товар';
    document.getElementById('productForm').reset();
    document.getElementById('productId').value = '';
    currentProductPhotos = [];
    renderCurrentProductPhotos();
    clearProductPhotos();
    document.getElementById('productModal').style.display = 'block';
}

function editProduct(productId) {
    loadProductData(productId);
}

async function loadProductData(productId) {
    try {
        const response = await adminFetch(`${API_BASE}/products/${productId}`);
        const product = await response.json();
        
        document.getElementById('modalTitle').innerText = 'Редактировать товар';
        document.getElementById('productId').value = product.id;
        document.getElementById('productName').value = product.name;
        document.getElementById('productBrand').value = product.brand || '';
        document.getElementById('productDescription').value = product.description;
        document.getElementById('productPrice').value = product.price;
        document.getElementById('productOldPrice').value = product.old_price || '';
        document.getElementById('productCategory').value = product.category || '';
        document.getElementById('productSizes').value = getProductSizes(product).join(', ');
        currentProductPhotos = product.photos || [];
        renderCurrentProductPhotos();
        clearProductPhotos();
        document.getElementById('productModal').style.display = 'block';
    } catch (error) {
        console.error('Error loading product:', error);
        alert('Ошибка загрузки товара');
    }
}

async function deleteProduct(productId) {
    if (!confirm('Вы уверены, что хотите удалить этот товар?')) return;
    
    try {
        const response = await adminFetch(`${API_BASE}/products/${productId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            alert('Товар удален');
            loadProducts();
        } else {
            alert('Ошибка при удалении');
        }
    } catch (error) {
        console.error('Error deleting product:', error);
        alert('Ошибка при удалении');
    }
}

document.getElementById('productForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const productId = document.getElementById('productId').value;
    const formData = new FormData();
    formData.append('name', document.getElementById('productName').value);
    formData.append('brand', document.getElementById('productBrand').value);
    formData.append('category', document.getElementById('productCategory').value);
    formData.append('description', document.getElementById('productDescription').value);
    formData.append('price', document.getElementById('productPrice').value);
    parseSizes(document.getElementById('productSizes').value).forEach((size) => {
        formData.append('sizes', size);
    });
    const oldPrice = document.getElementById('productOldPrice').value;
    if (oldPrice) {
        formData.append('old_price', oldPrice);
    }

    currentProductPhotos.forEach((photo) => {
        formData.append('existing_photos', photo);
    });
    
    const photos = document.getElementById('productPhotos').files;
    for (let i = 0; i < photos.length; i++) {
        formData.append('photos', photos[i]);
    }
    
    try {
        let response;
        if (productId) {
            response = await adminFetch(`${API_BASE}/products/${productId}`, {
                method: 'PUT',
                body: formData
            });
        } else {
            response = await adminFetch(`${API_BASE}/products`, {
                method: 'POST',
                body: formData
            });
        }
        
        if (response.ok) {
            alert(productId ? 'Товар обновлен' : 'Товар создан');
            closeModal();
            loadProducts();
        } else {
            alert(await getErrorMessage(response, 'Ошибка при сохранении'));
        }
    } catch (error) {
        console.error('Error saving product:', error);
        alert('Ошибка при сохранении');
    }
});

function parseSizes(value) {
    const seen = new Set();
    return value
        .split(',')
        .map((size) => size.trim())
        .filter((size) => {
            const key = size.toLowerCase();
            if (!size || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

function showBroadcastForm() {
    document.getElementById('broadcastModal').style.display = 'block';
}

document.getElementById('broadcastForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitButton = e.target.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'Отправка...';
    
    const formData = new FormData();
    formData.append('message', document.getElementById('broadcastMessage').value);
    
    const photo = document.getElementById('broadcastPhoto').files[0];
    if (photo) {
        formData.append('photo', photo);
    }
    
    const scheduledTime = document.getElementById('broadcastTime').value;
    if (scheduledTime) {
        formData.append('scheduled_time', scheduledTime);
    }
    
    try {
        const response = await adminFetch(`${API_BASE}/broadcast`, {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            const data = await response.json();
            alert(data.message);
            if (data.failed > 0 && data.sent === 0) {
                return;
            }
            closeBroadcastModal();
        } else {
            alert(await getErrorMessage(response, 'Ошибка при создании рассылки'));
        }
    } catch (error) {
        console.error('Error creating broadcast:', error);
        alert('Ошибка при создании рассылки');
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Отправить';
    }
});

function closeModal() {
    document.getElementById('productModal').style.display = 'none';
    document.getElementById('productForm').reset();
    currentProductPhotos = [];
    renderCurrentProductPhotos();
    clearProductPhotos();
}

function renderCurrentProductPhotos() {
    const block = document.getElementById('currentProductPhotosBlock');
    const container = document.getElementById('currentProductPhotos');

    if (!block || !container) return;

    block.style.display = currentProductPhotos.length ? 'block' : 'none';
    container.innerHTML = currentProductPhotos.map((photo, index) => `
        <div class="photo-preview-item">
            <img src="${escapeAttribute(photo)}" class="product-photo-preview" alt="Фото товара ${index + 1}">
            <button type="button" class="photo-remove-btn" onclick="removeCurrentProductPhoto(${index})" aria-label="Удалить фото">×</button>
        </div>
    `).join('');
}

function removeCurrentProductPhoto(index) {
    currentProductPhotos.splice(index, 1);
    renderCurrentProductPhotos();
}

function clearProductPhotos() {
    const photosInput = document.getElementById('productPhotos');
    const photosName = document.getElementById('productPhotosName');
    const photosPreview = document.getElementById('productPhotosPreview');

    if (photosInput) {
        photosInput.value = '';
    }

    if (photosName) {
        photosName.textContent = 'Фото не выбраны';
    }

    productPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    productPreviewUrls = [];

    if (photosPreview) {
        photosPreview.innerHTML = '';
    }
}

document.getElementById('productPhotos').addEventListener('change', (event) => {
    const photosName = document.getElementById('productPhotosName');
    const photosPreview = document.getElementById('productPhotosPreview');
    const files = Array.from(event.target.files);

    productPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    productPreviewUrls = [];
    photosPreview.innerHTML = '';

    if (!files.length) {
        photosName.textContent = 'Фото не выбраны';
        return;
    }

    photosName.textContent = files.length === 1 ? files[0].name : `Выбрано фото: ${files.length}`;

    files.forEach((file) => {
        const previewUrl = URL.createObjectURL(file);
        productPreviewUrls.push(previewUrl);

        const img = document.createElement('img');
        img.src = previewUrl;
        img.alt = file.name;
        img.className = 'product-photo-preview';
        photosPreview.appendChild(img);
    });
});

function closeBroadcastModal() {
    document.getElementById('broadcastModal').style.display = 'none';
    document.getElementById('broadcastForm').reset();
    clearBroadcastPhoto();
}

function clearBroadcastPhoto() {
    const photoInput = document.getElementById('broadcastPhoto');
    const photoName = document.getElementById('broadcastPhotoName');
    const photoPreview = document.getElementById('broadcastPhotoPreview');

    if (photoInput) {
        photoInput.value = '';
    }

    if (photoName) {
        photoName.textContent = 'Фото не выбрано';
    }

    if (broadcastPreviewUrl) {
        URL.revokeObjectURL(broadcastPreviewUrl);
        broadcastPreviewUrl = null;
    }

    if (photoPreview) {
        photoPreview.removeAttribute('src');
        photoPreview.style.display = 'none';
    }
}

document.getElementById('broadcastPhoto').addEventListener('change', (event) => {
    const photoName = document.getElementById('broadcastPhotoName');
    const photoPreview = document.getElementById('broadcastPhotoPreview');
    const file = event.target.files[0];

    if (broadcastPreviewUrl) {
        URL.revokeObjectURL(broadcastPreviewUrl);
        broadcastPreviewUrl = null;
    }

    photoName.textContent = file ? file.name : 'Фото не выбрано';

    if (!file) {
        photoPreview.removeAttribute('src');
        photoPreview.style.display = 'none';
        return;
    }

    broadcastPreviewUrl = URL.createObjectURL(file);
    photoPreview.src = broadcastPreviewUrl;
    photoPreview.style.display = 'block';
});

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function escapeAttribute(text) {
    return escapeHtml(text).replace(/"/g, '&quot;');
}

// Load products on page load
loadProducts();

// Close modals when clicking outside
window.onclick = (event) => {
    const productModal = document.getElementById('productModal');
    const broadcastModal = document.getElementById('broadcastModal');
    
    if (event.target === productModal) {
        closeModal();
    }
    if (event.target === broadcastModal) {
        closeBroadcastModal();
    }
};
