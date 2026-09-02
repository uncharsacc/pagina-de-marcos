import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

let DB = null;
function getDB() {
  if (DB) return DB;
  try {
    let jsonPath = path.join(process.cwd(), 'data', 'precios_optiland.json');
    if (!fs.existsSync(jsonPath)) {
      jsonPath = path.join(process.cwd(), 'precios_optiland.json');
    }
    const data = fs.readFileSync(jsonPath, 'utf8');
    DB = JSON.parse(data);
    return DB;
  } catch (e) {
    console.error('Error cargando precios_optiland.json en el servidor:', e);
    return null;
  }
}

function parseNumeroRx(val) {
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

function extraerGraduacion(body) {
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

function redondearEsf(x) {
  for (const k of [2, 4, 6, 8, 10]) {
    if (x <= k) return k;
  }
  return null;
}

function precioStock(db, stockKey, esfAbs, cilAbs) {
  if (!db || !db.stock) return null;
  const m = db.stock[stockKey];
  if (!m) return null;
  if (m.flat_solo_neutro !== undefined) {
    return (esfAbs === 0 && cilAbs === 0) ? m.flat_solo_neutro : null;
  }
  if (esfAbs === 0 && cilAbs > 0 && m.cil_solo) {
    if (cilAbs <= 2 && m.cil_solo['2'] !== undefined) return m.cil_solo['2'];
    if (cilAbs <= 4 && m.cil_solo['4'] !== undefined) return m.cil_solo['4'];
    if (cilAbs <= 6 && m.cil_solo['6'] !== undefined) return m.cil_solo['6'];
    return null;
  }
  const esfR = redondearEsf(esfAbs);
  if (esfR === null) return null;
  let banda = null;
  if (cilAbs === 0) banda = m.esf_solo;
  else if (cilAbs <= 2) banda = m.cil2;
  else if (cilAbs <= 4) banda = m.cil4;
  else if (cilAbs <= 6) banda = m.cil6;
  else return null;

  if (!banda) return null;
  const val = banda[String(esfR)];
  return (val !== undefined && val !== null) ? val : null;
}

function verificarCompatibilidadStock(db, grad, tipo, materialId, ar) {
  if (!db || !db.stock || !db.stock_map) return { compatible: false, precioUnitario: null };
  if (tipo !== 'monofocal' || grad.tieneAdd) return { compatible: false, precioUnitario: null };
  const mapa = db.stock_map[materialId];
  if (!mapa) return { compatible: false, precioUnitario: null };
  const stockKey = ar ? mapa.con_ar : mapa.sin_ar;
  if (!stockKey || !db.stock[stockKey]) return { compatible: false, precioUnitario: null };
  const precioUnitario = precioStock(db, stockKey, grad.maxEsf, grad.maxCil);
  if (precioUnitario === null) return { compatible: false, precioUnitario: null };
  return { compatible: true, precioUnitario };
}

function calcularCotizacionBackend(body) {
  const db = getDB();
  if (!db) {
    throw new Error('Base de precios del servidor no disponible');
  }

  const grad = extraerGraduacion(body);

  let tipo = body.tipo || 'monofocal';
  if (grad.tieneAdd && tipo === 'monofocal') {
    tipo = 'progresivo';
  } else if (!grad.tieneAdd && tipo !== 'monofocal') {
    tipo = 'monofocal';
  }

  let disenoId = body.diseno || body.disenoId;
  if (!disenoId || !db.disenos[disenoId]) {
    const disponibles = Object.entries(db.disenos).filter(([_, d]) => d.tipo === tipo);
    if (disponibles.length > 0) disenoId = disponibles[0][0];
    else disenoId = 'monofocal_convencional';
  }
  const disenoObj = db.disenos[disenoId];
  if (!disenoObj) {
    throw new Error('Diseño de cristal no encontrado');
  }

  const ar = body.antirreflejo !== undefined ? Boolean(body.antirreflejo) : (body.ar !== undefined ? Boolean(body.ar) : true);
  const onix = ar && Boolean(body.onix);

  const tablaPrecios = ar ? disenoObj.precio_con_ar : disenoObj.precio_sin_ar;
  const materialesDisponibles = Object.keys(tablaPrecios || {});

  let materialId = body.material || body.materialId;
  if (!materialId || !materialesDisponibles.includes(materialId)) {
    materialId = materialesDisponibles[0] || 'cr39';
  }

  const stockInfo = verificarCompatibilidadStock(db, grad, tipo, materialId, ar);
  const disenoRequiereLab = (disenoId === 'monofocal_cross_compress' || disenoId === 'cross_myofix' || tipo !== 'monofocal');

  let origenFinal = 'laboratorio';
  let costo = null;

  const origenDeseado = body.origen || body.origenFabricacion || 'stock';
  if (origenDeseado === 'stock' && stockInfo.compatible && !disenoRequiereLab) {
    costo = stockInfo.precioUnitario * 2;
    origenFinal = 'stock';
  } else {
    const costoLabUnitario = (tablaPrecios && tablaPrecios[materialId] !== undefined)
      ? tablaPrecios[materialId]
      : null;
    if (costoLabUnitario === null) {
      throw new Error('Material no disponible para esta combinación');
    }
    costo = costoLabUnitario * 2;
    origenFinal = 'laboratorio';
  }

  if (costo !== null && onix) {
    const onixExtra = (db.reglas_precio_cliente && db.reglas_precio_cliente.capa_onix_extra && db.reglas_precio_cliente.capa_onix_extra.costo_extra_total) || 10000;
    costo += onixExtra;
  }

  const IVA = (db.reglas_precio_cliente && db.reglas_precio_cliente.iva !== undefined) ? (1 + db.reglas_precio_cliente.iva) : 1.19;
  const MARGEN = (db.reglas_precio_cliente && db.reglas_precio_cliente.margen !== undefined) ? (1 + db.reglas_precio_cliente.margen) : 1.60;
  const FIJO = (db.reglas_precio_cliente && db.reglas_precio_cliente.cobro_fijo_montaje_al_marco) || 16000;

  const precioCristalesCliente = Math.round(costo * IVA * MARGEN) + FIJO;
  const montura = FIJO;
  const precioSoloCristales = precioCristalesCliente - montura;

  const traeMarco = Boolean(body.traeMarco !== undefined ? body.traeMarco : (body.tieneMarco === 'si'));
  const marcoPrecio = (!traeMarco && body.marcoPrecio) ? Math.max(0, Number(body.marcoPrecio) || 0) : 0;
  const totalCliente = precioCristalesCliente + marcoPrecio;

  const disenoNombre = disenoObj.nombre_cliente || disenoObj.nombre_interno || disenoId;
  const matObj = db.materiales.find(m => m.id === materialId);
  const materialNombre = matObj ? matObj.nombre_cliente : materialId;

  const tratamientos = [];
  if (disenoNombre) tratamientos.push(disenoNombre);
  if (materialNombre) tratamientos.push(materialNombre);
  if (ar) tratamientos.push('Antirreflejo (AR)');
  if (onix) tratamientos.push('Onix Premium');

  return {
    grad,
    costoCristales: costo,
    precioCristalesCliente: precioSoloCristales,
    montura: montura,
    totalCristalesConMontura: precioCristalesCliente,
    marcoPrecio: marcoPrecio,
    totalCliente: totalCliente,
    tipo: tipo,
    disenoId: disenoId,
    disenoNombre: disenoNombre,
    materialId: materialId,
    materialNombre: materialNombre,
    tratamientos: tratamientos,
    origen: origenFinal,
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

  // Recalcular y validar SIEMPRE en el backend usando precios_optiland.json
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
      precioCristalesCliente: resultadoCalculo.precioCristalesCliente,
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
  const origenTxt = resultadoCalculo.origen === 'stock' ? '📦 Stock (Entrega rápida)' : '🏭 Laboratorio (Fabricación a medida)';

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
    'Opciones: ' + (resultadoCalculo.tratamientos.join(', ') || '-'),
    'Marco: ' + marcoTexto,
    'Montura fija: $' + Number(resultadoCalculo.montura || 0).toLocaleString('es-CL'),
    '',
    'Costo cristales (par): $' + Number(resultadoCalculo.costoCristales || 0).toLocaleString('es-CL'),
    'Cristales cliente: $' + Number(resultadoCalculo.precioCristalesCliente || 0).toLocaleString('es-CL'),
    'TOTAL CLIENTE: $' + Number(resultadoCalculo.totalCliente || 0).toLocaleString('es-CL')
  ].join('\n');

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
