let tg = window.Telegram.WebApp;
tg.expand();

const API_BASE = '/api';
let products = [];
let currentFilters = {
    search: '',
    minPrice: null,
    maxPrice: null,
    sizes: [],
    categories: [],
    sort: 'default'
};
let currentProduct = null;
let currentPhotoIndex = 0;
let cardSwipeStarted = false;
let photoViewerScale = 1;
let photoViewerOffsetX = 0;
let photoViewerOffsetY = 0;
let photoViewerDrag = null;
let photoViewerPointers = new Map();
let photoViewerPinch = null;
let appConfig = {
    managerUsername: ''
};
let productsPagination = {
    limit: 20,
    offset: 0,
    hasMore: false,
    isLoading: false
};

const CATEGORY_LABELS = {
    tshirts: 'Футболки',
    hoodies: 'Худи',
    pants: 'Штаны',
    jackets: 'Куртки',
    shoes: 'Обувь',
    accessories: 'Аксессуары'
};
const SORT_LABELS = {
    default: 'Популярные',
    price_asc: 'Сначала дешевле',
    price_desc: 'Сначала дороже'
};

async function loadAppConfig() {
    try {
        const response = await fetch(`${API_BASE}/config`);
        if (!response.ok) return;

        const config = await response.json();
        appConfig.managerUsername = String(config.manager_username || '').trim().replace(/^@/, '');
    } catch (error) {
        console.error('Error loading app config:', error);
    }
}

async function loadProducts({ append = false } = {}) {
    const loading = document.getElementById('loading');
    const productsDiv = document.getElementById('products');
    const loadMoreButton = document.getElementById('loadMoreProducts');

    if (productsPagination.isLoading) return;

    productsPagination.isLoading = true;
    loading.style.display = 'block';
    if (loadMoreButton) {
        loadMoreButton.style.display = 'none';
        loadMoreButton.disabled = true;
    }
    if (!append) {
        productsPagination.offset = 0;
        productsDiv.innerHTML = '';
    }

    try {
        let url = `${API_BASE}/products?`;
        const requestLimit = productsPagination.limit + 1;
        const params = [
            `limit=${requestLimit}`,
            `offset=${productsPagination.offset}`
        ];
        
        if (currentFilters.search) {
            params.push(`search=${encodeURIComponent(currentFilters.search)}`);
        }
        
        if (currentFilters.minPrice !== null && currentFilters.minPrice > 0) {
            params.push(`min_price=${currentFilters.minPrice}`);
        }
        
        if (currentFilters.maxPrice !== null && currentFilters.maxPrice > 0) {
            params.push(`max_price=${currentFilters.maxPrice}`);
        }

        currentFilters.sizes.forEach((size) => {
            params.push(`size=${encodeURIComponent(size)}`);
        });

        currentFilters.categories.forEach((category) => {
            params.push(`category=${encodeURIComponent(category)}`);
        });

        if (currentFilters.sort && currentFilters.sort !== 'default') {
            params.push(`sort=${encodeURIComponent(currentFilters.sort)}`);
        }
        
        url += params.join('&');
        
        const response = await fetch(url);
        const data = await response.json();
        const responseProducts = data.products || [];
        const loadedProducts = responseProducts.slice(0, productsPagination.limit);
        products = append ? [...products, ...loadedProducts] : loadedProducts;
        productsPagination.offset += loadedProducts.length;
        productsPagination.hasMore = responseProducts.length > productsPagination.limit;

        renderProducts(products);
        renderProductFromHash();
        
        // Обновляем информацию о фильтре
        updateFilterInfo();
    } catch (error) {
        console.error('Error loading products:', error);
        if (!append) {
            productsDiv.innerHTML = '<div class="error">Ошибка загрузки товаров</div>';
        }
    } finally {
        productsPagination.isLoading = false;
        loading.style.display = 'none';
        updateLoadMoreButton();
    }
}

function loadMoreProducts() {
    loadProducts({ append: true });
}

function updateLoadMoreButton() {
    const loadMoreButton = document.getElementById('loadMoreProducts');
    if (!loadMoreButton) return;

    loadMoreButton.style.display = productsPagination.hasMore ? 'inline-flex' : 'none';
    loadMoreButton.disabled = productsPagination.isLoading;
}

function renderProducts(productsList) {
    const productsDiv = document.getElementById('products');

    if (productsList.length === 0) {
        productsDiv.innerHTML = '<div class="empty">Товары не найдены</div>';
        return;
    }

    productsDiv.innerHTML = productsList.map(product => `
        <div class="product-card" role="button" tabindex="0" onclick="openProductDetail(${product.id})" onkeydown="handleProductCardKey(event, ${product.id})">
            ${renderCatalogPhotos(product)}
            <div class="product-info">
                <div class="product-brand">${escapeHtml(getProductBrand(product))}</div>
                <div class="product-title">${escapeHtml(product.name)}</div>
                ${renderProductSizes(product)}
                ${renderPrice(product)}
            </div>
        </div>
    `).join('');
}

function getProductBrand(product) {
    if (product.brand) {
        return product.brand;
    }

    return (product.name || '').trim().split(/\s+/)[0] || 'Товар';
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
            ${sizes.map((size) => `
                <span class="product-size-pill ${currentFilters.sizes.includes(size) ? 'active' : ''}">${escapeHtml(size)}</span>
            `).join('')}
        </div>
    `;
}

function renderPrice(product) {
    const price = Number(product.price || 0);
    const oldPrice = Number(product.old_price || 0);
    const hasOldPrice = oldPrice > price;

    return `
        <div class="product-price-row">
            <span class="product-price">${price.toLocaleString()}₽</span>
            ${hasOldPrice ? `<span class="product-old-price">${oldPrice.toLocaleString()}₽</span>` : ''}
        </div>
    `;
}

function renderCatalogPhotos(product) {
    const photos = product.photos || [];

    if (!photos.length) {
        return '<div class="product-image product-image-empty">Нет фото</div>';
    }

    if (photos.length === 1) {
        return `<img src="${escapeAttribute(photos[0])}" alt="${escapeAttribute(product.name)}" class="product-image">`;
    }

    return `
        <div class="catalog-photo-carousel">
            <div class="catalog-photo-strip" onscroll="updateCatalogPhotoState(event)" onpointerdown="startCatalogPhotoSwipe(event)" onpointermove="moveCatalogPhotoSwipe(event)" onpointerup="endCatalogPhotoSwipe(event)" onpointercancel="cancelCatalogPhotoSwipe()">
                ${photos.map((photo, index) => `
                    <img src="${escapeAttribute(photo)}" alt="${escapeAttribute(product.name)} ${index + 1}" class="catalog-photo-slide">
                `).join('')}
            </div>
            <div class="catalog-photo-counter">1 / ${photos.length}</div>
            <div class="catalog-photo-dots">
                ${photos.map((_, index) => `<span class="${index === 0 ? 'active' : ''}"></span>`).join('')}
            </div>
        </div>
    `;
}

function updateCatalogPhotoState(event) {
    const strip = event.currentTarget;
    const carousel = strip.closest('.catalog-photo-carousel');
    if (!carousel || !strip.clientWidth) return;

    const slidesCount = strip.children.length;
    const index = Math.min(
        slidesCount - 1,
        Math.max(0, Math.round(strip.scrollLeft / strip.clientWidth))
    );
    const counter = carousel.querySelector('.catalog-photo-counter');
    const dots = carousel.querySelectorAll('.catalog-photo-dots span');

    if (counter) {
        counter.textContent = `${index + 1} / ${slidesCount}`;
    }

    dots.forEach((dot, dotIndex) => {
        dot.classList.toggle('active', dotIndex === index);
    });
}

function startCatalogPhotoSwipe(event) {
    const strip = event.currentTarget;
    if (!strip || !strip.clientWidth) return;

    cardSwipeStarted = {
        x: event.clientX,
        y: event.clientY,
        index: Math.round(strip.scrollLeft / strip.clientWidth),
        width: strip.clientWidth
    };
}

function endCatalogPhotoSwipe(event) {
    if (!cardSwipeStarted) return;

    const strip = event.currentTarget;
    const deltaX = event.clientX - cardSwipeStarted.x;
    const deltaY = event.clientY - cardSwipeStarted.y;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);
    const startIndex = cardSwipeStarted.index;
    const slideWidth = cardSwipeStarted.width;
    cardSwipeStarted = false;

    if (strip && absDeltaX > 24 && absDeltaX > absDeltaY) {
        const maxIndex = Math.max(0, strip.children.length - 1);
        const direction = deltaX < 0 ? 1 : -1;
        const nextIndex = Math.min(maxIndex, Math.max(0, startIndex + direction));

        event.preventDefault();
        event.stopPropagation();
        strip.scrollTo({
            left: nextIndex * slideWidth,
            behavior: 'smooth'
        });
    }
}

function moveCatalogPhotoSwipe(event) {
    if (!cardSwipeStarted) return;

    const deltaX = Math.abs(event.clientX - cardSwipeStarted.x);
    const deltaY = Math.abs(event.clientY - cardSwipeStarted.y);

    if (deltaX > 8 && deltaX > deltaY) {
        event.preventDefault();
    }
}

function cancelCatalogPhotoSwipe() {
    cardSwipeStarted = false;
}

function handleProductCardKey(event, productId) {
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openProductDetail(productId);
    }
}

function openProductDetail(productId) {
    const nextHash = `#product-${productId}`;
    if (window.location.hash === nextHash) {
        showProductDetail(productId);
        return;
    }

    window.location.hash = nextHash;
}

async function showProductDetail(productId) {
    const detailView = document.getElementById('productDetailView');
    const product = products.find(p => p.id === productId) || await fetchProduct(productId);

    if (!product) {
        detailView.innerHTML = '<div class="error">Товар не найден</div>';
        showDetailView();
        return;
    }

    currentProduct = product;
    currentPhotoIndex = 0;
    renderProductDetail();
    showDetailView();
}

async function fetchProduct(productId) {
    try {
        const response = await fetch(`${API_BASE}/products/${productId}`);
        if (!response.ok) return null;
        return await response.json();
    } catch (error) {
        console.error('Error loading product:', error);
        return null;
    }
}

function renderProductDetail() {
    const detailView = document.getElementById('productDetailView');
    const photos = currentProduct.photos && currentProduct.photos.length ? currentProduct.photos : [];
    const hasMultiplePhotos = photos.length > 1;

    detailView.innerHTML = `
        <article class="product-detail">
            <section class="product-carousel">
                ${photos.length ?
                    `<div class="carousel-track" style="transform: translateX(-${currentPhotoIndex * 100}%);">
                        ${photos.map((photo, index) => `
                            <div class="carousel-slide">
                                <img src="${escapeAttribute(photo)}" alt="${escapeAttribute(currentProduct.name)} ${index + 1}" class="detail-photo" onclick="openPhotoViewer(${index})">
                            </div>
                        `).join('')}
                    </div>` :
                    '<div class="detail-photo detail-photo-empty">Нет фото</div>'
                }
                ${hasMultiplePhotos ? `
                    <button class="carousel-btn carousel-btn-prev" onclick="changeProductPhoto(-1)" type="button" aria-label="Предыдущее фото">‹</button>
                    <button class="carousel-btn carousel-btn-next" onclick="changeProductPhoto(1)" type="button" aria-label="Следующее фото">›</button>
                    <div class="carousel-counter">${currentPhotoIndex + 1} / ${photos.length}</div>
                ` : ''}
            </section>

            ${hasMultiplePhotos ? `
                <div class="carousel-dots">
                    ${photos.map((_, index) => `
                        <button class="carousel-dot ${index === currentPhotoIndex ? 'active' : ''}" onclick="setProductPhoto(${index})" type="button" aria-label="Фото ${index + 1}"></button>
                    `).join('')}
                </div>
            ` : ''}

            <section class="product-detail-info">
                <h2>${escapeHtml(currentProduct.name)}</h2>
                <div class="product-detail-price-row">
                    <span class="product-detail-price">${Number(currentProduct.price || 0).toLocaleString()} ₽</span>
                    ${Number(currentProduct.old_price || 0) > Number(currentProduct.price || 0) ? `<span class="product-detail-old-price">${Number(currentProduct.old_price).toLocaleString()} ₽</span>` : ''}
                </div>
                ${renderProductSizes(currentProduct)}
                <section class="product-description-card">
                    <h3>Описание товара</h3>
                    <p>${escapeHtml(currentProduct.description || 'Описание пока не добавлено')}</p>
                </section>
            </section>

            <div class="product-buy-bar">
                <button class="product-buy-btn" onclick="buyCurrentProduct()" type="button">Купить</button>
            </div>
        </article>
    `;
}

function changeProductPhoto(direction) {
    const photosCount = currentProduct && currentProduct.photos ? currentProduct.photos.length : 0;
    if (photosCount < 2) return;

    currentPhotoIndex = (currentPhotoIndex + direction + photosCount) % photosCount;
    renderProductDetail();
}

function setProductPhoto(index) {
    if (!currentProduct || !currentProduct.photos || !currentProduct.photos[index]) return;
    currentPhotoIndex = index;
    renderProductDetail();
}

function openPhotoViewer(index) {
    if (!currentProduct || !currentProduct.photos || !currentProduct.photos[index]) return;

    currentPhotoIndex = index;
    photoViewerScale = 1;
    photoViewerOffsetX = 0;
    photoViewerOffsetY = 0;
    photoViewerDrag = null;
    photoViewerPointers.clear();
    photoViewerPinch = null;

    const photo = currentProduct.photos[index];
    const existingViewer = document.getElementById('photoViewer');
    if (existingViewer) {
        existingViewer.remove();
    }

    document.body.insertAdjacentHTML('beforeend', `
        <div id="photoViewer" class="photo-viewer" onclick="closePhotoViewer()">
            <div class="photo-viewer-toolbar" onclick="event.stopPropagation()">
                <button class="photo-viewer-btn photo-viewer-close" onclick="closePhotoViewer()" type="button" aria-label="Закрыть">×</button>
            </div>
            <div class="photo-viewer-stage" onclick="event.stopPropagation()" onwheel="wheelPhotoViewer(event)">
                <img
                    id="photoViewerImage"
                    src="${escapeAttribute(photo)}"
                    alt="${escapeAttribute(currentProduct.name)} ${index + 1}"
                    class="photo-viewer-image"
                    onpointerdown="startPhotoViewerPointer(event)"
                    onpointermove="movePhotoViewerPointer(event)"
                    onpointerup="endPhotoViewerPointer(event)"
                    onpointercancel="endPhotoViewerPointer(event)"
                    ondblclick="togglePhotoViewerZoom(event)"
                >
            </div>
        </div>
    `);

    document.body.classList.add('photo-viewer-open');
    applyPhotoViewerZoom();
}

function closePhotoViewer() {
    const viewer = document.getElementById('photoViewer');
    if (viewer) {
        viewer.remove();
    }

    document.body.classList.remove('photo-viewer-open');
    photoViewerScale = 1;
    photoViewerOffsetX = 0;
    photoViewerOffsetY = 0;
    photoViewerDrag = null;
    photoViewerPointers.clear();
    photoViewerPinch = null;
}

function zoomPhotoViewer(delta) {
    photoViewerScale = clampPhotoViewerScale(photoViewerScale + delta);
    applyPhotoViewerZoom();
}

function resetPhotoViewerZoom() {
    photoViewerScale = 1;
    photoViewerOffsetX = 0;
    photoViewerOffsetY = 0;
    applyPhotoViewerZoom();
}

function wheelPhotoViewer(event) {
    event.preventDefault();
    zoomPhotoViewer(event.deltaY < 0 ? 0.2 : -0.2);
}

function togglePhotoViewerZoom(event) {
    event.preventDefault();
    if (photoViewerScale > 1) {
        photoViewerScale = 1;
        photoViewerOffsetX = 0;
        photoViewerOffsetY = 0;
    } else {
        photoViewerScale = 2;
    }
    applyPhotoViewerZoom();
}

function startPhotoViewerPointer(event) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    photoViewerPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (photoViewerPointers.size === 1 && photoViewerScale > 1) {
        photoViewerDrag = {
            x: event.clientX,
            y: event.clientY,
            offsetX: photoViewerOffsetX,
            offsetY: photoViewerOffsetY
        };
    } else if (photoViewerPointers.size === 2) {
        const points = Array.from(photoViewerPointers.values());
        photoViewerDrag = null;
        photoViewerPinch = {
            distance: getPhotoViewerDistance(points[0], points[1]),
            scale: photoViewerScale
        };
    }
}

function movePhotoViewerPointer(event) {
    if (!photoViewerPointers.has(event.pointerId)) return;

    event.preventDefault();
    photoViewerPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (photoViewerPointers.size === 1 && photoViewerDrag && photoViewerScale > 1) {
        photoViewerOffsetX = photoViewerDrag.offsetX + event.clientX - photoViewerDrag.x;
        photoViewerOffsetY = photoViewerDrag.offsetY + event.clientY - photoViewerDrag.y;
        applyPhotoViewerZoom();
    } else if (photoViewerPointers.size === 2 && photoViewerPinch) {
        const points = Array.from(photoViewerPointers.values());
        const distance = getPhotoViewerDistance(points[0], points[1]);
        photoViewerScale = clampPhotoViewerScale(photoViewerPinch.scale * (distance / photoViewerPinch.distance));
        applyPhotoViewerZoom();
    }
}

function endPhotoViewerPointer(event) {
    photoViewerPointers.delete(event.pointerId);
    photoViewerDrag = null;
    photoViewerPinch = null;
}

function getPhotoViewerDistance(firstPoint, secondPoint) {
    return Math.hypot(firstPoint.x - secondPoint.x, firstPoint.y - secondPoint.y);
}

function clampPhotoViewerScale(scale) {
    return Math.min(4, Math.max(1, scale));
}

function applyPhotoViewerZoom() {
    const image = document.getElementById('photoViewerImage');
    if (!image) return;

    image.style.transform = `translate(${photoViewerOffsetX}px, ${photoViewerOffsetY}px) scale(${photoViewerScale})`;
}

function buyCurrentProduct() {
    if (currentProduct) {
        confirmContactManager(currentProduct.name);
    }
}

function confirmContactManager(productName) {
    tg.showPopup({
        title: 'Переход в Telegram',
        message: 'Вы хотите перейти в диалог с менеджером?',
        buttons: [
            { id: 'confirm', type: 'default', text: 'Перейти' },
            { id: 'cancel', type: 'cancel', text: 'Отмена' }
        ]
    }, (buttonId) => {
        if (buttonId === 'confirm') {
            contactManager(productName);
        }
    });
}

function showDetailView() {
    document.querySelector('header').style.display = 'none';
    document.getElementById('catalogView').style.display = 'none';
    document.getElementById('productDetailView').style.display = 'block';

    if (tg.BackButton) {
        tg.BackButton.offClick(closeProductDetail);
        tg.BackButton.show();
        tg.BackButton.onClick(closeProductDetail);
    }
}

function closeProductDetail() {
    closePhotoViewer();
    window.location.hash = '';
    currentProduct = null;
    document.querySelector('header').style.display = '';
    document.getElementById('catalogView').style.display = '';
    document.getElementById('productDetailView').style.display = 'none';

    if (tg.BackButton) {
        tg.BackButton.hide();
        tg.BackButton.offClick(closeProductDetail);
    }
}

function renderProductFromHash() {
    const match = window.location.hash.match(/^#product-(\d+)$/);
    if (match) {
        showProductDetail(Number(match[1]));
    }
}

window.addEventListener('hashchange', () => {
    const match = window.location.hash.match(/^#product-(\d+)$/);
    if (match) {
        showProductDetail(Number(match[1]));
    } else if (currentProduct) {
        closeProductDetail();
    }
});

function escapeAttribute(text) {
    return escapeHtml(text).replace(/"/g, '&quot;');
}

function escapeInlineString(text) {
    return String(text)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/</g, '\\x3C');
}

let touchStartX = null;
document.addEventListener('touchstart', (event) => {
    if (!currentProduct || document.body.classList.contains('photo-viewer-open') || !event.touches.length) return;
    touchStartX = event.touches[0].clientX;
}, { passive: true });

document.addEventListener('touchend', (event) => {
    if (!currentProduct || document.body.classList.contains('photo-viewer-open') || touchStartX === null || !event.changedTouches.length) return;
    const deltaX = event.changedTouches[0].clientX - touchStartX;
    touchStartX = null;

    if (Math.abs(deltaX) > 50) {
        changeProductPhoto(deltaX > 0 ? -1 : 1);
    }
}, { passive: true });

function contactManager(productName) {
    const message = `Здравствуйте, я хочу купить "${productName}"`;
    const managerUsername = appConfig.managerUsername;
    
    if (managerUsername) {
        const chatUrl = `https://t.me/${managerUsername}?text=${encodeURIComponent(message)}`;
        tg.openTelegramLink(chatUrl);
    } else {
        tg.showAlert('Пожалуйста, укажите username менеджера в настройках приложения');
    }
}

// Фильтры
function toggleFilter() {
    const filterDiv = document.getElementById('priceFilter');
    const toggleBtn = document.querySelector('.filter-toggle');
    
    if (!filterDiv || !toggleBtn) return;

    if (filterDiv.style.display === 'none' || filterDiv.style.display === '') {
        filterDiv.style.display = 'block';
        document.body.classList.add('filter-open');
        updateFilterControls();
    } else {
        closePriceFilter();
    }
}

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        closePriceFilter();
    }
});

document.addEventListener('click', (event) => {
    if (!document.body.classList.contains('filter-open')) return;

    const filterDiv = document.getElementById('priceFilter');
    const toggleBtn = document.querySelector('.filter-toggle');

    if (!filterDiv || !toggleBtn) return;
    if (filterDiv.contains(event.target) || toggleBtn.contains(event.target)) return;

    closePriceFilter();
});

document.addEventListener('click', (event) => {
    const sortDropdown = document.getElementById('sortDropdown');
    if (!sortDropdown || sortDropdown.contains(event.target)) return;

    closeSortMenu();
});

function closePriceFilter() {
    const filterDiv = document.getElementById('priceFilter');
    const toggleBtn = document.querySelector('.filter-toggle');

    if (!filterDiv || !toggleBtn) return;

    filterDiv.style.display = 'none';
    document.body.classList.remove('filter-open');
    updateFilterControls();
}

function applyPriceFilter() {
    const minPrice = document.getElementById('minPrice').value;
    const maxPrice = document.getElementById('maxPrice').value;
    
    currentFilters.minPrice = minPrice ? parseFloat(minPrice) : null;
    currentFilters.maxPrice = maxPrice ? parseFloat(maxPrice) : null;
    
    closePriceFilter();
    loadProducts();
}

function setSizeFilter(size) {
    currentFilters.sizes = toggleArrayValue(currentFilters.sizes, size);
    updateFilterControls();
    loadProducts();
}

function toggleCategoryFilter(category) {
    currentFilters.categories = toggleArrayValue(currentFilters.categories, category);
    updateFilterControls();
    loadProducts();
}

function setCategorySection(category) {
    currentFilters.categories = category ? [category] : [];
    updateFilterControls();
    loadProducts();
}

function toggleArrayValue(values, value) {
    return values.includes(value)
        ? values.filter((item) => item !== value)
        : [...values, value];
}

function setSort(sort) {
    currentFilters.sort = sort || 'default';
    closeSortMenu();
    updateFilterControls();
    loadProducts();
}

function toggleSortMenu() {
    const menu = document.getElementById('sortMenu');
    const toggle = document.querySelector('.sort-toggle');
    if (!menu || !toggle) return;

    const isOpen = menu.style.display !== 'none';
    menu.style.display = isOpen ? 'none' : 'block';
    toggle.setAttribute('aria-expanded', String(!isOpen));
    toggle.classList.toggle('active', !isOpen);
}

function closeSortMenu() {
    const menu = document.getElementById('sortMenu');
    const toggle = document.querySelector('.sort-toggle');
    if (!menu || !toggle) return;

    menu.style.display = 'none';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.classList.remove('active');
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
    closePriceFilter();
    loadProducts();
}

function clearAllFilters() {
    document.getElementById('minPrice').value = '';
    document.getElementById('maxPrice').value = '';
    currentFilters.minPrice = null;
    currentFilters.maxPrice = null;
    currentFilters.sizes = [];
    currentFilters.categories = [];
    currentFilters.sort = 'default';
    updateFilterControls();
    loadProducts();
}

function updateFilterInfo() {
    updateFilterControls();
}

function updateFilterControls() {
    const filterCount = document.getElementById('filterCount');
    const filterChips = document.getElementById('filterChips');
    const sortLabel = document.getElementById('sortLabel');
    const toggleBtn = document.querySelector('.filter-toggle');
    const clearAllButton = document.getElementById('clearAllFilters');

    const chips = [];
    currentFilters.categories.forEach((category) => {
        chips.push({ key: 'category', value: category, label: CATEGORY_LABELS[category] || category });
    });
    currentFilters.sizes.forEach((size) => {
        chips.push({ key: 'size', value: size, label: size });
    });
    if (currentFilters.minPrice && currentFilters.maxPrice) {
        chips.push({ key: 'price', label: `${currentFilters.minPrice}-${currentFilters.maxPrice} ₽` });
    } else if (currentFilters.minPrice) {
        chips.push({ key: 'price', label: `от ${currentFilters.minPrice} ₽` });
    } else if (currentFilters.maxPrice) {
        chips.push({ key: 'price', label: `до ${currentFilters.maxPrice} ₽` });
    }

    if (filterCount) {
        filterCount.textContent = chips.length;
        filterCount.style.display = chips.length ? 'inline-flex' : 'none';
    }

    if (filterChips) {
        filterChips.innerHTML = chips.map((chip) => `
            <button class="filter-chip" onclick="removeFilter('${escapeInlineString(chip.key)}', '${escapeInlineString(chip.value || '')}')" type="button">
                ${escapeHtml(chip.label)}
                <span aria-hidden="true">×</span>
            </button>
        `).join('');
    }

    if (sortLabel) {
        sortLabel.textContent = SORT_LABELS[currentFilters.sort] || SORT_LABELS.default;
    }

    document.querySelectorAll('.sort-option').forEach((button) => {
        button.classList.toggle('active', button.dataset.sort === currentFilters.sort);
        button.setAttribute('aria-selected', String(button.dataset.sort === currentFilters.sort));
    });

    if (toggleBtn) {
        toggleBtn.classList.toggle('active', document.body.classList.contains('filter-open'));
    }

    if (clearAllButton) {
        clearAllButton.style.display = chips.length ? 'inline-flex' : 'none';
    }

    document.querySelectorAll('.size-option').forEach((button) => {
        button.classList.toggle('active', currentFilters.sizes.includes(button.textContent.trim()));
    });

    document.querySelectorAll('.category-filter-option').forEach((button) => {
        button.classList.toggle('active', currentFilters.categories.includes(button.dataset.category));
    });

    document.querySelectorAll('.category-tab').forEach((button) => {
        const category = button.dataset.category;
        const isActive = category
            ? currentFilters.categories.length === 1 && currentFilters.categories[0] === category
            : currentFilters.categories.length === 0;
        button.classList.toggle('active', isActive);
    });
}

function removeFilter(key, value = '') {
    if (key === 'size') {
        currentFilters.sizes = value
            ? currentFilters.sizes.filter((size) => size !== value)
            : [];
    }
    if (key === 'category') {
        currentFilters.categories = value
            ? currentFilters.categories.filter((category) => category !== value)
            : [];
    }
    if (key === 'price') {
        currentFilters.minPrice = null;
        currentFilters.maxPrice = null;
        document.getElementById('minPrice').value = '';
        document.getElementById('maxPrice').value = '';
    }

    updateFilterControls();
    loadProducts();
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

async function initApp() {
    await loadAppConfig();
    await loadProducts();
    updateFilterControls();
}

initApp();
