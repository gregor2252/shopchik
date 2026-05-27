const API_BASE = '/api/admin';
let userId = null;

// Get user ID from URL or prompt
function getUserId() {
    if (userId) return userId;
    
    const urlParams = new URLSearchParams(window.location.search);
    userId = urlParams.get('user_id');
    
    if (!userId) {
        userId = prompt('Введите ваш Telegram ID для доступа к админ-панели:');
    }
    
    return userId;
}

async function loadProducts() {
    const productsDiv = document.getElementById('products');
    productsDiv.innerHTML = '<div class="loading">Загрузка...</div>';
    
    try {
        const response = await fetch(`${API_BASE}/products?user_id=${getUserId()}`);
        const products = await response.json();
        
        renderAdminProducts(products);
    } catch (error) {
        console.error('Error loading products:', error);
        productsDiv.innerHTML = '<div class="error">Ошибка загрузки товаров</div>';
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
                <div class="product-title">${escapeHtml(product.name)}</div>
                <div class="product-price">${product.price} ₽</div>
                <button onclick="editProduct(${product.id})" class="btn btn-secondary" style="margin-top: 10px;">Редактировать</button>
            </div>
            <button onclick="deleteProduct(${product.id})" class="delete-btn">×</button>
        </div>
    `).join('');
}

function showProductForm() {
    document.getElementById('modalTitle').innerText = 'Добавить товар';
    document.getElementById('productForm').reset();
    document.getElementById('productId').value = '';
    document.getElementById('productModal').style.display = 'block';
}

function editProduct(productId) {
    loadProductData(productId);
}

async function loadProductData(productId) {
    try {
        const response = await fetch(`${API_BASE}/products/${productId}?user_id=${getUserId()}`);
        const product = await response.json();
        
        document.getElementById('modalTitle').innerText = 'Редактировать товар';
        document.getElementById('productId').value = product.id;
        document.getElementById('productName').value = product.name;
        document.getElementById('productDescription').value = product.description;
        document.getElementById('productPrice').value = product.price;
        document.getElementById('productModal').style.display = 'block';
    } catch (error) {
        console.error('Error loading product:', error);
        alert('Ошибка загрузки товара');
    }
}

async function deleteProduct(productId) {
    if (!confirm('Вы уверены, что хотите удалить этот товар?')) return;
    
    try {
        const response = await fetch(`${API_BASE}/products/${productId}?user_id=${getUserId()}`, {
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
    formData.append('user_id', getUserId());
    formData.append('name', document.getElementById('productName').value);
    formData.append('description', document.getElementById('productDescription').value);
    formData.append('price', document.getElementById('productPrice').value);
    
    const photos = document.getElementById('productPhotos').files;
    for (let i = 0; i < photos.length; i++) {
        formData.append('photos', photos[i]);
    }
    
    try {
        let response;
        if (productId) {
            response = await fetch(`${API_BASE}/products/${productId}`, {
                method: 'PUT',
                body: formData
            });
        } else {
            response = await fetch(`${API_BASE}/products`, {
                method: 'POST',
                body: formData
            });
        }
        
        if (response.ok) {
            alert(productId ? 'Товар обновлен' : 'Товар создан');
            closeModal();
            loadProducts();
        } else {
            alert('Ошибка при сохранении');
        }
    } catch (error) {
        console.error('Error saving product:', error);
        alert('Ошибка при сохранении');
    }
});

function showBroadcastForm() {
    document.getElementById('broadcastModal').style.display = 'block';
}

document.getElementById('broadcastForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData();
    formData.append('user_id', getUserId());
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
        const response = await fetch(`${API_BASE}/broadcast`, {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            const data = await response.json();
            alert(data.message);
            closeBroadcastModal();
        } else {
            alert('Ошибка при создании рассылки');
        }
    } catch (error) {
        console.error('Error creating broadcast:', error);
        alert('Ошибка при создании рассылки');
    }
});

function closeModal() {
    document.getElementById('productModal').style.display = 'none';
}

function closeBroadcastModal() {
    document.getElementById('broadcastModal').style.display = 'none';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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