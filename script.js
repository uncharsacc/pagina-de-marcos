// script.js

class CatalogoLentes {
    constructor() {
        this.brandsData = null;
        this.currentBrand = null;
        this.imagesCache = new Map();
        
        this.init();
    }

    async init() {
        this.loadElements();
        this.attachEvents();
        await this.loadBrands();
        this.renderBrands();
    }

    loadElements() {
        this.brandsGrid = document.getElementById('brandsGrid');
        this.imagesGrid = document.getElementById('imagesGrid');
        this.searchInput = document.getElementById('searchInput');
        this.breadcrumb = document.getElementById('breadcrumb');
        this.modal = document.getElementById('imageModal');
        this.modalImage = document.getElementById('modalImage');
        this.modalCaption = document.getElementById('modalCaption');
    }

    attachEvents() {
        // Búsqueda
        this.searchInput.addEventListener('input', () => this.filterBrands());
        
        // Modal
        document.querySelector('.close-modal').addEventListener('click', () => {
            this.modal.style.display = 'none';
        });
        
        window.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.modal.style.display = 'none';
            }
        });
        
        // Tecla ESC para cerrar modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.style.display === 'block') {
                this.modal.style.display = 'none';
            }
        });
        
        // Navegación con breadcrumb
        this.breadcrumb.addEventListener('click', (e) => {
            if (e.target.classList.contains('breadcrumb-item') && 
                !e.target.classList.contains('active')) {
                this.navigateTo(e.target.dataset.path);
            }
        });
    }

    async loadBrands() {
        try {
            const response = await fetch('data.json');
            this.brandsData = await response.json();
        } catch (error) {
            console.error('Error loading brands:', error);
            this.showError('Error al cargar las marcas');
        }
    }

    renderBrands(filterText = '') {
        const brands = Object.keys(this.brandsData);
        const filteredBrands = filterText ? 
            brands.filter(b => b.toLowerCase().includes(filterText.toLowerCase())) : 
            brands;

        this.brandsGrid.innerHTML = '';
        this.imagesGrid.style.display = 'none';
        this.brandsGrid.style.display = 'grid';
        
        if (filteredBrands.length === 0) {
            this.showNoResults();
            return;
        }

        filteredBrands.forEach(brand => {
            const card = this.createBrandCard(brand);
            this.brandsGrid.appendChild(card);
        });

        this.updateBreadcrumb(['inicio']);
    }

    createBrandCard(brand) {
        const card = document.createElement('div');
        card.className = 'brand-card';
        card.innerHTML = `
            <div class="brand-icon">👓</div>
            <div class="brand-name">${brand}</div>
            <div class="brand-count">${this.brandsData[brand].length || 0} imágenes</div>
        `;
        
        card.addEventListener('click', () => this.openBrand(brand));
        
        return card;
    }

    async openBrand(brand) {
        this.currentBrand = brand;
        
        // Mostrar loading
        this.imagesGrid.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
        this.imagesGrid.style.display = 'grid';
        this.brandsGrid.style.display = 'none';
        
        // Actualizar breadcrumb
        this.updateBreadcrumb(['inicio', brand]);
        
        // Cargar imágenes de la carpeta
        await this.loadBrandImages(brand);
    }

    async loadBrandImages(brand) {
        try {
            // Simular carga de imágenes (aquí iría la lógica real para cargar las imágenes)
            // Por ahora, generamos imágenes de ejemplo
            const images = await this.getImagesFromFolder(brand);
            
            if (images.length === 0) {
                this.imagesGrid.innerHTML = this.createNoImagesMessage(brand);
                return;
            }
            
            this.renderImages(images, brand);
            
        } catch (error) {
            console.error('Error loading images:', error);
            this.imagesGrid.innerHTML = this.createErrorMessage();
        }
    }

    async getImagesFromFolder(brand) {
        // Aquí iría la lógica real para leer las imágenes de la carpeta
        // Por ahora, retornamos imágenes de ejemplo
        return new Promise((resolve) => {
            setTimeout(() => {
                // Simular algunas imágenes
                const mockImages = [
                    { name: 'modelo1.jpg', url: 'https://via.placeholder.com/300x300?text=Modelo+1' },
                    { name: 'modelo2.jpg', url: 'https://via.placeholder.com/300x300?text=Modelo+2' },
                    { name: 'modelo3.jpg', url: 'https://via.placeholder.com/300x300?text=Modelo+3' }
                ];
                resolve(mockImages);
            }, 1000);
        });
    }

    renderImages(images, brand) {
        this.imagesGrid.innerHTML = '';
        
        images.forEach(image => {
            const card = this.createImageCard(image, brand);
            this.imagesGrid.appendChild(card);
        });
    }

    createImageCard(image, brand) {
        const card = document.createElement('div');
        card.className = 'image-card';
        
        // Si la imagen no tiene URL válida, mostrar placeholder
        if (!image.url || image.url.includes('placeholder')) {
            card.innerHTML = `
                <div class="image-placeholder">
                    <div>🖼️</div>
                    <span>${image.name}</span>
                </div>
            `;
        } else {
            card.innerHTML = `
                <img src="${image.url}" alt="${image.name}" loading="lazy">
                <div class="image-caption">${image.name}</div>
            `;
        }
        
        card.addEventListener('click', () => this.openImage(image, brand));
        
        return card;
    }

    createNoImagesMessage(brand) {
        return `
            <div class="no-images">
                <div class="no-images-icon">📸</div>
                <p>No hay imágenes disponibles para ${brand}</p>
                <p>Agrega imágenes en la carpeta: <strong>imagenes/${brand}/</strong></p>
            </div>
        `;
    }

    createErrorMessage() {
        return `
            <div class="no-images">
                <div class="no-images-icon">❌</div>
                <p>Error al cargar las imágenes</p>
                <p>Por favor, intenta de nuevo más tarde</p>
            </div>
        `;
    }

    showNoResults() {
        this.brandsGrid.innerHTML = `
            <div class="no-images" style="grid-column: 1/-1;">
                <div class="no-images-icon">🔍</div>
                <p>No se encontraron marcas</p>
                <p>Intenta con otros términos de búsqueda</p>
            </div>
        `;
    }

    openImage(image, brand) {
        this.modalImage.src = image.url || 'https://via.placeholder.com/800x800?text=Sin+imagen';
        this.modalCaption.textContent = `${brand} - ${image.name}`;
        this.modal.style.display = 'block';
    }

    filterBrands() {
        const filterText = this.searchInput.value;
        this.renderBrands(filterText);
    }

    updateBreadcrumb(paths) {
        const isRoot = paths.length === 1 && paths[0] === 'inicio';
        
        let html = '';
        paths.forEach((path, index) => {
            const isLast = index === paths.length - 1;
            const displayName = path === 'inicio' ? 'Inicio' : path;
            
            html += `
                <span class="breadcrumb-item ${isLast ? 'active' : ''}" 
                      data-path="${path}" 
                      ${isLast ? '' : 'style="cursor:pointer;"'}>
                    ${displayName}
                </span>
            `;
        });
        
        this.breadcrumb.innerHTML = html;
        
        // Si no estamos en inicio, agregar botón de volver
        if (!isRoot) {
            const backButton = document.createElement('button');
            backButton.className = 'back-button';
            backButton.innerHTML = '← Volver a marcas';
            backButton.onclick = () => this.goBack();
            
            // Insertar después del breadcrumb
            this.breadcrumb.insertAdjacentElement('afterend', backButton);
            
            // Remover botón anterior si existe
            const oldButton = document.querySelector('.back-button:not([data-new])');
            if (oldButton) oldButton.remove();
            
            backButton.setAttribute('data-new', 'true');
        } else {
            const oldButton = document.querySelector('.back-button');
            if (oldButton) oldButton.remove();
        }
    }

    navigateTo(path) {
        if (path === 'inicio') {
            this.goBack();
        } else {
            this.openBrand(path);
        }
    }

    goBack() {
        this.imagesGrid.style.display = 'none';
        this.brandsGrid.style.display = 'grid';
        this.currentBrand = null;
        this.searchInput.value = '';
        this.renderBrands();
    }

    showError(message) {
        this.brandsGrid.innerHTML = `
            <div class="no-images" style="grid-column: 1/-1;">
                <div class="no-images-icon">⚠️</div>
                <p>${message}</p>
            </div>
        `;
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    new CatalogoLentes();
});