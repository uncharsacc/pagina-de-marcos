import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return res.status(500).json({ error: 'Telegram no configurado' });
  }

  const d = req.body || {};

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
    'Fecha: ' + new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' })
  ];

  const texto = lineas.join('\n');

  // --- PDF ---
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const gold = rgb(0.78, 0.64, 0.30);
  const dark = rgb(0.12, 0.12, 0.12);
  const muted = rgb(0.35, 0.35, 0.35);

  // Encabezado marca
  page.drawRectangle({ x: 0, y: 800, width: 595, height: 42, color: gold });
  page.drawText('SACC & VISION', {
    x: 40, y: 814, size: 16, font: fontBold, color: rgb(1, 1, 1)
  });
  page.drawText('Artesanos de su Mirada', {
    x: 200, y: 816, size: 10, font, color: rgb(1, 1, 1)
  });

  let y = 770;
  for (const linea of lineas) {
    const isTitle = linea.startsWith('===') || linea.startsWith('COTIZACION') || linea.startsWith('RECIBIDO');
    page.drawText(linea.substring(0, 90), {
      x: 40,
      y,
      size: isTitle ? 11 : 10,
      font: isTitle ? fontBold : font,
      color: isTitle ? gold : dark
    });
    y -= 16;
    if (y < 60) break;
  }

  // Sello
  page.drawRectangle({
    x: 350, y: 40, width: 200, height: 50,
    borderColor: gold, borderWidth: 2
  });
  page.drawText('RECIBIDO', {
    x: 400, y: 68, size: 12, font: fontBold, color: gold
  });
  page.drawText('Receta SACC & VISION', {
    x: 365, y: 50, size: 9, font, color: muted
  });

  const pdfBytes = await pdfDoc.save();
  const pdfBase64 = Buffer.from(pdfBytes).toString('base64');

  try {
    // 1) Mensaje de texto
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: texto })
    });

    // 2) PDF
    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('caption', 'PDF cotizacion - ' + (d.nombre || 'Cliente'));
    form.append(
      'document',
      new Blob([pdfBytes], { type: 'application/pdf' }),
      `cotizacion-${(d.nombre || 'cliente').replace(/\s+/g, '_')}.pdf`
    );

    // En Node de Vercel, FormData + Blob puede variar; usamos sendDocument con base64 vía URL alternativa:
    await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        caption: 'PDF cotizacion SACC & VISION',
        document: `data:application/pdf;base64,${pdfBase64}`
      })
    });

    // Nota: algunos runtimes no aceptan data-URI en document.
    // Si falla el PDF, el texto igual ya se envió.

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}