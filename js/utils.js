/* ============================================================
   SACC & VISION - UTILIDADES Y DATOS COMPARTIDOS (js/utils.js)
   ============================================================ */

/**
 * Categorías oficiales y precios de marcos
 */
const categorias = {
    "ECONOMICOS": [
        { nombre: "GATTIZONI", precio: 10000 },
        { nombre: "GEORGE", precio: 10000 },
        { nombre: "JORGIO", precio: 10000 },
        { nombre: "LE GIRO", precio: 10000 }
    ],
    "MEDIA": [
        { nombre: "ANGELO FALCONI", precio: 24000 },
        { nombre: "JEAN DE PARIS", precio: 24000 },
        { nombre: "FOOSE", precio: 38000 },
        { nombre: "VESPA DEPORTIVO", precio: 28600 },
        { nombre: "VESPA", precio: 30500, precioMax: 38000 },
        { nombre: "LUXOR", precio: 35700 }
    ],
    "PREMIUM": [
        { nombre: "LINEA VIGO", precio: 42900 },
        { nombre: "GAME DAY", precio: 48200 },
        { nombre: "MAXCOME", precio: 46400 },
        { nombre: "SILMO", precio: 44000 },
        { nombre: "SILMO ÓPTICO", precio: 44000 },
        { nombre: "SILMO SOBRELENTE", precio: 51200 },
        { nombre: "LINEA VIGO SOBRELENTE", precio: 46400 },
        { nombre: "POLO", precio: 47600 }
    ],
    "SOL": [
        { nombre: "VESPA SOL", precio: 35700 },
        { nombre: "LACROSSE SOL", precio: 46400 },
        { nombre: "ICE LOOK SOL", precio: 53600 },
        { nombre: "SILMO SOL", precio: 40500 }
    ],
    "NIÑOS": [
        { nombre: "VESPA KIDS", precio: 16700 },
        { nombre: "VESPA KIDS SOL", precio: 24990 },
        { nombre: "MOODKIDS", precio: 35700 },
        { nombre: "MOODKIDS SOBRELENTE", precio: 35700 },
        { nombre: "FOOSE", precio: 16700 },
        { nombre: "VESPA PEBAX KIDS", precio: 44000 }
    ],
    "SEGURIDAD Y ANTIPARRA": [
        { nombre: "LENTE Y ANTIPARRA DE SEGURIDAD", precio: 7500, precioMax: 27500 }
    ]
};

// Alias para compatibilidad con cotizar.html
const CATEGORIAS_MARCO = categorias;

/**
 * Obtiene la información de categoría y precio de una marca
 * @param {string} nombreMarca
 * @returns {{ categoria: string|null, precio: number|null, precioMax: number|null }}
 */
function obtenerInfoMarca(nombreMarca) {
    for (const [catNombre, marcas] of Object.entries(categorias)) {
        const encontrada = marcas.find(m => m.nombre === nombreMarca);
        if (encontrada) {
            return {
                categoria: catNombre,
                precio: encontrada.precio,
                precioMax: encontrada.precioMax || null
            };
        }
    }
    return { categoria: null, precio: null, precioMax: null };
}

/**
 * Alias local para cotizador
 * @param {string} nombreMarca
 * @returns {{ precio: number, precioMax: number|null }}
 */
function obtenerInfoMarcaLocal(nombreMarca) {
    const info = obtenerInfoMarca(nombreMarca);
    return { precio: info.precio || 0, precioMax: info.precioMax || null };
}

/**
 * Retorna la clase CSS correspondiente a cada categoría
 * @param {string} nombreCat
 * @returns {string}
 */
function categoriaClase(nombreCat) {
    const mapa = {
        'ECONOMICOS': 'economicos',
        'MEDIA': 'media',
        'PREMIUM': 'premium',
        'SOL': 'sol',
        'NIÑOS': 'ninos',
        'SEGURIDAD Y ANTIPARRA': 'seguridad'
    };
    return mapa[nombreCat] || 'seguridad';
}

/**
 * Formato de moneda chilena ($XX.XXX)
 * @param {number|string} n
 * @returns {string}
 */
function money(n) {
    return '$' + Math.round(Number(n || 0)).toLocaleString('es-CL');
}

/**
 * Formatea rango de precio o precio único
 * @param {number|null} precio
 * @param {number|null} precioMax
 * @returns {string}
 */
function formatoPrecio(precio, precioMax) {
    if (!precio) return '';
    let txt = '$' + Math.round(Number(precio)).toLocaleString('es-CL');
    if (precioMax) txt += ' - $' + Math.round(Number(precioMax)).toLocaleString('es-CL');
    return txt;
}

/**
 * Alias para formato de precio en cotizador
 * @param {number|null} precio
 * @param {number|null} precioMax
 * @returns {string}
 */
function formatoPrecioMarco(precio, precioMax) {
    if (!precio) return '';
    let txt = money(precio);
    if (precioMax) txt += ' - ' + money(precioMax);
    return txt;
}

/**
 * Normaliza texto eliminando tildes, mayúsculas y caracteres especiales para búsqueda
 * @param {string} texto
 * @returns {string}
 */
function normalizarTextoBusqueda(texto) {
    return String(texto || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
}

/**
 * Escapa caracteres HTML para evitar XSS
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

/**
 * Búsqueda de marcos en el catálogo real disponible en memoria
 * @param {string} query
 * @param {number} limite
 * @returns {Array<{ url: string, nombre: string, marca: string, precio: number, precioMax: number|null, exacto: boolean }>}
 */
function buscarMarcosReal(query, limite = 8) {
    const f = normalizarTextoBusqueda(query);
    if (!f || typeof catalogoImagenes === 'undefined') return [];
    const out = [];
    for (const [marca, imagenes] of Object.entries(catalogoImagenes || {})) {
        for (const img of (Array.isArray(imagenes) ? imagenes : [])) {
            const imgTexto = String(img || '');
            const nombre = imgTexto.split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
            const nn = normalizarTextoBusqueda(nombre);
            const mn = normalizarTextoBusqueda(marca);
            if (!(nn.includes(f) || mn.includes(f))) continue;
            const info = obtenerInfoMarca(marca);
            const ruta = imgTexto.includes('/')
                ? (imgTexto.startsWith('imagenes-webp/') ? imgTexto : 'imagenes-webp/' + imgTexto)
                : `imagenes-webp/${marca}/${imgTexto}`;
            out.push({
                url: ruta,
                nombre,
                marca,
                precio: info.precio || 0,
                precioMax: info.precioMax || null,
                exacto: nn === f
            });
        }
    }
    out.sort((a, b) => Number(b.exacto) - Number(a.exacto));
    return out.slice(0, limite);
}

/**
 * Muestra notificación flotante (toast)
 * @param {string} mensaje
 * @param {string|boolean} tipo 'success'/'ok'/true, 'error'/'err'/false, 'warning', 'info'
 */
function mostrarToast(mensaje, tipo = 'info') {
    const tipoNormalizado = (tipo === true || tipo === 'ok') ? 'success' : (tipo === false || tipo === 'err') ? 'error' : tipo;
    
    // Si existe elemento legacy #toast (como en cotizar)
    const legacyToast = document.getElementById('toast');
    if (legacyToast && !legacyToast.classList.contains('toast-container')) {
        legacyToast.textContent = mensaje;
        legacyToast.className = 'toast show ' + (tipoNormalizado === 'success' ? 'ok' : tipoNormalizado === 'error' ? 'err' : '');
        setTimeout(() => { legacyToast.className = 'toast'; }, 3200);
        return;
    }

    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const iconos = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        info: 'fa-info-circle',
        warning: 'fa-exclamation-triangle'
    };

    const toast = document.createElement('div');
    toast.className = 'toast ' + (tipoNormalizado || 'info');
    toast.innerHTML = '<i class="fas ' + (iconos[tipoNormalizado] || iconos.info) + '"></i><span>' + escapeHtml(mensaje) + '</span>';
    container.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 3200);
}

const showToast = mostrarToast;

/* ============================================================
   SERVICE WORKER REGISTRATION (PWA)
   ============================================================ */
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then((registration) => {
                // Service Worker registrado correctamente
            })
            .catch((err) => {
                console.warn('Registro de Service Worker falló:', err);
            });
    });
}

/* ============================================================
   GESTIÓN DE FOCO Y ACCESIBILIDAD PARA MODALES (FOCUS TRAP)
   ============================================================ */
class FocusTrap {
    constructor(modalElement) {
        this.modal = typeof modalElement === 'string' ? document.getElementById(modalElement) : modalElement;
        this.previousActiveElement = null;
        this.onKeyDown = this.handleKeyDown.bind(this);
    }

    static getFocusableElements(container) {
        if (!container) return [];
        const selector = 'button:not([disabled]):not([aria-hidden="true"]), ' +
                         '[href]:not([aria-hidden="true"]), ' +
                         'input:not([disabled]):not([type="hidden"]):not([aria-hidden="true"]), ' +
                         'select:not([disabled]):not([aria-hidden="true"]), ' +
                         'textarea:not([disabled]):not([aria-hidden="true"]), ' +
                         '[tabindex]:not([tabindex="-1"]):not([aria-hidden="true"])';
        const elements = Array.from(container.querySelectorAll(selector));
        return elements.filter(el => {
            return el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0;
        });
    }

    activate() {
        if (!this.modal) return;
        this.previousActiveElement = document.activeElement;
        this.modal.setAttribute('aria-modal', 'true');
        if (!this.modal.getAttribute('role')) {
            this.modal.setAttribute('role', 'dialog');
        }

        document.addEventListener('keydown', this.onKeyDown, true);

        // Mover foco al botón de cerrar o al primer elemento interactivo
        requestAnimationFrame(() => {
            const focusables = FocusTrap.getFocusableElements(this.modal);
            const closeBtn = this.modal.querySelector('.modal-close, .modal-simple-cerrar, .crop-close, .comparison-debug-close, [data-modal-close]');
            if (closeBtn && focusables.includes(closeBtn)) {
                closeBtn.focus();
            } else if (focusables.length > 0) {
                focusables[0].focus();
            } else {
                if (!this.modal.hasAttribute('tabindex')) {
                    this.modal.setAttribute('tabindex', '-1');
                }
                this.modal.focus();
            }
        });
    }

    deactivate() {
        if (!this.modal) return;
        document.removeEventListener('keydown', this.onKeyDown, true);

        if (this.previousActiveElement && typeof this.previousActiveElement.focus === 'function') {
            try {
                this.previousActiveElement.focus();
            } catch (_) {}
        }
        this.previousActiveElement = null;
    }

    handleKeyDown(e) {
        if (e.key === 'Tab') {
            const focusables = FocusTrap.getFocusableElements(this.modal);
            if (focusables.length === 0) {
                e.preventDefault();
                return;
            }

            const firstElement = focusables[0];
            const lastElement = focusables[focusables.length - 1];

            if (e.shiftKey) {
                // Shift + Tab
                if (document.activeElement === firstElement || !this.modal.contains(document.activeElement)) {
                    e.preventDefault();
                    lastElement.focus();
                }
            } else {
                // Tab
                if (document.activeElement === lastElement || !this.modal.contains(document.activeElement)) {
                    e.preventDefault();
                    firstElement.focus();
                }
            }
        }
    }
}

const activeFocusTraps = new Map();

function activateFocusTrap(modalIdOrElement) {
    const el = typeof modalIdOrElement === 'string' ? document.getElementById(modalIdOrElement) : modalIdOrElement;
    if (!el) return null;
    let trap = activeFocusTraps.get(el);
    if (!trap) {
        trap = new FocusTrap(el);
        activeFocusTraps.set(el, trap);
    }
    trap.activate();
    return trap;
}

function deactivateFocusTrap(modalIdOrElement) {
    const el = typeof modalIdOrElement === 'string' ? document.getElementById(modalIdOrElement) : modalIdOrElement;
    if (!el) return;
    const trap = activeFocusTraps.get(el);
    if (trap) {
        trap.deactivate();
    }
}

if (typeof window !== 'undefined') {
    window.FocusTrap = FocusTrap;
    window.activateFocusTrap = activateFocusTrap;
    window.deactivateFocusTrap = deactivateFocusTrap;
}


