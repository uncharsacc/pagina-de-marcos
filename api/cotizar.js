import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

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

  // Mensaje Telegram (con precios, solo tú)
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
    '=== LENTES ===',
    'Tipo: ' + (d.tipo || '-'),
    'Opciones: ' + ((d.tratamientos || []).join(', ') || '-'),
    '',
    '=== MARCO / MONTURA ===',
    'Marco: ' + (d.traeMarco ? 'Trae su marco' : ((d.marcoNombre || '-') + ' $' + (d.marcoPrecio || 0))),
    'Montura (armado): $' + Number(d.montura || 0).toLocaleString('es-CL'),
    '',
    '=== PRECIOS (solo interno) ===',
    'Costo cristales: $' + Number(d.costoCristales || 0).toLocaleString('es-CL'),
    'Cristales (cliente): $' + Number(d.precioCristalesCliente || 0).toLocaleString('es-CL'),
    'TOTAL CLIENTE: $' + Number(d.totalCliente || 0).toLocaleString('es-CL'),
    '',
    '---',
    'RECIBIDO - RECETA SACC & VISION',
    'Fecha: ' + fecha
  ].join('\n');

  // --- PDF estilo receta (SIN precios) ---
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const gold = rgb(0.78, 0.64, 0.30);
  const dark = rgb(0.1, 0.1, 0.1);
  const gray = rgb(0.4, 0.4, 0.4);
  const line = rgb(0.75, 0.75, 0.75);

  // Header
  page.drawRectangle({ x: 0, y: 792, width: 595, height: 50, color: gold });
  page.drawText('SACC & VISION', {
    x: 40, y: 812, size: 18, font: fontBold, color: rgb(1, 1, 1)
  });
  page.drawText('Artesanos de su Mirada', {
    x: 40, y: 798, size: 9, font, color: rgb(1, 1, 1)
  });
  page.drawText('RECETA / ORDEN', {
    x: 380, y: 812, size: 11, font: fontBold, color: rgb(1, 1, 1)
  });
  page.drawText(fecha, {
    x: 380, y: 798, size: 8, font, color: rgb(1, 1, 1)
  });

  // Logo desde la carpeta del proyecto: logos-webp/1772795330993.png
  try {
    const logoPath = path.join(process.cwd(), 'logos-webp', '1772795330993.png');
    const logoBytes = fs.readFileSync(logoPath);
    const logoImg = await pdfDoc.embedPng(logoBytes);
    const lw = 44;
    const lh = (logoImg.height / logoImg.width) * lw;
    page.drawImage(logoImg, {
      x: 555 - lw,
      y: 798,
      width: lw,
      height: lh
    });
  } catch (e) {
    console.error('No se pudo cargar el logo local:', e.message);
  }

  let y = 760;

  page.drawText('Cliente: ' + (d.nombre || '-'), {
    x: 40, y, size: 11, font: fontBold, color: dark
  });
  y -= 16;
  page.drawText('Telefono: ' + (d.telefono || '-'), {
    x: 40, y, size: 10, font, color: gray
  });
  y -= 22;
  page.drawLine({
    start: { x: 40, y },
    end: { x: 555, y },
    thickness: 0.8,
    color: line
  });
  y -= 28;

  function seccion(titulo, odLine, oiLine) {
    page.drawText(titulo, { x: 40, y, size: 12, font: fontBold, color: gold });
    y -= 6;
    page.drawLine({
      start: { x: 40, y },
      end: { x: 200, y },
      thickness: 1,
      color: gold
    });
    y -= 20;
    page.drawText('OD', { x: 120, y, size: 10, font: fontBold, color: gray });
    page.drawText('OI', { x: 340, y, size: 10, font: fontBold, color: gray });
    y -= 18;
    page.drawText(odLine || '—', { x: 40, y, size: 9, font, color: dark });
    y -= 14;
    page.drawText(oiLine || '—', { x: 40, y, size: 9, font, color: dark });
    y -= 26;
  }

  seccion('LEJOS', 'OD: ' + (d.lejosOd || '—'), 'OI: ' + (d.lejosOi || '—'));
  seccion('CERCA', 'OD: ' + (d.cercaOd || '—'), 'OI: ' + (d.cercaOi || '—'));

  page.drawText('TIPO DE LENTES', {
    x: 40, y, size: 12, font: fontBold, color: gold
  });
  y -= 6;
  page.drawLine({
    start: { x: 40, y },
    end: { x: 200, y },
    thickness: 1,
    color: gold
  });
  y -= 20;
  page.drawText('Tipo: ' + (d.tipo || '—'), {
    x: 40, y, size: 10, font, color: dark
  });
  y -= 16;
  page.drawText(
    'Opciones: ' + ((d.tratamientos || []).join(', ') || '—'),
    { x: 40, y, size: 10, font, color: dark }
  );
  y -= 16;
  page.drawText(
    'Marco: ' + (d.traeMarco ? 'Trae su marco' : (d.marcoNombre || '—')),
    { x: 40, y, size: 10, font, color: dark }
  );

  // Sello RECIBIDO
  page.drawRectangle({
    x: 340,
    y: 48,
    width: 210,
    height: 70,
    borderColor: gold,
    borderWidth: 2.5
  });
  page.drawText('RECIBIDO', {
    x: 390, y: 92, size: 14, font: fontBold, color: gold
  });
  page.drawText('Receta SACC & VISION', {
    x: 365, y: 74, size: 10, font, color: gray
  });
  page.drawText(fecha, {
    x: 365, y: 58, size: 8, font, color: gray
  });

  const pdfBytes = await pdfDoc.save();

  try {
    const r1 = await fetch(
      'https://api.telegram.org/bot' + token + '/sendMessage',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: textoTg })
      }
    );
    const j1 = await r1.json();
    if (!j1.ok) {
      return res.status(500).json({ error: 'Telegram texto', detail: j1 });
    }

    const form = new FormData();
    form.append('chat_id', String(chatId));
    form.append(
      'caption',
      'Receta PDF - ' + (d.nombre || 'Cliente') + ' (sin precios)'
    );
    form.append(
      'document',
      new Blob([pdfBytes], { type: 'application/pdf' }),
      'receta-sacc-vision.pdf'
    );

    const r2 = await fetch(
      'https://api.telegram.org/bot' + token + '/sendDocument',
      { method: 'POST', body: form }
    );
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