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

  const msg = [
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
    '=== PRECIOS (solo tu) ===',
    'Costo cristales: $' + Number(d.costoCristales || 0).toLocaleString('es-CL'),
    'Cristales (cliente): $' + Number(d.precioCristalesCliente || 0).toLocaleString('es-CL'),
    'TOTAL CLIENTE: $' + Number(d.totalCliente || 0).toLocaleString('es-CL')
  ].join('\n');

  try {
    const tg = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: msg
      })
    });
    const data = await tg.json();
    if (!data.ok) {
      return res.status(500).json({ error: 'Telegram fallo', detail: data });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
