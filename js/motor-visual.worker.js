/* ============================================================
   SACC & VISION - WEB WORKER: MOTOR DE COMPARACIÓN VISUAL
   Archivo: js/motor-visual.worker.js
   ------------------------------------------------------------
   Mueve el procesamiento intensivo de imágenes, descriptores
   y cálculo de similitudes a un hilo secundario (Web Worker)
   para mantener la interfaz a 60fps en móviles y desktop.
   ============================================================ */

// Tabla de lookup POPCOUNT para conteo rápido de bits en enteros de 8 bits
const POPCOUNT = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
    let c = 0, v = i;
    while (v) { c += v & 1; v >>= 1; }
    POPCOUNT[i] = c;
}

function base64ToUint8(b64) {
    if (!b64) return new Uint8Array(0);
    const bin = atob(b64);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
}

function uint8ToBase64(u8) {
    let s = '';
    for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return btoa(s);
}

function floatArrayToUint8(arr) {
    const u = new Uint8Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
        u[i] = Math.max(0, Math.min(255, Math.round(arr[i] * 255)));
    }
    return u;
}

class MotorComparacionWorker {
    constructor() {
        this.cache = new Map();
        this.cacheResultados = new Map();
        this.size = 256;
        this.descSize = 96;
        this.maxCandidatos = 12;
        this.ultimaComparacionVisual = [];
        this.ultimaReferenciaVisual = null;
        this.categoriasExcluidas = new Set(['SEGURIDAD Y ANTIPARRA']);

        this.CACHE_VERSION = 'v3-size256';
        this.descriptoresMap = new Map();
        this.descriptoresCandidatos = [];
        this.precalentando = false;
    }

    cargarDescriptoresPrecalculados(jsonObj) {
        if (!jsonObj || typeof jsonObj !== 'object') return 0;
        this.descriptoresMap.clear();
        this.descriptoresCandidatos = [];

        for (const [frontalUrl, d] of Object.entries(jsonObj)) {
            const cand = {
                frontalUrl,
                hR: new Float32Array(d.hR || []),
                hG: new Float32Array(d.hG || []),
                hB: new Float32Array(d.hB || []),
                hL: new Float32Array(d.hL || []),
                colorPromedio: d.colorPromedio || { r: 0, g: 0, b: 0 },
                pHash: d.pHashB64 ? base64ToUint8(d.pHashB64) : (d.pHash ? new Uint8Array(d.pHash) : new Uint8Array(32)),
                edges: d.edgesB64 ? base64ToUint8(d.edgesB64) : (d.edges ? new Uint8Array(d.edges) : new Uint8Array(1152)),
                filas: new Float32Array(d.filas || []),
                columnas: new Float32Array(d.columnas || []),
                silhouette: d.silB64 ? base64ToUint8(d.silB64) : (d.silhouette ? floatArrayToUint8(d.silhouette) : new Uint8Array(1024)),
                formaGris: d.grisB64 ? base64ToUint8(d.grisB64) : (d.formaGris ? floatArrayToUint8(d.formaGris) : new Uint8Array(1024)),
                hu: new Float32Array(d.hu || [0, 0, 0, 0, 0, 0, 0]),
                glassLike: typeof d.glassLike === 'number' ? d.glassLike : 0.5,
                hog: new Float32Array(d.hog || []),
                zonas: new Float32Array(d.zonas || []),
                aspecto: d.aspecto || 1.5,
                area: d.area || 0.5,
                modo: 'catalogo-frontal-json'
            };
            this.descriptoresMap.set(frontalUrl, cand);
            this.descriptoresCandidatos.push(cand);
        }
        return this.descriptoresMap.size;
    }

    async cargarImagen(src) {
        if (this.cache.has(src)) return this.cache.get(src);
        try {
            let bitmap;
            if (typeof src === 'string') {
                const resp = await fetch(src);
                if (!resp.ok) throw new Error(`HTTP ${resp.status} al cargar imagen: ${src}`);
                const blob = await resp.blob();
                bitmap = await createImageBitmap(blob);
            } else if (src instanceof Blob) {
                bitmap = await createImageBitmap(src);
            } else if (src && src.data && src.width && src.height) {
                const imgData = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
                bitmap = await createImageBitmap(imgData);
            } else {
                throw new Error('Formato de imagen no reconocido');
            }

            const canvas = new OffscreenCanvas(this.size, this.size);
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, this.size, this.size);

            const escala = Math.min(this.size / bitmap.width, this.size / bitmap.height);
            const w = bitmap.width * escala;
            const h = bitmap.height * escala;
            const x = (this.size - w) / 2;
            const y = (this.size - h) / 2;
            ctx.drawImage(bitmap, x, y, w, h);

            if (typeof bitmap.close === 'function') {
                bitmap.close();
            }

            const imageData = ctx.getImageData(0, 0, this.size, this.size);
            const res = { data: imageData.data, width: this.size, height: this.size };
            this.cache.set(src, res);
            return res;
        } catch (e) {
            throw new Error(`No se pudo cargar la imagen en Worker (${src}): ${e.message}`);
        }
    }

    clamp(v, min = 0, max = 1) { return v < min ? min : (v > max ? max : v); }
    distanciaColor(r1, g1, b1, r2, g2, b2) {
        return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2) / 441.6729559;
    }
    luminancia(r, g, b) { return 0.299 * r + 0.587 * g + 0.114 * b; }

    umbralOtsu(gray) {
        const hist = new Float32Array(256);
        for (const v of gray) hist[Math.min(255, Math.max(0, Math.floor(v)))]++;
        const total = gray.length;
        let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
        let sumB = 0, wB = 0, maxVar = 0, threshold = 128;
        for (let t = 0; t < 256; t++) {
            wB += hist[t];
            if (wB === 0) continue;
            const wF = total - wB;
            if (wF === 0) break;
            sumB += t * hist[t];
            const mB = sumB / wB;
            const mF = (sum - sumB) / wF;
            const varBetween = wB * wF * (mB - mF) ** 2;
            if (varBetween > maxVar) { maxVar = varBetween; threshold = t; }
        }
        return threshold;
    }

    estimarColorFondo(data, width, height) {
        const grosor = Math.max(3, Math.round(Math.min(width, height) * 0.035));
        const muestrasR = [], muestrasG = [], muestrasB = [];
        const agregar = (x, y) => {
            const idx = (y * width + x) * 4;
            if (data[idx + 3] < 30) return;
            muestrasR.push(data[idx]);
            muestrasG.push(data[idx + 1]);
            muestrasB.push(data[idx + 2]);
        };
        for (let x = 0; x < width; x++) {
            for (let t = 0; t < grosor; t++) { agregar(x, t); agregar(x, height - 1 - t); }
        }
        for (let y = 0; y < height; y++) {
            for (let t = 0; t < grosor; t++) { agregar(t, y); agregar(width - 1 - t, y); }
        }
        const mediana = (arr) => {
            if (!arr.length) return 255;
            const s = Float32Array.from(arr).sort();
            return s[Math.floor(s.length / 2)];
        };
        const r = mediana(muestrasR), g = mediana(muestrasG), b = mediana(muestrasB);
        const desvio = (arr, media) => {
            if (!arr.length) return 0;
            let s = 0; for (const v of arr) s += Math.abs(v - media);
            return s / arr.length;
        };
        const variacion = (desvio(muestrasR, r) + desvio(muestrasG, g) + desvio(muestrasB, b)) / 3;
        return { r, g, b, uniforme: variacion < 18 };
    }

    crearMascara(data, width, height) {
        const gray = new Float32Array(width * height);
        for (let i = 0; i < gray.length; i++) {
            const p = i * 4;
            gray[i] = this.luminancia(data[p], data[p + 1], data[p + 2]);
        }
        const thr = this.umbralOtsu(gray);
        const fondo = this.estimarColorFondo(data, width, height);
        const umbralFondo = fondo.uniforme ? 0.10 : 0.16;
        const mask = new Uint8Array(width * height);
        for (let i = 0; i < gray.length; i++) {
            const p = i * 4;
            const a = data[p + 3];
            if (a < 30) { mask[i] = 0; continue; }
            const r = data[p], g = data[p + 1], b = data[p + 2];
            const maxC = Math.max(r, g, b), minC = Math.min(r, g, b);
            const sat = (maxC - minC) / 255;
            const distFondo = this.distanciaColor(r, g, b, fondo.r, fondo.g, fondo.b);
            const esFondoPorColor = distFondo < umbralFondo;
            const esCasiBlanco = (r > 230 && g > 230 && b > 230 && sat < 0.08);
            const esClaroUniforme = (gray[i] > 210 && sat < 0.12);
            if (esFondoPorColor || esCasiBlanco || esClaroUniforme) {
                mask[i] = 0;
            } else {
                mask[i] = gray[i] < (thr + 15) ? 1 : 0;
            }
        }
        return mask;
    }

    dilatar(mask, width, height, radio = 2) {
        const out = new Uint8Array(mask.length);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let found = false;
                for (let dy = -radio; dy <= radio && !found; dy++) {
                    const yy = y + dy;
                    if (yy < 0 || yy >= height) continue;
                    for (let dx = -radio; dx <= radio; dx++) {
                        const xx = x + dx;
                        if (xx < 0 || xx >= width) continue;
                        if (mask[yy * width + xx]) { found = true; break; }
                    }
                }
                if (found) out[y * width + x] = 1;
            }
        }
        return out;
    }

    erosionar(mask, width, height, radio = 1) {
        const out = new Uint8Array(mask.length);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let ok = true;
                for (let dy = -radio; dy <= radio && ok; dy++) {
                    const yy = y + dy;
                    if (yy < 0 || yy >= height) { ok = false; break; }
                    for (let dx = -radio; dx <= radio; dx++) {
                        const xx = x + dx;
                        if (xx < 0 || xx >= width || !mask[yy * width + xx]) { ok = false; break; }
                    }
                }
                if (ok) out[y * width + x] = 1;
            }
        }
        return out;
    }

    componenteConectadoMayor(mask, width, height) {
        const labels = new Int32Array(mask.length);
        let nextLabel = 1;
        const equivalences = new Map();
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const i = y * width + x;
                if (!mask[i]) continue;
                const up = y > 0 ? labels[(y - 1) * width + x] : 0;
                const left = x > 0 ? labels[y * width + (x - 1)] : 0;
                if (!up && !left) { labels[i] = nextLabel++; }
                else if (up && !left) { labels[i] = up; }
                else if (!up && left) { labels[i] = left; }
                else {
                    labels[i] = Math.min(up, left);
                    if (up !== left) {
                        const a = Math.min(up, left), b = Math.max(up, left);
                        if (!equivalences.has(b)) equivalences.set(b, a);
                        else equivalences.set(b, Math.min(a, equivalences.get(b)));
                    }
                }
            }
        }
        const root = new Int32Array(nextLabel);
        for (let i = 1; i < nextLabel; i++) root[i] = i;
        const find = (x) => { while (root[x] !== x) x = root[x]; return x; };
        for (const [b, a] of equivalences) { root[find(b)] = find(a); }
        const areas = new Map();
        for (let i = 0; i < labels.length; i++) {
            if (!labels[i]) continue;
            const r = find(labels[i]);
            labels[i] = r;
            areas.set(r, (areas.get(r) || 0) + 1);
        }
        if (areas.size === 0) return mask;
        let mayorLabel = 0, mayorArea = 0;
        for (const [lab, area] of areas) { if (area > mayorArea) { mayorArea = area; mayorLabel = lab; } }
        const out = new Uint8Array(mask.length);
        for (let i = 0; i < labels.length; i++) { if (labels[i] === mayorLabel) out[i] = 1; }
        return out;
    }

    obtenerBoundingBox(mask, width, height) {
        let minX = width, minY = height, maxX = -1, maxY = -1, cantidad = 0;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (!mask[y * width + x]) continue;
                cantidad++;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
        if (maxX < 0) return { x: 0, y: 0, width, height, area: 0 };
        return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, area: cantidad };
    }

    recortarImagen(data, width, height, box) {
        const canvas = new OffscreenCanvas(this.descSize, this.descSize);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, this.descSize, this.descSize);

        const temp = new OffscreenCanvas(box.width, box.height);
        const tctx = temp.getContext('2d');
        const region = tctx.createImageData(box.width, box.height);
        for (let y = 0; y < box.height; y++) {
            for (let x = 0; x < box.width; x++) {
                const sx = box.x + x, sy = box.y + y;
                const srcIdx = (sy * width + sx) * 4;
                const dstIdx = (y * box.width + x) * 4;
                region.data[dstIdx] = data[srcIdx];
                region.data[dstIdx + 1] = data[srcIdx + 1];
                region.data[dstIdx + 2] = data[srcIdx + 2];
                region.data[dstIdx + 3] = data[srcIdx + 3];
            }
        }
        tctx.putImageData(region, 0, 0);
        const escala = Math.min(this.descSize / box.width, this.descSize / box.height);
        const w = box.width * escala, h = box.height * escala;
        const x = (this.descSize - w) / 2, y = (this.descSize - h) / 2;
        ctx.drawImage(temp, x, y, w, h);
        return ctx.getImageData(0, 0, this.descSize, this.descSize);
    }

    normalizarImagen(original) {
        const { data, width, height } = original;
        let mask = this.crearMascara(data, width, height);
        mask = this.dilatar(mask, width, height, 2);
        mask = this.erosionar(mask, width, height, 1);
        mask = this.componenteConectadoMayor(mask, width, height);
        const box = this.obtenerBoundingBox(mask, width, height);
        const porcentaje = box.area / (width * height);

        if (porcentaje < 0.005 || porcentaje > 0.85) {
            const cx = Math.floor(width * 0.125);
            const cy = Math.floor(height * 0.125);
            const cw = Math.floor(width * 0.75);
            const ch = Math.floor(height * 0.75);
            const fallbackBox = { x: cx, y: cy, width: cw, height: ch };
            return {
                imageData: this.recortarImagen(data, width, height, fallbackBox),
                box: fallbackBox,
                mask
            };
        }

        const margenX = Math.round(box.width * 0.10);
        const margenY = Math.round(box.height * 0.08);
        const boxFinal = {
            x: Math.max(0, box.x - margenX),
            y: Math.max(0, box.y - margenY),
            width: Math.min(width - Math.max(0, box.x - margenX), box.width + margenX * 2),
            height: Math.min(height - Math.max(0, box.y - margenY), box.height + margenY * 2)
        };
        return {
            imageData: this.recortarImagen(data, width, height, boxFinal),
            box: boxFinal,
            mask
        };
    }

    centroDeMasa(arr, n) {
        let sumX = 0, sumY = 0, total = 0;
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                const v = arr[y * n + x];
                sumX += x * v;
                sumY += y * v;
                total += v;
            }
        }
        if (total < 0.001) return { x: n / 2, y: n / 2 };
        return { x: sumX / total, y: sumY / total };
    }

    calcularSiluetaNormalizada(imageData) {
        const { data, width, height } = imageData;
        const n = 32;
        const raw = new Float32Array(n * n);
        for (let gy = 0; gy < n; gy++) {
            const y0 = Math.floor(gy * height / n);
            const y1 = Math.max(y0 + 1, Math.floor((gy + 1) * height / n));
            for (let gx = 0; gx < n; gx++) {
                const x0 = Math.floor(gx * width / n);
                const x1 = Math.max(x0 + 1, Math.floor((gx + 1) * width / n));
                let activos = 0, total = 0;
                for (let y = y0; y < Math.min(y1, height); y++) {
                    for (let x = x0; x < Math.min(x1, width); x++) {
                        const i = (y * width + x) * 4;
                        const r = data[i], g = data[i + 1], b = data[i + 2];
                        const dist = this.distanciaColor(r, g, b, 255, 255, 255);
                        const sat = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
                        if (dist > 0.08 || sat > 0.10) activos++;
                        total++;
                    }
                }
                raw[gy * n + gx] = total ? activos / total : 0;
            }
        }
        const cm = this.centroDeMasa(raw, n);
        const dx = Math.round((n / 2) - cm.x);
        const dy = Math.round((n / 2) - cm.y);
        const centered = new Uint8Array(n * n);
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                const sx = x - dx, sy = y - dy;
                if (sx >= 0 && sx < n && sy >= 0 && sy < n) {
                    centered[y * n + x] = Math.max(0, Math.min(255, Math.round(raw[sy * n + sx] * 255)));
                }
            }
        }
        return centered;
    }

    calcularFormaGris(imageData, n = 32) {
        const { data, width, height } = imageData;
        const raw = new Float32Array(n * n);
        for (let gy = 0; gy < n; gy++) {
            const y = Math.min(height - 1, Math.floor((gy + 0.5) * height / n));
            for (let gx = 0; gx < n; gx++) {
                const x = Math.min(width - 1, Math.floor((gx + 0.5) * width / n));
                const i = (y * width + x) * 4;
                raw[gy * n + gx] = this.luminancia(data[i], data[i + 1], data[i + 2]) / 255;
            }
        }
        const cm = this.centroDeMasa(raw, n);
        const dx = Math.round((n / 2) - cm.x);
        const dy = Math.round((n / 2) - cm.y);
        const centered = new Uint8Array(n * n);
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                const sx = x - dx, sy = y - dy;
                if (sx >= 0 && sx < n && sy >= 0 && sy < n) {
                    centered[y * n + x] = Math.max(0, Math.min(255, Math.round(raw[sy * n + sx] * 255)));
                }
            }
        }
        return centered;
    }

    calcularHuMoments(imageData) {
        const { data, width, height } = imageData;
        const bin = new Float32Array(width * height);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const i = (y * width + x) * 4;
                const r = data[i], g = data[i + 1], b = data[i + 2];
                const dist = this.distanciaColor(r, g, b, 255, 255, 255);
                const sat = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
                bin[y * width + x] = (dist > 0.08 || sat > 0.10) ? 1 : 0;
            }
        }
        let m00 = 0, m10 = 0, m01 = 0, m20 = 0, m02 = 0, m11 = 0, m30 = 0, m12 = 0, m21 = 0, m03 = 0;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const v = bin[y * width + x];
                if (!v) continue;
                m00 += v;
                m10 += x * v; m01 += y * v;
                m20 += x * x * v; m02 += y * y * v; m11 += x * y * v;
                m30 += x * x * x * v; m12 += x * y * y * v; m21 += x * x * y * v; m03 += y * y * y * v;
            }
        }
        if (m00 < 1) return new Float32Array([0, 0, 0, 0, 0, 0, 0]);
        const cx = m10 / m00, cy = m01 / m00;
        const mu20 = m20 / m00 - cx * cx;
        const mu02 = m02 / m00 - cy * cy;
        const mu11 = m11 / m00 - cx * cy;
        const mu30 = m30 / m00 - 3 * cx * m20 / m00 + 2 * cx * cx * cx;
        const mu12 = m12 / m00 - 2 * cy * m11 / m00 - cx * m02 / m00 + 2 * cy * cy * cx;
        const mu21 = m21 / m00 - 2 * cx * m11 / m00 - cy * m20 / m00 + 2 * cx * cx * cy;
        const mu03 = m03 / m00 - 3 * cy * m02 / m00 + 2 * cy * cy * cy;

        const n20 = mu20, n02 = mu02, n11 = mu11;
        const n30 = mu30 / Math.pow(m00, 1.5);
        const n12 = mu12 / Math.pow(m00, 1.5);
        const n21 = mu21 / Math.pow(m00, 1.5);
        const n03 = mu03 / Math.pow(m00, 1.5);

        const I1 = n20 + n02;
        const I2 = (n20 - n02) ** 2 + 4 * n11 ** 2;
        const I3 = (n30 - 3 * n12) ** 2 + (3 * n21 - n03) ** 2;
        const I4 = (n30 + n12) ** 2 + (n21 + n03) ** 2;
        const I5 = (n30 - 3 * n12) * (n30 + n12) * ((n30 + n12) ** 2 - 3 * (n21 + n03) ** 2) +
                   (3 * n21 - n03) * (n21 + n03) * (3 * (n30 + n12) ** 2 - (n21 + n03) ** 2);
        const I6 = (n20 - n02) * ((n30 + n12) ** 2 - (n21 + n03) ** 2) + 4 * n11 * (n30 + n12) * (n21 + n03);
        const I7 = (3 * n21 - n03) * (n30 + n12) * ((n30 + n12) ** 2 - 3 * (n21 + n03) ** 2) -
                   (n30 - 3 * n12) * (n21 + n03) * (3 * (n30 + n12) ** 2 - (n21 + n03) ** 2);
        return new Float32Array([I1, I2, I3, I4, I5, I6, I7]);
    }

    calcularIndiceMontura(silhouette, aspecto) {
        if (!silhouette || silhouette.length !== 32 * 32) return 0.5;
        let izq = 0, centro = 0, der = 0, tIzq = 0, tCentro = 0, tDer = 0;
        for (let y = 0; y < 32; y++) {
            for (let x = 0; x < 32; x++) {
                const v = silhouette[y * 32 + x] / 255;
                if (x < 11) { izq += v; tIzq++; }
                else if (x < 21) { centro += v; tCentro++; }
                else { der += v; tDer++; }
            }
        }
        izq /= Math.max(1, tIzq); centro /= Math.max(1, tCentro); der /= Math.max(1, tDer);
        const lados = (izq + der) / 2;
        const dobleLobulo = this.clamp(0.5 + (lados - centro) * 2.5);
        const simetria = this.clamp(1 - Math.abs(izq - der) / Math.max(0.05, lados));
        const ancho = this.clamp((aspecto - 1.05) / 1.45);
        return this.clamp(dobleLobulo * 0.55 + simetria * 0.25 + ancho * 0.20);
    }

    crearEdges(imageData) {
        const { data, width, height } = imageData;
        const gray = new Float32Array(width * height);
        for (let i = 0; i < gray.length; i++) {
            const p = i * 4;
            gray[i] = this.luminancia(data[p], data[p + 1], data[p + 2]);
        }
        const totalBits = width * height;
        const byteCount = Math.ceil(totalBits / 8);
        const buffer = new Uint8Array(byteCount);

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const i = y * width + x;
                const gx = -gray[i - width - 1] + gray[i - width + 1] - 2 * gray[i - 1] + 2 * gray[i + 1] - gray[i + width - 1] + gray[i + width + 1];
                const gy = -gray[i - width - 1] - 2 * gray[i - width] - gray[i - width + 1] + gray[i + width - 1] + 2 * gray[i + width] + gray[i + width + 1];
                if (Math.sqrt(gx * gx + gy * gy) > 80) {
                    const byteIdx = Math.floor(i / 8);
                    const bitIdx = i % 8;
                    buffer[byteIdx] |= (1 << bitIdx);
                }
            }
        }
        return buffer;
    }

    calcularHOG(imageData, celdas = 4, bins = 8) {
        const { data, width, height } = imageData;
        const gray = new Float32Array(width * height);
        for (let i = 0; i < gray.length; i++) {
            const p = i * 4;
            gray[i] = this.luminancia(data[p], data[p + 1], data[p + 2]);
        }
        const cellW = Math.max(1, Math.floor(width / celdas));
        const cellH = Math.max(1, Math.floor(height / celdas));
        const hist = new Float32Array(celdas * celdas * bins);
        const gradosPorBin = 180 / bins;

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const i = y * width + x;
                const gx = gray[i + 1] - gray[i - 1];
                const gy = gray[i + width] - gray[i - width];
                const mag = Math.sqrt(gx * gx + gy * gy);
                if (mag < 8) continue;

                let ang = Math.atan2(gy, gx) * 180 / Math.PI;
                if (ang < 0) ang += 180;
                const bin = Math.min(bins - 1, Math.floor(ang / gradosPorBin));

                const cx = Math.min(celdas - 1, Math.floor(x / cellW));
                const cy = Math.min(celdas - 1, Math.floor(y / cellH));
                hist[(cy * celdas + cx) * bins + bin] += mag;
            }
        }

        for (let c = 0; c < celdas * celdas; c++) {
            let norm = 0;
            for (let b = 0; b < bins; b++) { const v = hist[c * bins + b]; norm += v * v; }
            norm = Math.sqrt(norm) + 1e-6;
            for (let b = 0; b < bins; b++) hist[c * bins + b] /= norm;
        }
        return hist;
    }

    zonasSilueta(silhouette) {
        const n = 32;
        if (!silhouette || silhouette.length !== n * n) return new Float32Array(7);
        const zonas = { izqSup: 0, izqInf: 0, centroSup: 0, centroInf: 0, derSup: 0, derInf: 0 };
        const cont = { izqSup: 0, izqInf: 0, centroSup: 0, centroInf: 0, derSup: 0, derInf: 0 };
        for (let y = 0; y < n; y++) {
            const vert = y < n / 2 ? 'Sup' : 'Inf';
            for (let x = 0; x < n; x++) {
                const horiz = x < 11 ? 'izq' : x < 21 ? 'centro' : 'der';
                const key = horiz + vert;
                zonas[key] += silhouette[y * n + x] / 255;
                cont[key]++;
            }
        }
        const claves = ['izqSup', 'izqInf', 'centroSup', 'centroInf', 'derSup', 'derInf'];
        const out = claves.map(k => zonas[k] / Math.max(1, cont[k]));
        const asimetria = (Math.abs(out[0] - out[4]) + Math.abs(out[1] - out[5])) / 2;
        out.push(this.clamp(1 - asimetria * 2));
        return new Float32Array(out);
    }

    calcularHistograma(imageData) {
        const { data, width, height } = imageData;
        const bins = 24;
        const hR = new Float32Array(bins), hG = new Float32Array(bins), hB = new Float32Array(bins), hL = new Float32Array(bins);
        let sumR = 0, sumG = 0, sumB = 0, total = 0;
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            const lum = this.luminancia(r, g, b);
            const dist = this.distanciaColor(r, g, b, 255, 255, 255);
            if (dist < 0.04) continue;
            hR[Math.min(bins - 1, Math.floor(r * bins / 256))]++;
            hG[Math.min(bins - 1, Math.floor(g * bins / 256))]++;
            hB[Math.min(bins - 1, Math.floor(b * bins / 256))]++;
            hL[Math.min(bins - 1, Math.floor(lum * bins / 256))]++;
            sumR += r; sumG += g; sumB += b; total++;
        }
        if (!total) total = 1;
        const norm = arr => {
            const out = new Float32Array(bins);
            for (let i = 0; i < bins; i++) out[i] = arr[i] / total;
            return out;
        };
        return {
            hR: norm(hR), hG: norm(hG), hB: norm(hB), hL: norm(hL),
            colorPromedio: { r: sumR / total / 255, g: sumG / total / 255, b: sumB / total / 255 }
        };
    }

    calcularPHash(imageData) {
        const { data, width, height } = imageData;
        const n = 16;
        const vals = new Float32Array(n * n);
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                const px = Math.floor(x * width / n);
                const py = Math.floor(y * height / n);
                const idx = (py * width + px) * 4;
                vals[y * n + x] = this.luminancia(data[idx], data[idx + 1], data[idx + 2]);
            }
        }
        let media = 0; for (const v of vals) media += v; media /= vals.length;
        const hash = new Uint8Array(32);
        for (let i = 0; i < vals.length; i++) {
            if (vals[i] >= media) {
                const byteIdx = Math.floor(i / 8);
                const bitIdx = i % 8;
                hash[byteIdx] |= (1 << bitIdx);
            }
        }
        return hash;
    }

    calcularProyecciones(imageData) {
        const { data, width, height } = imageData;
        const filas = new Float32Array(16), columnas = new Float32Array(16);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                const r = data[idx], g = data[idx + 1], b = data[idx + 2];
                const dist = this.distanciaColor(r, g, b, 255, 255, 255);
                if (dist < 0.08) continue;
                filas[Math.min(15, Math.floor(y * 16 / height))]++;
                columnas[Math.min(15, Math.floor(x * 16 / width))]++;
            }
        }
        let maxF = 0; for (const v of filas) if (v > maxF) maxF = v;
        let maxC = 0; for (const v of columnas) if (v > maxC) maxC = v;
        if (!maxF) maxF = 1;
        if (!maxC) maxC = 1;
        const normF = new Float32Array(16), normC = new Float32Array(16);
        for (let i = 0; i < 16; i++) { normF[i] = filas[i] / maxF; normC[i] = columnas[i] / maxC; }
        return { filas: normF, columnas: normC };
    }

    async extraerCaracteristicas(src) {
        const original = await this.cargarImagen(src);
        return this.crearDescriptorDesdeImageData(original, 'referencia');
    }

    crearDescriptorDesdeImageData(original, modo = 'normal') {
        const normalizada = this.normalizarImagen(original);
        const img = normalizada.imageData;
        const hist = this.calcularHistograma(img);
        const edges = this.crearEdges(img);
        const pHash = this.calcularPHash(img);
        const proyecciones = this.calcularProyecciones(img);
        const silhouette = this.calcularSiluetaNormalizada(img);
        const formaGris = this.calcularFormaGris(img, 32);
        const hu = this.calcularHuMoments(img);
        const glassLike = this.calcularIndiceMontura(silhouette, normalizada.box.width / Math.max(1, normalizada.box.height));
        const hog = this.calcularHOG(img);
        const zonas = this.zonasSilueta(silhouette);
        const box = normalizada.box;
        return {
            hR: hist.hR, hG: hist.hG, hB: hist.hB, hL: hist.hL,
            colorPromedio: hist.colorPromedio,
            pHash, edges, filas: proyecciones.filas, columnas: proyecciones.columnas,
            silhouette, formaGris, hu, glassLike, hog, zonas,
            aspecto: box.width / Math.max(1, box.height),
            area: (box.width * box.height) / Math.max(1, original.width * original.height),
            modo
        };
    }

    interseccion(h1, h2) {
        let suma = 0;
        const n = Math.min(h1.length, h2.length);
        for (let i = 0; i < n; i++) suma += h1[i] < h2[i] ? h1[i] : h2[i];
        return this.clamp(suma);
    }

    similitudHash(p1, p2) {
        if (!p1 || !p2) return 0;
        let diff = 0;
        const n = Math.min(p1.length, p2.length);
        for (let i = 0; i < n; i++) diff += POPCOUNT[p1[i] ^ p2[i]];
        return this.clamp(1 - (diff / (n * 8)));
    }

    similitudEdges(e1, e2) {
        if (!e1 || !e2) return 0;
        let inter = 0, union = 0;
        const n = Math.min(e1.length, e2.length);
        for (let i = 0; i < n; i++) {
            const a = e1[i], b = e2[i];
            union += POPCOUNT[a | b];
            inter += POPCOUNT[a & b];
        }
        if (!union) return 0;
        return inter / union;
    }

    similitudVector(a, b) {
        const n = Math.min(a.length, b.length);
        if (!n) return 0;
        let diff = 0;
        for (let i = 0; i < n; i++) diff += Math.abs(a[i] - b[i]);
        return this.clamp(1 - diff / n);
    }

    similitudByteVector(a, b) {
        const n = Math.min(a.length, b.length);
        if (!n) return 0;
        let diff = 0;
        for (let i = 0; i < n; i++) diff += Math.abs(a[i] - b[i]);
        return this.clamp(1 - diff / (n * 255));
    }

    similitudCoseno(a, b) {
        const n = Math.min(a.length, b.length);
        if (!n) return 0;
        let dot = 0, na = 0, nb = 0;
        for (let i = 0; i < n; i++) {
            const ai = a[i], bi = b[i];
            dot += ai * bi; na += ai * ai; nb += bi * bi;
        }
        if (!na || !nb) return 0;
        return this.clamp(dot / (Math.sqrt(na) * Math.sqrt(nb)));
    }

    similitudHu(h1, h2) {
        let diff = 0;
        for (let i = 0; i < 7; i++) {
            const a = Math.sign(h1[i]) * Math.log10(Math.abs(h1[i]) + 1e-10);
            const b = Math.sign(h2[i]) * Math.log10(Math.abs(h2[i]) + 1e-10);
            diff += Math.abs(a - b);
        }
        return this.clamp(1 - diff / 20);
    }

    comparar(c1, c2) {
        const simColor = (this.interseccion(c1.hR, c2.hR) + this.interseccion(c1.hG, c2.hG) + this.interseccion(c1.hB, c2.hB)) / 3;
        const simLum = this.interseccion(c1.hL, c2.hL);
        const diffColor = (Math.abs(c1.colorPromedio.r - c2.colorPromedio.r) + Math.abs(c1.colorPromedio.g - c2.colorPromedio.g) + Math.abs(c1.colorPromedio.b - c2.colorPromedio.b)) / 3;
        const simColorAvg = this.clamp(1 - diffColor);
        const simPHash = this.similitudHash(c1.pHash, c2.pHash);
        const simEdges = this.similitudEdges(c1.edges, c2.edges);
        const simFilas = this.similitudVector(c1.filas, c2.filas);
        const simColumnas = this.similitudVector(c1.columnas, c2.columnas);
        const simProyecciones = simFilas * 0.50 + simColumnas * 0.50;
        const simSilhouette = (c1.silhouette instanceof Uint8Array && c2.silhouette instanceof Uint8Array)
            ? this.similitudByteVector(c1.silhouette, c2.silhouette)
            : this.similitudVector(c1.silhouette || [], c2.silhouette || []);
        const simFormaGris = (c1.formaGris instanceof Uint8Array && c2.formaGris instanceof Uint8Array)
            ? this.similitudByteVector(c1.formaGris, c2.formaGris)
            : this.similitudVector(c1.formaGris || [], c2.formaGris || []);
        const simHu = this.similitudHu(c1.hu || [0, 0, 0, 0, 0, 0, 0], c2.hu || [0, 0, 0, 0, 0, 0, 0]);
        const simHOG = this.similitudCoseno(c1.hog || [], c2.hog || []);
        const simZonas = this.similitudVector(c1.zonas || [], c2.zonas || []);

        const diffAspecto = Math.abs(Math.log(Math.max(0.1, c1.aspecto) / Math.max(0.1, c2.aspecto)));
        const simAspecto = this.clamp(1 - diffAspecto / 1.0);
        const diffArea = Math.abs(Math.log(Math.max(0.01, c1.area) / Math.max(0.01, c2.area)));
        const simArea = this.clamp(1 - diffArea / 3);

        let similitud =
            simHu * 0.23 +
            simSilhouette * 0.15 +
            simHOG * 0.15 +
            simFormaGris * 0.10 +
            simZonas * 0.09 +
            simEdges * 0.08 +
            simProyecciones * 0.06 +
            simAspecto * 0.05 +
            simColor * 0.03 +
            simPHash * 0.02 +
            simLum * 0.01 +
            simColorAvg * 0.02 +
            simArea * 0.01;

        const simForma = simHu * 0.32 + simSilhouette * 0.22 + simHOG * 0.22 + simFormaGris * 0.14 + simEdges * 0.10;

        if (simFormaGris < 0.30) similitud *= 0.75;
        else if (simFormaGris < 0.45) similitud *= 0.88;

        if (simSilhouette < 0.22) similitud *= 0.75;
        else if (simSilhouette < 0.35) similitud *= 0.88;

        if (simForma < 0.35) similitud *= 0.80;
        else if (simForma < 0.48) similitud *= 0.92;

        if (simAspecto < 0.50) similitud *= 0.70;
        else if (simAspecto < 0.65) similitud *= 0.88;

        if (simHu < 0.25) similitud *= 0.65;
        else if (simHu < 0.45) similitud *= 0.85;

        if (simHOG < 0.35) similitud *= 0.78;
        else if (simHOG < 0.55) similitud *= 0.90;

        if (simZonas < 0.55) similitud *= 0.85;

        return this.clamp(similitud);
    }

    esProbableEstucheFrontal(descriptor, imagen = {}) {
        const texto = `${imagen.nombre || ''} ${imagen.marca || ''}`.toLowerCase();
        if (/estuche|funda|case|caja|box|accesorio|paño|pano/.test(texto)) return true;
        if (descriptor.glassLike < 0.20 && descriptor.aspecto < 1.75) return true;
        if (descriptor.glassLike < 0.12) return true;
        return false;
    }

    async obtenerCandidato(imagen) {
        if (this.descriptoresMap.has(imagen.frontalUrl)) {
            return this.descriptoresMap.get(imagen.frontalUrl);
        }
        const datosFrontal = await this.cargarImagen(imagen.frontalUrl);
        const candidato = this.crearDescriptorDesdeImageData(datosFrontal, 'catalogo-frontal-json');
        this.descriptoresMap.set(imagen.frontalUrl, candidato);
        return candidato;
    }

    async encontrarSimilares(imagenSrc, todasImagenes, limite = 24, onProgress = null) {
        if (this.cacheResultados.has(imagenSrc)) {
            const cached = this.cacheResultados.get(imagenSrc);
            if (onProgress) onProgress(todasImagenes.length, todasImagenes.length);
            return {
                resultados: cached,
                ultimaComparacionVisual: this.ultimaComparacionVisual,
                ultimaReferenciaVisual: this.ultimaReferenciaVisual,
                desdeCache: true
            };
        }

        const referencia = await this.extraerCaracteristicas(imagenSrc);
        this.ultimaReferenciaVisual = imagenSrc;
        this.ultimaComparacionVisual = [];

        const resultados = [];
        const total = todasImagenes.length;
        let errores = 0;

        for (let i = 0; i < total; i++) {
            const imagen = todasImagenes[i];
            if (this.categoriasExcluidas.has(imagen.categoria)) continue;

            try {
                let candidato = this.descriptoresMap.get(imagen.frontalUrl);
                if (!candidato) {
                    candidato = await this.obtenerCandidato(imagen);
                }

                if (this.esProbableEstucheFrontal(candidato, imagen)) {
                    continue;
                }

                const score = this.comparar(referencia, candidato);
                if (score >= 0.22) {
                    resultados.push({
                        ...imagen,
                        similitud: score,
                        porcentaje: Math.round(score * 100),
                        metodoComparacion: 'frontal-json'
                    });
                }
            } catch (e) {
                errores++;
            }

            if (onProgress && (i % 250 === 0 || i === total - 1)) {
                onProgress(i + 1, total);
            }
        }

        resultados.sort((a, b) => b.similitud - a.similitud);

        this.ultimaComparacionVisual = resultados.slice(0, 12).map(r => ({
            url: r.url,
            frontalUrl: r.frontalUrl,
            marca: r.marca || '',
            nombre: r.nombre || '',
            porcentaje: r.porcentaje
        }));

        const finalResults = resultados.slice(0, limite);
        this.cacheResultados.set(imagenSrc, finalResults);
        return {
            resultados: finalResults,
            ultimaComparacionVisual: this.ultimaComparacionVisual,
            ultimaReferenciaVisual: this.ultimaReferenciaVisual,
            desdeCache: false
        };
    }

    limpiarCache() {
        this.cache.clear();
        this.cacheResultados.clear();
    }
}

// Instancia singleton dentro del Worker
const motor = new MotorComparacionWorker();

// Intentar precargar data/descriptores_catalogo.json localmente si está disponible
(async () => {
    try {
        let resp = await fetch('../data/descriptores_catalogo.json').catch(() => null);
        if (!resp || !resp.ok) {
            resp = await fetch('../descriptores_catalogo.json').catch(() => null);
        }
        if (resp && resp.ok) {
            const json = await resp.json();
            const total = motor.cargarDescriptoresPrecalculados(json);
            self.postMessage({
                type: 'DESCRIPTORES_LISTOS',
                total,
                origen: 'fetch-worker'
            });
        }
    } catch (_) {
        // Si falla por ruta relativa, la página principal enviará los descriptores
    }
})();

// Manejo de mensajes desde el hilo principal
self.onmessage = async function (e) {
    const { type, id, payload } = e.data || {};

    try {
        switch (type) {
            case 'PING': {
                self.postMessage({ type: 'PONG', id });
                break;
            }

            case 'CARGAR_DESCRIPTORES': {
                const total = motor.cargarDescriptoresPrecalculados(payload.descriptores);
                self.postMessage({
                    type: 'DESCRIPTORES_LISTOS',
                    id,
                    total,
                    origen: 'postMessage'
                });
                break;
            }

            case 'BUSCAR_SIMILARES': {
                const { imagenSrc, todasImagenes, limite } = payload;
                const result = await motor.encontrarSimilares(
                    imagenSrc,
                    todasImagenes || [],
                    limite || 24,
                    (procesadas, total) => {
                        self.postMessage({
                            type: 'PROGRESO',
                            id,
                            procesadas,
                            total,
                            pct: Math.round((procesadas / total) * 100)
                        });
                    }
                );

                self.postMessage({
                    type: 'RESULTADOS',
                    id,
                    resultados: result.resultados,
                    ultimaComparacionVisual: result.ultimaComparacionVisual,
                    ultimaReferenciaVisual: result.ultimaReferenciaVisual,
                    desdeCache: result.desdeCache
                });
                break;
            }

            case 'LIMPIAR_CACHE': {
                motor.limpiarCache();
                self.postMessage({ type: 'CACHE_LIMPIADO', id });
                break;
            }

            default: {
                self.postMessage({
                    type: 'ERROR',
                    id,
                    error: `Tipo de mensaje desconocido: ${type}`
                });
            }
        }
    } catch (err) {
        self.postMessage({
            type: 'ERROR',
            id,
            error: err.message || String(err)
        });
    }
};
