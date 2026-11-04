#!/usr/bin/env node
'use strict';

/**
 * Se ejecuta en cada publicacion de produccion en Vercel (buildCommand): conecta el bot con el
 * webhook del proyecto y carga el menu de comandos. Nunca rompe la publicacion: solo informa.
 */

const { crearApi, COMANDOS } = require('./telegram');

async function main() {
  const { VERCEL_ENV, VERCEL_PROJECT_PRODUCTION_URL: host, TELEGRAM_BOT_TOKEN: token, TELEGRAM_WEBHOOK_SECRET: secreto } = process.env;
  if (VERCEL_ENV !== 'production') return console.log(`Webhook: no se toca (entorno ${VERCEL_ENV || 'local'}).`);
  if (!token || !secreto || !host) return console.log('Webhook: faltan TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET o la URL de produccion.');
  const { llamar } = crearApi(token);
  const bot = await llamar('getMe', {});
  await llamar('setWebhook', {
    url: `https://${host}/api/telegram`,
    secret_token: secreto,
    allowed_updates: ['message', 'callback_query'],
    max_connections: 1,
  });
  await llamar('setMyCommands', { commands: COMANDOS });
  const info = await llamar('getWebhookInfo', {});
  console.log(`Webhook: @${bot.username} -> ${info.url} | pendientes ${info.pending_update_count} | ultimo error: ${info.last_error_message || 'ninguno'}`);
}

main().catch((e) => console.log(`Webhook: no se pudo registrar (${e.message}).`));
