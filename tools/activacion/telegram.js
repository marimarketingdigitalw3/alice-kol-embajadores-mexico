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

async function main() {
  cargarEnv();
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('HALT: falta TELEGRAM_BOT_TOKEN (crea el bot con @BotFather y ponlo en .env).');
    process.exit(1);
  }
  const permitidos = (process.env.ACTIVACION_PERMITIDOS || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!permitidos.length) {
    console.warn('AVISO: ACTIVACION_PERMITIDOS esta vacio. Cualquiera que encuentre el bot puede usarlo, y es material INTERNO. Agrega los IDs de Telegram del equipo BD.');
  }
  const motor = crearOficina({ permitidos });
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

  await llamar('setMyCommands', {
    commands: [
      ['oficina', 'Menu de la oficina'], ['llamada', 'Primera llamada confirmada'], ['pipeline', 'Todo el embudo'],
      ['outreach', 'Escritorio de Outreach'], ['calificacion', 'Escritorio de Calificacion'], ['activacion', 'Escritorio de Activacion'],
      ['paso', 'Paso actual con guiones'], ['agentes', 'Tus expedientes'],
      ['estado', 'Hitos, plazos y blocker'], ['checklist', 'C1 a C8 con pruebas'], ['bloqueo', 'Donde se atoro'],
      ['escalar', 'Armar escalamiento'], ['faq', 'Preguntas del agente'], ['resumen', 'Version para el grupo'],
      ['nodecir', 'Lo que nunca se dice'], ['numeros', 'Cifras clave'], ['tbc', 'Pendientes de confirmar'],
      ['subagentes', 'Subagentes (despues de M4)'], ['reactivar', 'Despertar agente callado'], ['ayuda', 'Todos los comandos'],
    ].map(([command, description]) => ({ command, description })),
  }).catch((e) => console.error(e.message));

  // Alertas de plazos y recordatorio diario del tracker.
  setInterval(async () => {
    for (const aviso of motor.revisarPlazos()) {
      const chat = motor.chatDe(aviso.usuario);
      if (chat) await enviar(chat, aviso.salidas);
    }
  }, 15 * 60 * 1000);

  console.log('Oficina ALICE AI corriendo en Telegram. Ctrl+C para detener.');
  let offset = 0;
  for (;;) {
    let updates = [];
    try {
      updates = await llamar('getUpdates', { offset, timeout: 30, allowed_updates: ['message', 'callback_query'] });
    } catch (e) {
      console.error(e.message);
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    for (const up of updates) {
      offset = up.update_id + 1;
      try {
        if (up.callback_query) {
          const q = up.callback_query;
          llamar('answerCallbackQuery', { callback_query_id: q.id }).catch(() => {});
          const chat = q.message.chat.id;
          const salidas = motor.recibir({ usuario: { id: q.from.id, nombre: q.from.first_name }, boton: q.data });
          motor.registrarChat(q.from.id, chat);
          await enviar(chat, salidas);
        } else if (up.message) {
          const m = up.message;
          if (m.chat.type !== 'private') continue; // material interno: solo en privado
          let foto = null;
          if (m.photo && m.photo.length) foto = { id: m.photo[m.photo.length - 1].file_id };
          else if (m.document && /^image\//.test(m.document.mime_type || '')) foto = { id: m.document.file_id };
          const salidas = motor.recibir({ usuario: { id: m.from.id, nombre: m.from.first_name }, texto: m.text || m.caption || '', foto });
          motor.registrarChat(m.from.id, m.chat.id);
          await enviar(m.chat.id, salidas);
        }
      } catch (e) {
        console.error('Error procesando update:', e);
      }
    }
  }
}


if (require.main === module) main();

module.exports = { renderTelegram };
