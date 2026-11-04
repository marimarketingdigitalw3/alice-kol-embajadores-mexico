'use strict';

/** Webhook de Telegram del bot de outreach. */

const { crearApi } = require('../tools/activacion/telegram');
const { abrir } = require('./_outreach');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(200).send('Outreach ALICE AI: webhook activo.');
  if (req.headers['x-telegram-bot-api-secret-token'] !== process.env.OUTREACH_WEBHOOK_SECRET) return res.status(401).send('no autorizado');
  const up = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const api = crearApi(process.env.OUTREACH_BOT_TOKEN);
  try {
    const { bot, guardar } = await abrir();
    let chat; let entrada;
    if (up.callback_query) {
      const q = up.callback_query;
      api.llamar('answerCallbackQuery', { callback_query_id: q.id }).catch(() => {});
      chat = q.message.chat.id;
      entrada = { usuario: { id: q.from.id, nombre: q.from.first_name }, boton: q.data };
    } else if (up.message && up.message.chat.type === 'private') {
      const m = up.message;
      chat = m.chat.id;
      entrada = { usuario: { id: m.from.id, nombre: m.from.first_name }, texto: m.text || m.caption || '' };
    }
    if (entrada) {
      console.log(`outreach: update de ${entrada.usuario.nombre || ''} (id ${entrada.usuario.id})`);
      api.llamar('sendChatAction', { chat_id: chat, action: 'typing' }).catch(() => {});
      const salidas = await bot.recibir(entrada);
      bot.registrarChat(entrada.usuario.id, chat);
      await api.enviar(chat, salidas);
      await guardar();
    }
  } catch (e) {
    console.error('outreach: error procesando update', up && up.update_id, e);
  }
  return res.status(200).send('ok');
};
