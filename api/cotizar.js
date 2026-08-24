import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return res.status(500).json({ error: 'Faltan TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID' });
  }

  const d = req.body || {};
  const fecha = new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' });

  const textoTg = [
    'COTIZACION - SACC & VISION',
    '',
    'Cliente: ' + (d.nombre || '-'),
    'Telefono: ' + (d.telefono || '-'),
    '',
    '=== LEJOS ===',
    'OD: ' + (d.lejosOd || '-'),
    'OI: ' + (d.lejosOi || '-'),
    '',
    '=== CERCA ===',
    'OD: ' + (d.cercaOd || '-'),
    'OI: ' + (d.cercaOi || '-'),
    '',
    'Tipo: ' + (d.tipo || '-'),
    'Opciones: ' + ((d.tratamientos || []).join(', ') || '-'),
    'Marco: ' + (d.traeMarco ? 'Trae su marco' : ((d.marcoNombre || '-') + ' $' + (d.marcoPrecio || 0))),
    'Montura: $' + Number(d.montura || 0).toLocaleString('es-CL'),
    '',
    'Costo cristales: $' + Number(d.costoCristales || 0).toLocaleString('es-CL'),
    'Cristales cliente: $' + Number(d.precioCristalesCliente || 0).toLocaleString('es-CL'),
    'TOTAL CLIENTE: $' + Number(d.totalCliente || 0).toLocaleString('es-CL')
  ].join('\n');

  const lejosOd = parseLineaRx(d.lejosOd);
  const lejosOi = parseLineaRx(d.lejosOi);
  const cercaOd = parseLineaRx(d.cercaOd);
  const cercaOi = parseLineaRx(d.cercaOi);

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

  // Header + logo
  page.drawRectangle({ x: 0, y: pageH - headerH, width: pageW, height: headerH, color: gold });
  page.drawText('SACC & VISION', {
    x: margin, y: pageH - 26, size: 13, font: fontBold, color: rgb(1, 1, 1)
  });
  page.drawText('Artesanos de su Mirada', {
    x: margin, y: pageH - 38, size: 7, font, color: rgb(1, 1, 1)
  });
  page.drawText('RECETA / ORDEN', {
    x: pageW - margin - 95, y: pageH - 26, size: 9, font: fontBold, color: rgb(1, 1, 1)
  });
  page.drawText(fecha, {
    x: pageW - margin - 95, y: pageH - 38, size: 7, font, color: rgb(1, 1, 1)
  });

  try {
    const logoPath = path.join(process.cwd(), 'logos-webp', '1772795330993.png');
    const logoBytes = fs.readFileSync(logoPath);
    const logoImg = await pdfDoc.embedPng(logoBytes);
    const lw = 32;
    const lh = (logoImg.height / logoImg.width) * lw;
    page.drawImage(logoImg, {
      x: pageW - margin - lw,
      y: pageH - headerH + (headerH - lh) / 2,
      width: lw,
      height: lh
    });
  } catch (e) {
    console.error('Logo:', e.message);
  }

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
    page.drawText(String(data.esf), { x: cols[1].x, y, size: 9, font, color: dark });
    page.drawText(String(data.cil), { x: cols[2].x, y, size: 9, font, color: dark });
    page.drawText(String(data.eje), { x: cols[3].x, y, size: 9, font, color: dark });
    page.drawText(String(data.dp), { x: cols[4].x, y, size: 9, font, color: dark });
    if (withAdd) {
      page.drawText(String(data.add), { x: cols[5].x, y, size: 9, font, color: dark });
    }
    y -= rowH;
  }

  // LEJOS — filas OD / OI, columnas ESF CIL EJE DP ADD
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
  page.drawText('Tipo: ' + (d.tipo || '—'), {
    x: margin, y, size: 9, font, color: dark
  });
  y -= 12;
  page.drawText('Opciones: ' + ((d.tratamientos || []).join(', ') || '—'), {
    x: margin, y, size: 9, font, color: dark
  });
  y -= 12;
  page.drawText(
    'Marco: ' + (d.traeMarco ? 'Trae su marco' : (d.marcoNombre || '—')),
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
      return res.status(200).json({ ok: true, pdf: false, detail: j2 });
    }
    return res.status(200).json({ ok: true, pdf: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}