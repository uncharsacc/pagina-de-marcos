import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

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

  const lineas = [
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
  ];
  const texto = lineas.join('\n');

  // --- Generar PDF ---
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const gold = rgb(0.78, 0.64, 0.30);
  const dark = rgb(0.12, 0.12, 0.12);
  const muted = rgb(0.35, 0.35, 0.35);

  page.drawRectangle({ x: 0, y: 800, width: 595, height: 42, color: gold });
  page.drawText('SACC & VISION', { x: 40, y: 814, size: 16, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText('Artesanos de su Mirada', { x: 200, y: 816, size: 10, font, color: rgb(1, 1, 1) });

  let y = 770;
  for (const linea of lineas) {
    const isTitle =
      linea.startsWith('===') ||
      linea.startsWith('COTIZACION') ||
      linea.startsWith('RECIBIDO');
    page.drawText(linea.substring(0, 90), {
      x: 40,
      y,
      size: isTitle ? 11 : 10,
      font: isTitle ? fontBold : font,
      color: isTitle ? gold : dark
    });
    y -= 16;
    if (y < 80) break;
  }

  page.drawRectangle({
    x: 350, y: 40, width: 200, height: 50,
    borderColor: gold, borderWidth: 2
  });
  page.drawText('RECIBIDO', { x: 400, y: 68, size: 12, font: fontBold, color: gold });
  page.drawText('Receta SACC & VISION', { x: 365, y: 50, size: 9, font, color: muted });

  const pdfBytes = await pdfDoc.save();

  try {
    // 1) Texto
    const r1 = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: texto })
    });
    const j1 = await r1.json();
    if (!j1.ok) {
      return res.status(500).json({ error: 'Telegram texto fallo', detail: j1 });
    }

    // 2) PDF como archivo (multipart) — así sí lo acepta Telegram
    const form = new FormData();
    form.append('chat_id', String(chatId));
    form.append('caption', 'PDF cotizacion - ' + (d.nombre || 'Cliente'));
    form.append(
      'document',
      new Blob([pdfBytes], { type: 'application/pdf' }),
      'cotizacion-sacc-vision.pdf'
    );

    const r2 = await fetch('https://api.telegram.org/bot' + token + '/sendDocument', {
      method: 'POST',
      body: form
    });
    const j2 = await r2.json();
    if (!j2.ok) {
      // El texto ya se envió; avisamos del PDF
      console.error('PDF fallo', j2);
      return res.status(200).json({ ok: true, pdf: false, detail: j2 });
    }

    return res.status(200).json({ ok: true, pdf: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
}