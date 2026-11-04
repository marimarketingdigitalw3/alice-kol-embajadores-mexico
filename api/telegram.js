'use strict';

/** Webhook de Telegram para la Oficina ALICE AI. Telegram llama aqui con cada mensaje o boton. */

const { crearApi, procesarUpdate } = require('../tools/activacion/telegram');
const { abrir } = require('./_oficina');
const { crearNotion } = require('../tools/activacion/notion');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(200).send('Oficina ALICE AI: webhook activo.');
  if (req.headers['x-telegram-bot-api-secret-token'] !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return res.status(401).send('no autorizado');
  }
  const up = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const de = up && ((up.message && up.message.from) || (up.callback_query && up.callback_query.from));
  if (de) console.log(`update de ${de.first_name || ''} (id ${de.id})`);
  try {
    const { oficina, guardar } = await abrir();
    await procesarUpdate(oficina, up, crearApi(process.env.TELEGRAM_BOT_TOKEN), process.env.NOTION_TOKEN ? crearNotion() : null);
    await guardar();
  } catch (e) {
    // Se responde 200 igual: si no, Telegram reintenta el mismo update en bucle.
    console.error('Error procesando update', up && up.update_id, e);
  }
  return res.status(200).send('ok');
};
