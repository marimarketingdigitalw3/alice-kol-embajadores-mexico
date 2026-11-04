'use strict';

/**
 * Conecta el bot con este servidor: registra el webhook y el menu de comandos.
 * Uso: GET /api/setup?clave=<TELEGRAM_WEBHOOK_SECRET>
 */

const { crearApi, COMANDOS } = require('../tools/activacion/telegram');

module.exports = async (req, res) => {
  const clave = new URL(req.url, 'http://x').searchParams.get('clave');
  if (!clave || clave !== process.env.TELEGRAM_WEBHOOK_SECRET) return res.status(401).send('no autorizado');
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || req.headers.host;
  const { llamar } = crearApi(process.env.TELEGRAM_BOT_TOKEN);
  const out = {};
  try {
    out.bot = (await llamar('getMe', {})).username;
    out.webhook = await llamar('setWebhook', {
      url: `https://${host}/api/telegram`,
      secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ['message', 'callback_query'],
      max_connections: 1, // de a un update: el estado se lee y se guarda sin pisarse
    });
    out.comandos = await llamar('setMyCommands', { commands: COMANDOS });
    const info = await llamar('getWebhookInfo', {});
    out.info = { url: info.url, pendientes: info.pending_update_count, ultimoError: info.last_error_message || null };
  } catch (e) {
    out.error = e.message;
  }
  return res.status(200).json(out);
};
