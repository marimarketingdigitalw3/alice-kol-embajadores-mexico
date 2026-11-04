'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { crearNotion, camposDD } = require('../notion');
const { crearOficina } = require('../oficina');
const { storeMemoria } = require('../store');
const { procesarUpdate } = require('../telegram');

const rt = (t) => [{ plain_text: t }];
const fila = (...c) => ({ id: Math.random().toString(36), type: 'table_row', has_children: false, table_row: { cells: c.map(rt) } });
const parrafo = (t) => ({ id: Math.random().toString(36), type: 'paragraph', has_children: false, paragraph: { rich_text: rt(t) } });

const BLOQUES = {
  dd1: [
    parrafo('**Bottom line:** canal chico pero con chat real; trato de prueba.'),
    { id: 't1', type: 'table', has_children: true, table: {} },
    { id: 't2', type: 'table', has_children: true, table: {} },
  ],
  t1: [
    fila('Item', 'Entry'),
    fila('Lead source (specify person / occasion / platform; "referred by a friend" is not accepted)', 'Juan Esteban Sierra, por Telegram DM el 12 de octubre'),
    fila('Lead provider', 'Juanes'),
    fila('Negotiator', 'María del Mar Borrero'),
    fila('Date of first contact', '12/10/2026, DM por Telegram'),
    fila('Nickname / Telegram handle', '@tgbets'),
    fila('Approved commission rate', '18% sobre ingreso neto'),
  ],
  t2: [fila('Metric', 'Value', 'How obtained'), fila('Subscribers (as displayed)', '12.400', 'Contador del canal, 3/11/2026')],
};

function fakeFetch(url, opts) {
  const ok = (j) => Promise.resolve({ ok: true, json: () => Promise.resolve(j) });
  if (url.endsWith('/search')) {
    return ok({ results: [
      { id: 'dd1', object: 'page', url: 'https://notion.so/dd1', last_edited_time: '2026-11-01', parent: { type: 'page_id' },
        properties: { title: { type: 'title', title: rt('Alice · Sub-Agent Channel Due Diligence Form - KOL - Tomás Guiral') } } },
      { id: 'ddcopia', object: 'page', url: 'https://notion.so/ddcopia', last_edited_time: '2026-11-03', parent: { type: 'page_id' },
        properties: { title: { type: 'title', title: rt('Alice · Sub-Agent Channel Due Diligence Form - KOL - Tomás Guiral (1)') } } },
      { id: 'otro', object: 'page', url: 'https://notion.so/otro', last_edited_time: '2026-11-04', parent: { type: 'page_id' },
        properties: { title: { type: 'title', title: rt('Due Diligence Form - KOL - Tomás Pérez') } } },
      { id: 'tr1', object: 'page', url: 'https://notion.so/tr1', parent: { type: 'database_id' },
        properties: { Channel: { type: 'title', title: rt('Tomas Guiral · TG Bets') }, Region: { type: 'rich_text', rich_text: rt('México') },
          Model: { type: 'select', select: { name: 'Referral link' } }, 'Channel Type': { type: 'select', select: { name: 'Telegram channel' } },
          Upline: { type: 'rich_text', rich_text: rt('platform') }, 'Starting Rate': { type: 'rich_text', rich_text: rt('15%') } } },
    ] });
  }
  const m = url.match(/\/blocks\/([^/]+)\/children/);
  return ok({ results: BLOQUES[m[1]] || [], has_more: false });
}

test('lee el DD y el tracker y los traduce a campos del bot', async () => {
  const n = crearNotion({ token: 'x', fetchImpl: fakeFetch });
  const r = await n.datosKOL('Tomas Guiral · TG Bets');
  assert.strictEqual(r.buscado, 'Tomas Guiral');
  assert.ok(r.dd && r.tracker);
  assert.strictEqual(r.campos.fuente, 'Juan Esteban Sierra, por Telegram DM el 12 de octubre');
  assert.strictEqual(r.campos.negociador, 'María del Mar Borrero');
  assert.strictEqual(r.campos.nickname, '@tgbets');
  assert.strictEqual(r.campos.tasa, '18'); // la tasa aprobada del DD manda sobre la del tracker
  assert.strictEqual(r.campos.modelo, 'referido');
  assert.strictEqual(r.campos.tipoCanal, 'canal');
  assert.strictEqual(r.campos.dcSuscriptores, '12.400');
  assert.strictEqual(r.campos.conclusion, 'canal chico pero con chat real; trato de prueba.');
  assert.ok(!('fuente' in camposDD(['Lead source | ']))); // celdas vacias no se toman
});

test('el bot ofrece el dato de Notion en la pregunta y lo valida igual', async () => {
  const oficina = crearOficina({ stores: { oficina: storeMemoria(), activacion: storeMemoria(), calificacion: storeMemoria() } });
  const u = { id: 1, nombre: 'Maria' };
  oficina.recibir({ usuario: u, texto: '/calificacion' });
  oficina.motores.c.importar(u, { nombre: 'Tomas Guiral · TG Bets' });
  const enviados = [];
  const api = { llamar: async () => ({}), enviar: async (chat, s) => enviados.push(...s) };
  const notion = crearNotion({ token: 'x', fetchImpl: fakeFetch });
  await procesarUpdate(oficina, { callback_query: { id: 'q', from: { id: 1, first_name: 'Maria' }, message: { chat: { id: 9 } }, data: 'c|notion' } }, api, notion);
  assert.match(enviados.map((s) => s.texto).join('\n'), /Traje \d+ datos/);

  const paso = oficina.recibir({ usuario: u, boton: 'c|h' });
  const preg = paso.find((s) => /Fuente del lead/.test(s.texto || ''));
  assert.match(preg.texto, /En Notion: «Juan Esteban Sierra/);
  assert.ok(preg.botones.flat().some((b) => b.d === 'c|nt'));
  const sig = oficina.recibir({ usuario: u, boton: 'c|nt' });
  assert.ok(sig.some((s) => /Quien trajo el lead/.test(s.texto || '')));
  const estado = oficina.recibir({ usuario: u, texto: '/estado' });
  assert.ok(!/频道|代理/.test(estado.map((s) => s.texto).join('\n')));
});
