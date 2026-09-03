import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

let DB_STOCK = null;
let DB_LAB_SIN_AR = null;
let DB_LAB_CON_AR = null;

function cargarJSON(nombre) {
  const rutas = [
    path.join(process.cwd(), 'OPTILAND', nombre),
    path.join(process.cwd(), 'data', nombre),
    path.join(process.cwd(), nombre)
  ];
  for (const r of rutas) {
    if (fs.existsSync(r)) {
      try {
        return JSON.parse(fs.readFileSync(r, 'utf8'));
      } catch (e) {
        console.error('Error parseando ' + r, e);
      }
    }
  }
  return null;
}

function initDBs() {
  if (!DB_STOCK) DB_STOCK = cargarJSON('precios_stock.json');
  if (!DB_LAB_SIN_AR) DB_LAB_SIN_AR = cargarJSON('precios_lab_sin_ar.json');
  if (!DB_LAB_CON_AR) DB_LAB_CON_AR = cargarJSON('precios_lab_con_ar.json');
}

export function parseNumeroRx(val) {
  if (val === undefined || val === null || val === '') return 0;
  const raw = String(val).trim().replace(/\s+/g, '').replace(',', '.');
  if (raw === '' || raw === '+' || raw === '-' || raw === '—') return 0;
  const n = parseFloat(raw);
  return isNaN(n) ? 0 : n;
}

function parseLineaRx(str) {
  const s = String(str || '');
  const get = (label) => {
    const m = s.match(new RegExp(label + '\\s*([^|]+)', 'i'));
    if (!m) return '—';
    const v = m[1].trim();
    return !v || v === '—' ? '—' : v;
  };
  return {
    esf: get('ESF'),
    cil: get('CIL'),
    eje: get('EJE'),
    dp: get('DP'),
    add: get('ADD')
  };
}

export function extraerGraduacion(body) {
  const lejosOd = typeof body.lejosOd === 'object' && body.lejosOd !== null ? body.lejosOd : parseLineaRx(body.lejosOd);
  const lejosOi = typeof body.lejosOi === 'object' && body.lejosOi !== null ? body.lejosOi : parseLineaRx(body.lejosOi);
  const cercaOd = typeof body.cercaOd === 'object' && body.cercaOd !== null ? body.cercaOd : parseLineaRx(body.cercaOd);
  const cercaOi = typeof body.cercaOi === 'object' && body.cercaOi !== null ? body.cercaOi : parseLineaRx(body.cercaOi);

  const odEsf = parseNumeroRx(body.receta?.lejos?.od?.esf ?? body.lejosOdEsf ?? lejosOd.esf);
  const oiEsf = parseNumeroRx(body.receta?.lejos?.oi?.esf ?? body.lejosOiEsf ?? lejosOi.esf);
  const odCil = parseNumeroRx(body.receta?.lejos?.od?.cil ?? body.lejosOdCil ?? lejosOd.cil);
  const oiCil = parseNumeroRx(body.receta?.lejos?.oi?.cil ?? body.lejosOiCil ?? lejosOi.cil);
  const odAdd = parseNumeroRx(body.receta?.lejos?.od?.add ?? body.lejosOdAdd ?? lejosOd.add);
  const oiAdd = parseNumeroRx(body.receta?.lejos?.oi?.add ?? body.lejosOiAdd ?? lejosOi.add);

  const maxEsf = Math.max(Math.abs(odEsf), Math.abs(oiEsf));
  const maxCil = Math.max(Math.abs(odCil), Math.abs(oiCil));
  const maxAdd = Math.max(Math.abs(odAdd), Math.abs(oiAdd));
  const tieneAdd = maxAdd > 0 || odAdd > 0 || oiAdd > 0;
  const tieneReceta = maxEsf > 0 || maxCil > 0 || tieneAdd;

  return {
    odEsf, oiEsf, odCil, oiCil, odAdd, oiAdd,
    maxEsf, maxCil, maxAdd, tieneAdd, tieneReceta,
    lejosOd, lejosOi, cercaOd, cercaOi
  };
}

export function obtenerColumnaStock(esf, cil) {
  const esfAbs = Math.abs(esf);
  const cilAbs = Math.abs(cil);

  if (esfAbs === 0 && cilAbs === 0) return 'ESF2';

  if (esfAbs === 0 && cilAbs > 0) {
    if (cilAbs <= 2.0) return 'CIL-2';
    if (cilAbs <= 4.0) return 'CIL-4';
    if (cilAbs <= 6.0) return 'CIL-6';
    return null;
  }

  if (esfAbs > 0 && cilAbs === 0) {
    if (esfAbs <= 2.0) return 'ESF2';
    if (esfAbs <= 4.0) return 'ESF4';
    if (esfAbs <= 6.0) return 'ESF6';
    if (esfAbs <= 8.0) return 'ESF8';
    if (esfAbs <= 10.0) return 'ESF10';
    return null;
  }

  // Esferocilindrico
  if (cilAbs <= 2.0) {
    if (esfAbs <= 2.0) return '2/2';
    if (esfAbs <= 4.0) return '4/2';
    if (esfAbs <= 6.0) return '6/2';
    if (esfAbs <= 8.0) return '8/2';
    if (esfAbs <= 10.0) return '10/2';
    return null;
  } else if (cilAbs <= 4.0) {
    if (esfAbs <= 2.0) return '2/4';
    if (esfAbs <= 4.0) return '4/4';
    if (esfAbs <= 6.0) return '6/4';
    if (esfAbs <= 8.0) return '8/4';
    if (esfAbs <= 10.0) return '10/4';
    return null;
  } else if (cilAbs <= 6.0) {
    if (esfAbs <= 2.0) return '2/6';
    if (esfAbs <= 4.0) return '4/6';
    if (esfAbs <= 6.0) return '6/6';
    return null;
  }
  return null;
}

export function calcularRecargosLab(esf, cil) {
  const esfAbs = Math.abs(esf);
  const cilAbs = Math.abs(cil);
  let recargoEsf = 0;
  if (esf <= -20.25 || esf >= 20.25) recargoEsf = 8000;
  else if (esfAbs >= 12.25) recargoEsf = 6000;
  else if (esfAbs >= 7.25) recargoEsf = 3000;

  let recargoCil = 0;
  if (cilAbs >= 4.25) recargoCil = 2000;

  return { recargoEsf, recargoCil, totalRecargo: recargoEsf + recargoCil };
}

export function verificarCompatibilidadStockPorOjo(matObj, colOD, colOI) {
  if (!matObj || !colOD || !colOI) return { compatible: false, pOD: null, pOI: null };
  const pOD = matObj.columnas ? matObj.columnas[colOD] : undefined;
  const pOI = matObj.columnas ? matObj.columnas[colOI] : undefined;
  if (pOD !== undefined && pOI !== undefined) {
    return { compatible: true, pOD: Number(pOD), pOI: Number(pOI) };
  }
  return { compatible: false, pOD: null, pOI: null };
}

export function calcularCotizacionBackend(body) {
  initDBs();
  if (!DB_STOCK || !DB_LAB_SIN_AR || !DB_LAB_CON_AR) {
    throw new Error('Base de datos de precios de Optiland no disponible en el servidor');
  }

  const grad = extraerGraduacion(body);
  const colOD = obtenerColumnaStock(grad.odEsf, grad.odCil);
  const colOI = obtenerColumnaStock(grad.oiEsf, grad.oiCil);

  let tipo = body.tipo || 'monofocal';
  if (grad.tieneAdd && tipo === 'monofocal') {
    tipo = 'progresivo';
  } else if (!grad.tieneAdd && tipo !== 'monofocal') {
    tipo = 'monofocal';
  }

  const ar = body.antirreflejo !== undefined ? Boolean(body.antirreflejo) : (body.ar !== undefined ? Boolean(body.ar) : true);
  const onix = ar && Boolean(body.onix);
  const promoCrossMax = Boolean(body.promoCrossMax);

  // Evaluar compatibilidad general de Stock para esta receta
  const stockPosibleGeneral = !grad.tieneAdd && tipo === 'monofocal' && Boolean(colOD && colOI);
  let origenDeseado = (body.origen || body.origenFabricacion || (stockPosibleGeneral ? 'stock' : 'laboratorio')).toLowerCase();

  let origenFinal = 'laboratorio';
  let costoNetoPar = 0;
  let netoOD = 0;
  let netoOI = 0;
  let disenoNombre = '';
  let materialNombre = '';

  // 1) Si se solicita STOCK y la receta no tiene ADD
  if (origenDeseado === 'stock' && stockPosibleGeneral) {
    const stockMats = DB_STOCK.monofocales || [];
    let matObj = null;
    const reqMat = body.material || body.materialId;

    if (reqMat) {
      matObj = stockMats.find(m => m.id === reqMat || m.nombre === reqMat || m.nombre_cliente === reqMat);
    }
    // Si no se especificó o no coincide, buscar el primero con o sin AR
    if (!matObj) {
      matObj = stockMats.find(m => m.ar === ar && m.columnas && m.columnas[colOD] && m.columnas[colOI]);
    }
    if (!matObj) {
      matObj = stockMats.find(m => m.columnas && m.columnas[colOD] && m.columnas[colOI]);
    }

    if (matObj) {
      const matchStock = verificarCompatibilidadStockPorOjo(matObj, colOD, colOI);
      if (matchStock.compatible) {
        netoOD = matchStock.pOD;
        netoOI = matchStock.pOI;
        costoNetoPar = netoOD + netoOI;
        origenFinal = 'stock';
        disenoNombre = 'Monofocal de Stock (Entrega Rápida)';
        materialNombre = matObj.nombre_cliente || matObj.nombre;
      }
    }
  }

  // 2) Si no fue Stock o no hubo coincidencia en Stock -> LABORATORIO
  if (origenFinal !== 'stock') {
    origenFinal = 'laboratorio';
    const dbLab = ar ? DB_LAB_CON_AR : DB_LAB_SIN_AR;
    const disenos = dbLab.disenos || [];

    // Seleccionar diseño
    let reqDiseno = body.diseno || body.disenoId;
    let disenoObj = null;
    if (reqDiseno) {
      disenoObj = disenos.find(d => d.nombre === reqDiseno || d.nombre.toLowerCase().includes(String(reqDiseno).toLowerCase()));
    }
    if (!disenoObj) {
      if (tipo === 'progresivo') {
        disenoObj = disenos.find(d => d.nombre.includes('CROSS ONE')) || disenos[6];
      } else if (tipo === 'bifocal') {
        disenoObj = disenos.find(d => d.nombre.includes('BIFOCAL CONVENCIONAL')) || disenos[3];
      } else {
        disenoObj = disenos.find(d => d.nombre.includes('MONOFOCAL CONVENCIONAL')) || disenos[0];
      }
    }
    if (!disenoObj) disenoObj = disenos[0];
    disenoNombre = disenoObj.nombre;

    // Seleccionar material dentro del diseño
    const reqMat = body.material || body.materialId;
    let matObj = null;
    if (reqMat) {
      matObj = disenoObj.materiales.find(m => m.material === reqMat || m.material.toLowerCase().includes(String(reqMat).toLowerCase()));
    }
    if (!matObj) {
      // Default inteligente de material
      if (ar) {
        matObj = disenoObj.materiales.find(m => m.material.includes('BLUE-FILTER') || m.material.includes('CR-39') || m.material.includes('POLICARBONATO')) || disenoObj.materiales[0];
      } else {
        matObj = disenoObj.materiales[0];
      }
    }
    if (!matObj) throw new Error('Material no disponible para este diseño');

    materialNombre = matObj.material.trim();
    const precioBaseOjo = Number(matObj.precio) || 0;

    // Recargos por potencia
    const recOD = calcularRecargosLab(grad.odEsf, grad.odCil);
    const recOI = calcularRecargosLab(grad.oiEsf, grad.oiCil);
    netoOD = precioBaseOjo + recOD.totalRecargo;
    netoOI = precioBaseOjo + recOI.totalRecargo;
    costoNetoPar = netoOD + netoOI;

    // Promo Cross Max: -35% en Progressive Cross Max si se activa
    if (promoCrossMax && disenoNombre.toUpperCase().includes('CROSS MAX')) {
      costoNetoPar = Math.round(costoNetoPar * 0.65);
    }

    // Onix: +5000 por ojo sobre precio con AR
    if (onix && ar) {
      costoNetoPar += 10000;
    }
  }

  // FÓRMULA SACC OBLIGATORIA:
  // cristalesCliente = Math.round(costoNetoPar * 1.19 * 1.60)
  // totalCliente = cristalesCliente + 16000 + precioMarcoSACC
  const MONTAJE_FIJO_SACC = 16000;
  const cristalesCliente = Math.round(costoNetoPar * 1.19 * 1.60);
  const traeMarco = Boolean(body.traeMarco !== undefined ? body.traeMarco : (body.tieneMarco === 'si'));
  const marcoPrecio = (!traeMarco && body.marcoPrecio) ? Math.max(0, Number(body.marcoPrecio) || 0) : 0;
  const totalCliente = cristalesCliente + MONTAJE_FIJO_SACC + marcoPrecio;

  // LOG EN CONSOLA OBLIGATORIO (Para seguimiento y verificación)
  console.log('=== COTIZACIÓN CALCULADA ===');
  console.log('origen:', origenFinal);
  console.log('columnaOD / columnaOI:', `${colOD || 'N/A'} / ${colOI || 'N/A'}`);
  console.log('netoPar:', costoNetoPar);
  console.log('cristalesCliente:', cristalesCliente);
  console.log('totalCliente:', totalCliente);

  const tratamientos = [];
  if (disenoNombre) tratamientos.push(disenoNombre);
  if (materialNombre) tratamientos.push(materialNombre);
  if (ar) tratamientos.push('Antirreflejo Simple (AR)');
  if (onix) tratamientos.push('Onix Premium (+16 capas)');
  if (promoCrossMax && disenoNombre.toUpperCase().includes('CROSS MAX')) tratamientos.push('Promo Cross Max (-35%)');

  return {
    grad,
    origen: origenFinal,
    columnaOD: colOD,
    columnaOI: colOI,
    netoOD,
    netoOI,
    netoPar: costoNetoPar,
    costoCristales: costoNetoPar,
    precioCristalesCliente: cristalesCliente,
    cristalesCliente: cristalesCliente,
    montura: MONTAJE_FIJO_SACC,
    totalCristalesConMontura: cristalesCliente + MONTAJE_FIJO_SACC,
    marcoPrecio: marcoPrecio,
    totalCliente: totalCliente,
    tipo: tipo,
    disenoNombre: disenoNombre,
    materialNombre: materialNombre,
    tratamientos: tratamientos,
    ar: ar,
    onix: onix,
    traeMarco: traeMarco
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let d = req.body;
  if (typeof d === 'string') {
    try { d = JSON.parse(d); } catch (e) { d = {}; }
  }
  d = d || {};

  // Recalcular y validar SIEMPRE en el backend usando los 3 JSON de Optiland
  let resultadoCalculo;
  try {
    resultadoCalculo = calcularCotizacionBackend(d);
  } catch (err) {
    return res.status(400).json({
      ok: false,
      error: err.message || 'Error al calcular la cotización con los parámetros enviados'
    });
  }

  // Si solo se solicita el cálculo de precio en tiempo real
  if (d.action === 'calcular' || req.query?.action === 'calcular') {
    return res.status(200).json({
      ok: true,
      costoCristales: resultadoCalculo.costoCristales,
      netoPar: resultadoCalculo.netoPar,
      netoOD: resultadoCalculo.netoOD,
      netoOI: resultadoCalculo.netoOI,
      columnaOD: resultadoCalculo.columnaOD,
      columnaOI: resultadoCalculo.columnaOI,
      precioCristalesCliente: resultadoCalculo.precioCristalesCliente,
      cristalesCliente: resultadoCalculo.cristalesCliente,
      montura: resultadoCalculo.montura,
      totalCristalesConMontura: resultadoCalculo.totalCristalesConMontura,
      marcoPrecio: resultadoCalculo.marcoPrecio,
      totalCliente: resultadoCalculo.totalCliente,
      tipo: resultadoCalculo.tipo,
      origen: resultadoCalculo.origen,
      diseno: resultadoCalculo.disenoNombre,
      material: resultadoCalculo.materialNombre,
      tratamientos: resultadoCalculo.tratamientos
    });
  }

  // Solicitud formal de cotización
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return res.status(500).json({ error: 'Faltan TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID' });
  }

  const fecha = new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' });
  const origenTxt = resultadoCalculo.origen === 'stock'
    ? `📦 Stock [OD: ${resultadoCalculo.columnaOD || '—'} / OI: ${resultadoCalculo.columnaOI || '—'}]`
    : '🏭 Laboratorio (Fabricación a medida)';

  const marcoTexto = resultadoCalculo.traeMarco
    ? 'Trae su marco'
    : ((d.marcoNombre || 'Marco del catálogo') + (resultadoCalculo.marcoPrecio > 0 ? (' $' + Number(resultadoCalculo.marcoPrecio).toLocaleString('es-CL')) : ''));

  const textoTg = [
    'COTIZACION - SACC & VISION',
    '',
    'Cliente: ' + (d.nombre || 'Sin nombre'),
    'Telefono: ' + (d.telefono || '-'),
    '',
    '=== LEJOS ===',
    'OD: ' + (typeof d.lejosOd === 'string' ? d.lejosOd : `ESF ${resultadoCalculo.grad.lejosOd.esf} | CIL ${resultadoCalculo.grad.lejosOd.cil} | EJE ${resultadoCalculo.grad.lejosOd.eje} | DP ${resultadoCalculo.grad.lejosOd.dp} | ADD ${resultadoCalculo.grad.lejosOd.add}`),
    'OI: ' + (typeof d.lejosOi === 'string' ? d.lejosOi : `ESF ${resultadoCalculo.grad.lejosOi.esf} | CIL ${resultadoCalculo.grad.lejosOi.cil} | EJE ${resultadoCalculo.grad.lejosOi.eje} | DP ${resultadoCalculo.grad.lejosOi.dp} | ADD ${resultadoCalculo.grad.lejosOi.add}`),
    '',
    '=== CERCA ===',
    'OD: ' + (typeof d.cercaOd === 'string' ? d.cercaOd : `ESF ${resultadoCalculo.grad.cercaOd.esf} | CIL ${resultadoCalculo.grad.cercaOd.cil} | EJE ${resultadoCalculo.grad.cercaOd.eje} | DP ${resultadoCalculo.grad.cercaOd.dp}`),
    'OI: ' + (typeof d.cercaOi === 'string' ? d.cercaOi : `ESF ${resultadoCalculo.grad.cercaOi.esf} | CIL ${resultadoCalculo.grad.cercaOi.cil} | EJE ${resultadoCalculo.grad.cercaOi.eje} | DP ${resultadoCalculo.grad.cercaOi.dp}`),
    '',
    'Tipo: ' + (resultadoCalculo.tipo.toUpperCase()),
    'Origen cristales: ' + origenTxt,
    'Diseño: ' + resultadoCalculo.disenoNombre,
    'Material: ' + resultadoCalculo.materialNombre,
    resultadoCalculo.origen === 'stock' ? ('Columnas Stock: OD ' + (resultadoCalculo.columnaOD || '—') + ' ($' + (resultadoCalculo.netoOD || 0) + ') | OI ' + (resultadoCalculo.columnaOI || '—') + ' ($' + (resultadoCalculo.netoOI || 0) + ')') : '',
    'Opciones: ' + (resultadoCalculo.tratamientos.join(', ') || '-'),
    'Marco: ' + marcoTexto,
    'Montura fija (SACC): $' + Number(resultadoCalculo.montura || 0).toLocaleString('es-CL'),
    '',
    'Neto par cristales: $' + Number(resultadoCalculo.netoPar || 0).toLocaleString('es-CL'),
    'Cristales cliente (Neto * 1.19 * 1.60): $' + Number(resultadoCalculo.precioCristalesCliente || 0).toLocaleString('es-CL'),
    'TOTAL CLIENTE: $' + Number(resultadoCalculo.totalCliente || 0).toLocaleString('es-CL')
  ].filter(Boolean).join('\n');

  const lejosOd = resultadoCalculo.grad.lejosOd;
  const lejosOi = resultadoCalculo.grad.lejosOi;
  const cercaOd = resultadoCalculo.grad.cercaOd;
  const cercaOi = resultadoCalculo.grad.cercaOi;

  // Página compacta (ancho tipo ficha)
  const pageW = 480;
  const margin = 24;
  const headerH = 48;
  const rowH = 17;
  const contentH = headerH + 40 + 20 + 3 * rowH + 16 + 20 + 3 * rowH + 50 + 70 + 40;
  const pageH = Math.max(420, contentH);

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([pageW, pageH]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const gold = rgb(0.78, 0.64, 0.30);
  const dark = rgb(0.1, 0.1, 0.1);
  const gray = rgb(0.4, 0.4, 0.4);
  const zebra = rgb(0.96, 0.95, 0.92);

  // ── HEADER ──
  page.drawRectangle({ x: 0, y: pageH - headerH, width: pageW, height: headerH, color: gold });

  // Logo arriba a la derecha
  let logoW = 0;
  let logoH = 0;
  try {
    const logoPath = path.join(process.cwd(), 'logos-webp', '1772795330993.png');
    const logoBytes = fs.readFileSync(logoPath);
    const logoImg = await pdfDoc.embedPng(logoBytes);

    logoH = headerH;
    logoW = (logoImg.width / logoImg.height) * logoH;

    const logoX = pageW - margin - logoW;
    const logoY = pageH - headerH;

    page.drawImage(logoImg, {
      x: logoX,
      y: logoY,
      width: logoW,
      height: logoH
    });
  } catch (e) {
    console.error('Logo:', e.message);
  }

  // Textos izquierda
  page.drawText('SACC & VISION', {
    x: margin, y: pageH - 26, size: 13, font: fontBold, color: rgb(1, 1, 1)
  });
  page.drawText('Artesanos de su Mirada', {
    x: margin, y: pageH - 38, size: 7, font, color: rgb(1, 1, 1)
  });

  // Textos derecha
  const rightBlockWidth = 95;
  const gap = logoW > 0 ? 12 : 0;
  const rightX = pageW - margin - logoW - gap - rightBlockWidth;

  page.drawText('RECETA / ORDEN', {
    x: rightX, y: pageH - 26, size: 9, font: fontBold, color: rgb(1, 1, 1)
  });
  page.drawText(fecha, {
    x: rightX, y: pageH - 38, size: 7, font, color: rgb(1, 1, 1)
  });

  let y = pageH - headerH - 18;

  page.drawText('Cliente: ' + (d.nombre || '—'), {
    x: margin, y, size: 10, font: fontBold, color: dark
  });
  y -= 13;
  page.drawText('Telefono: ' + (d.telefono || '—'), {
    x: margin, y, size: 9, font, color: gray
  });
  y -= 18;

  // Columnas: Ojo | ESF | CIL | EJE | DP | ADD
  const cols = [
    { key: 'ojo', x: margin, w: 36 },
    { key: 'esf', x: margin + 40, w: 70 },
    { key: 'cil', x: margin + 115, w: 70 },
    { key: 'eje', x: margin + 190, w: 55 },
    { key: 'dp', x: margin + 250, w: 50 },
    { key: 'add', x: margin + 305, w: 50 }
  ];
  const tableW = pageW - margin * 2;

  function sectionTitle(title) {
    page.drawText(title, { x: margin, y, size: 11, font: fontBold, color: gold });
    y -= 3;
    page.drawLine({
      start: { x: margin, y },
      end: { x: margin + 90, y },
      thickness: 1.2,
      color: gold
    });
    y -= 14;
  }

  function headerRow(withAdd) {
    page.drawRectangle({
      x: margin, y: y - 3, width: tableW, height: rowH, color: zebra
    });
    page.drawText('', { x: cols[0].x + 2, y, size: 8, font: fontBold, color: gray });
    page.drawText('ESF', { x: cols[1].x, y, size: 8, font: fontBold, color: gray });
    page.drawText('CIL', { x: cols[2].x, y, size: 8, font: fontBold, color: gray });
    page.drawText('EJE', { x: cols[3].x, y, size: 8, font: fontBold, color: gray });
    page.drawText('DP', { x: cols[4].x, y, size: 8, font: fontBold, color: gray });
    if (withAdd) {
      page.drawText('ADD', { x: cols[5].x, y, size: 8, font: fontBold, color: gray });
    }
    y -= rowH;
  }

  function dataRow(label, data, withAdd, stripe) {
    if (stripe) {
      page.drawRectangle({
        x: margin, y: y - 3, width: tableW, height: rowH, color: rgb(0.98, 0.98, 0.98)
      });
    }
    page.drawText(label, { x: cols[0].x + 2, y, size: 9, font: fontBold, color: dark });
    page.drawText(String(data.esf || '—'), { x: cols[1].x, y, size: 9, font, color: dark });
    page.drawText(String(data.cil || '—'), { x: cols[2].x, y, size: 9, font, color: dark });
    page.drawText(String(data.eje || '—'), { x: cols[3].x, y, size: 9, font, color: dark });
    page.drawText(String(data.dp || '—'), { x: cols[4].x, y, size: 9, font, color: dark });
    if (withAdd) {
      page.drawText(String(data.add || '—'), { x: cols[5].x, y, size: 9, font, color: dark });
    }
    y -= rowH;
  }

  // LEJOS
  sectionTitle('LEJOS');
  headerRow(true);
  dataRow('OD', lejosOd, true, false);
  dataRow('OI', lejosOi, true, true);
  y -= 12;

  // CERCA
  sectionTitle('CERCA');
  headerRow(true);
  dataRow('OD', cercaOd, true, false);
  dataRow('OI', cercaOi, true, true);
  y -= 16;

  page.drawText('TIPO DE LENTES', {
    x: margin, y, size: 11, font: fontBold, color: gold
  });
  y -= 3;
  page.drawLine({
    start: { x: margin, y },
    end: { x: margin + 110, y },
    thickness: 1.2,
    color: gold
  });
  y -= 14;
  page.drawText('Tipo: ' + (resultadoCalculo.tipo.toUpperCase()), {
    x: margin, y, size: 9, font, color: dark
  });
  y -= 12;
  page.drawText('Opciones: ' + (resultadoCalculo.tratamientos.join(', ') || '—'), {
    x: margin, y, size: 9, font, color: dark
  });
  y -= 12;
  page.drawText(
    'Marco: ' + (resultadoCalculo.traeMarco ? 'Trae su marco' : (d.marcoNombre || '—')),
    { x: margin, y, size: 9, font, color: dark }
  );

  // Sello
  const stampW = 160;
  const stampH = 52;
  const sx = pageW - margin - stampW;
  const sy = 20;
  page.drawRectangle({
    x: sx, y: sy, width: stampW, height: stampH,
    borderColor: gold, borderWidth: 2
  });
  page.drawText('RECIBIDO', {
    x: sx + 42, y: sy + stampH - 18, size: 11, font: fontBold, color: gold
  });
  page.drawText('SACC & VISION', {
    x: sx + 38, y: sy + stampH - 32, size: 8, font, color: gray
  });
  page.drawText(fecha, {
    x: sx + 18, y: sy + 10, size: 7, font, color: gray
  });

  const pdfBytes = await pdfDoc.save();

  try {
    const r1 = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: textoTg })
    });
    const j1 = await r1.json();
    if (!j1.ok) return res.status(500).json({ error: 'Telegram texto', detail: j1 });

    const form = new FormData();
    form.append('chat_id', String(chatId));
    form.append('caption', 'Receta PDF - ' + (d.nombre || 'Cliente'));
    form.append(
      'document',
      new Blob([pdfBytes], { type: 'application/pdf' }),
      'receta-sacc-vision.pdf'
    );

    const r2 = await fetch('https://api.telegram.org/bot' + token + '/sendDocument', {
      method: 'POST',
      body: form
    });
    const j2 = await r2.json();
    if (!j2.ok) {
      console.error('PDF fallo', j2);
      return res.status(200).json({
        ok: true,
        pdf: false,
        totalCliente: resultadoCalculo.totalCliente,
        precioCristalesCliente: resultadoCalculo.precioCristalesCliente,
        montura: resultadoCalculo.montura,
        costoCristales: resultadoCalculo.costoCristales,
        detail: j2
      });
    }
    return res.status(200).json({
      ok: true,
      pdf: true,
      totalCliente: resultadoCalculo.totalCliente,
      precioCristalesCliente: resultadoCalculo.precioCristalesCliente,
      montura: resultadoCalculo.montura,
      costoCristales: resultadoCalculo.costoCristales
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
