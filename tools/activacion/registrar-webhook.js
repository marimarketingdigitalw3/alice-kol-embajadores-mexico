#!/usr/bin/env node
'use strict';

/**
 * Se ejecuta en cada publicacion de produccion en Vercel (buildCommand): conecta el bot con el
 * webhook del proyecto y carga el menu de comandos. Nunca rompe la publicacion: solo informa.
 */

const { crearApi, COMANDOS } = require('./telegram');
const { COMANDOS_OUTREACH } = require('../outreach/bot');

async function registrar(nombre, token, secreto, ruta, comandos) {
  const { llamar } = crearApi(token);
  const bot = await llamar('getMe', {});
  await llamar('setWebhook', { url: `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}${ruta}`, secret_token: secreto, allowed_updates: ['message', 'callback_query'], max_connections: 1 });
  await llamar('setMyCommands', { commands: comandos });
  const info = await llamar('getWebhookInfo', {});
  console.log(`Webhook ${nombre}: @${bot.username} -> ${info.url} | pendientes ${info.pending_update_count} | ultimo error: ${info.last_error_message || 'ninguno'}`);
}

async function main() {
  const { VERCEL_ENV, VERCEL_PROJECT_PRODUCTION_URL: host, TELEGRAM_BOT_TOKEN: token, TELEGRAM_WEBHOOK_SECRET: secreto } = process.env;
  if (VERCEL_ENV !== 'production') return console.log(`Webhook: no se toca (entorno ${VERCEL_ENV || 'local'}).`);
  if (!token || !secreto || !host) return console.log('Webhook: faltan TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET o la URL de produccion.');
  await registrar('oficina', token, secreto, '/api/telegram', COMANDOS).catch((e) => console.log(`Webhook oficina: no se pudo registrar (${e.message}).`));
  const { OUTREACH_BOT_TOKEN: tOut, OUTREACH_WEBHOOK_SECRET: sOut } = process.env;
  if (tOut && sOut) await registrar('outreach', tOut, sOut, '/api/outreach', COMANDOS_OUTREACH).catch((e) => console.log(`Webhook outreach: no se pudo registrar (${e.message}).`));
  else console.log('Webhook outreach: falta OUTREACH_BOT_TOKEN u OUTREACH_WEBHOOK_SECRET.');
}

main().catch((e) => console.log(`Webhook: no se pudo registrar (${e.message}).`));
