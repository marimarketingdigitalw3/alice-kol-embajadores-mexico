#!/usr/bin/env node
'use strict';

/**
 * Canal Telegram de la Oficina ALICE AI (Outreach, Calificacion, Activacion). Sin dependencias: usa fetch de
 * Node 18+ y long polling (no necesita servidor ni dominio).
 *
 *   TELEGRAM_BOT_TOKEN=123:abc ACTIVACION_PERMITIDOS=111,222 node tools/activacion/telegram.js
 *
 * Tambien lee esas variables de un archivo .env en la raiz del repo.
 */

const fs = require('fs');
const path = require('path');
const { crearOficina } = require('./oficina');

function cargarEnv() {
  const f = path.join(__dirname, '..', '..', '.env');
  if (!fs.existsSync(f)) return;
  for (const linea of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Convierte una salida neutra del motor en uno o mas mensajes HTML de Telegram. */
function renderTelegram(s) {
  let html;
  if (s.guion) {
    html = `<b>${esc(s.guion.etiqueta)} · ${esc(s.guion.titulo)}</b>\n<pre>${esc(s.guion.texto)}</pre>`;
  } else {
    html = `${s.titulo ? `<b>${esc(s.titulo)}</b>\n` : ''}${esc(s.texto || '')}`;
  }
  const partes = [];
  const MAX = 3900;
  if (html.length <= MAX) partes.push(html);
  else if (s.guion) {
    // Guion largo: se parte en bloques <pre> por lineas.
    let actual = '';
    const lineas = s.guion.texto.split('\n');
    partes.push(`<b>${esc(s.guion.etiqueta)} · ${esc(s.guion.titulo)}</b>`);
    for (const l of lineas) {
      if ((actual + l).length > MAX - 20) { partes.push(`<pre>${esc(actual)}</pre>`); actual = ''; }
      actual += `${l}\n`;
    }
    if (actual) partes.push(`<pre>${esc(actual)}</pre>`);
  } else {
    for (let i = 0; i < html.length; i += MAX) partes.push(html.slice(i, i + MAX));
  }
  const markup = s.botones && s.botones.length
    ? { inline_keyboard: s.botones.map((fila) => fila.map((b) => ({ text: b.t.slice(0, 60), callback_data: b.d }))) }
    : undefined;
  return partes.map((texto, i) => ({ texto, markup: i === partes.length - 1 ? markup : undefined }));
}

const COMANDOS = [
  ['oficina', 'Menu de la oficina'], ['llamada', 'Primera llamada confirmada'], ['pipeline', 'Todo el embudo'],
  ['outreach', 'Escritorio de Outreach'], ['calificacion', 'Escritorio de Calificacion'], ['activacion', 'Escritorio de Activacion'],
  ['paso', 'Paso actual con guiones'], ['pendientes', 'Lo que no deja avanzar'], ['preguntas', 'Preguntas para calificar al KOL'], ['agentes', 'Tus expedientes'], ['notion', 'Traer datos del KOL desde Notion'], ['nuevo', 'Registrar agente recien firmado'],
  ['estado', 'Hitos, plazos y blocker'], ['checklist', 'C1 a C8 con pruebas'], ['bloqueo', 'Donde se atoro'],
  ['escalar', 'Armar escalamiento'], ['faq', 'Preguntas del agente'], ['resumen', 'Version para el grupo'],
  ['nodecir', 'Lo que nunca se dice'], ['numeros', 'Cifras clave'], ['tbc', 'Pendientes de confirmar'],
  ['subagentes', 'Subagentes (despues de M4)'], ['reactivar', 'Despertar agente callado'], ['ayuda', 'Todos los comandos'],
].map(([command, description]) => ({ command, description }));

/** Cliente minimo de la Bot API: llamar(metodo, cuerpo) y enviar(chatId, salidas). */
function crearApi(token) {
  const API = `https://api.telegram.org/bot${token}`;
  async function llamar(metodo, cuerpo) {
    const r = await fetch(`${API}/${metodo}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo),
    });
    const j = await r.json();
    if (!j.ok) throw new Error(`${metodo}: ${j.description}`);
    return j.result;
  }
  async function enviar(chatId, salidas) {
    for (const s of salidas) {
      for (const m of renderTelegram(s)) {
        try {
          await llamar('sendMessage', { chat_id: chatId, text: m.texto, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: m.markup });
        } catch (e) {
          console.error(e.message);
        }
      }
    }
  }
  return { llamar, enviar };
}

/** Respuesta de la oficina, con la busqueda en Notion cuando se pide (es lo unico asincrono). */
async function responder(oficina, entrada, notion) {
  const pedido = oficina.pedidoNotion && oficina.pedidoNotion(entrada);
  if (!pedido) return oficina.recibir(entrada);
  if (pedido.sinExpediente) return [{ texto: 'Primero abre o elige un expediente (/agentes) y despues trae sus datos de Notion.' }];
  if (!notion) return [{ texto: 'Notion todavia no esta conectado al bot (falta NOTION_TOKEN).' }];
  try {
    return oficina.aplicarNotion(entrada, pedido.k, await notion.datosKOL(pedido.nombre));
  } catch (e) {
    return [{ titulo: '📥 Notion', texto: `No pude leer Notion: ${e.message}` }];
  }
}

/** Procesa un update de Telegram (polling o webhook) contra la oficina. */
async function procesarUpdate(oficina, up, { llamar, enviar }, notion = null) {
  if (up.callback_query) {
    const q = up.callback_query;
    llamar('answerCallbackQuery', { callback_query_id: q.id }).catch(() => {});
    const chat = q.message.chat.id;
    const salidas = await responder(oficina, { usuario: { id: q.from.id, nombre: q.from.first_name }, boton: q.data }, notion);
    oficina.registrarChat(q.from.id, chat);
    await enviar(chat, salidas);
  } else if (up.message) {
    const m = up.message;
    if (m.chat.type !== 'private') return; // material interno: solo en privado
    let foto = null;
    if (m.photo && m.photo.length) foto = { id: m.photo[m.photo.length - 1].file_id };
    else if (m.document && /^image\//.test(m.document.mime_type || '')) foto = { id: m.document.file_id };
    const salidas = await responder(oficina, { usuario: { id: m.from.id, nombre: m.from.first_name }, texto: m.text || m.caption || '', foto }, notion);
    oficina.registrarChat(m.from.id, m.chat.id);
    await enviar(m.chat.id, salidas);
  }
}

/** Envia los avisos de plazos vencidos y el recordatorio diario. */
async function enviarPlazos(oficina, { enviar }) {
  for (const aviso of oficina.revisarPlazos()) {
    const chat = oficina.chatDe(aviso.usuario);
    if (chat) await enviar(chat, aviso.salidas);
  }
}

const permitidosEnv = () => (process.env.ACTIVACION_PERMITIDOS || '').split(',').map((x) => x.trim()).filter(Boolean);

async function main() {
  cargarEnv();
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('HALT: falta TELEGRAM_BOT_TOKEN (crea el bot con @BotFather y ponlo en .env).');
    process.exit(1);
  }
  const permitidos = permitidosEnv();
  if (!permitidos.length) {
    console.warn('AVISO: ACTIVACION_PERMITIDOS esta vacio. Cualquiera que encuentre el bot puede usarlo, y es material INTERNO. Agrega los IDs de Telegram del equipo BD.');
  }
  const oficina = crearOficina({ permitidos });
  const api = crearApi(token);
  const notion = process.env.NOTION_TOKEN ? require('./notion').crearNotion() : null;

  // En modo polling no puede haber webhook activo.
  await api.llamar('deleteWebhook', {}).catch((e) => console.error(e.message));
  await api.llamar('setMyCommands', { commands: COMANDOS }).catch((e) => console.error(e.message));

  // Alertas de plazos y recordatorio diario del tracker.
  setInterval(() => enviarPlazos(oficina, api).catch((e) => console.error(e)), 15 * 60 * 1000);

  console.log('Oficina ALICE AI corriendo en Telegram. Ctrl+C para detener.');
  let offset = 0;
  for (;;) {
    let updates = [];
    try {
      updates = await api.llamar('getUpdates', { offset, timeout: 30, allowed_updates: ['message', 'callback_query'] });
    } catch (e) {
      console.error(e.message);
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    for (const up of updates) {
      offset = up.update_id + 1;
      try {
        await procesarUpdate(oficina, up, api, notion);
      } catch (e) {
        console.error('Error procesando update:', e);
      }
    }
  }
}

if (require.main === module) main();

module.exports = { renderTelegram, COMANDOS, crearApi, procesarUpdate, enviarPlazos, permitidosEnv };
