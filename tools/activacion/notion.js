'use strict';

/**
 * Lee de Notion los datos de un KOL para no volver a escribirlos en el bot:
 *   - su "Due Diligence Form - KOL - [Nombre]" (secciones 1 a 8 de la plantilla oficial), y
 *   - su fila en el "Channel Activation Tracker" (Region, Model, Starting Rate, Upline, Signed On...).
 *
 * Solo lee. Usa una integracion interna de Notion (NOTION_TOKEN) con acceso a esas paginas.
 * Los datos no se dan por buenos solos: el bot los ofrece como respuesta sugerida en cada
 * pregunta y siguen pasando por las mismas validaciones.
 */

const VERSION = '2022-06-28';

function crearNotion({ token = process.env.NOTION_TOKEN, fetchImpl = (...a) => fetch(...a) } = {}) {
  async function api(metodo, ruta, cuerpo) {
    if (!token) throw new Error('Falta conectar Notion (NOTION_TOKEN).');
    const r = await fetchImpl(`https://api.notion.com/v1${ruta}`, {
      method: metodo,
      headers: { authorization: `Bearer ${token}`, 'notion-version': VERSION, 'content-type': 'application/json' },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    const j = await r.json();
    if (!r.ok) throw new Error(`Notion: ${j.message || r.status}`);
    return j;
  }

  const textoRico = (rt) => (rt || []).map((t) => t.plain_text).join('');

  function tituloPagina(p) {
    for (const v of Object.values(p.properties || {})) if (v.type === 'title') return textoRico(v.title);
    return '';
  }

  async function hijos(id) {
    const out = [];
    let cursor;
    do {
      const j = await api('GET', `/blocks/${id}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`);
      out.push(...j.results);
      cursor = j.has_more ? j.next_cursor : null;
    } while (cursor);
    return out;
  }

  /** La pagina como lineas de texto; las filas de tabla quedan como "celda | celda | ...". */
  async function lineas(id, prof = 0) {
    const out = [];
    for (const b of await hijos(id)) {
      const c = b[b.type] || {};
      if (b.type === 'table_row') out.push(c.cells.map(textoRico).join(' | '));
      else if (c.rich_text) out.push(textoRico(c.rich_text));
      if (b.has_children && prof < 3 && b.type !== 'child_page' && b.type !== 'child_database') out.push(...(await lineas(b.id, prof + 1)));
    }
    return out;
  }

  async function buscar(query, filtro, max = 100) {
    const out = [];
    let cursor;
    do {
      const j = await api('POST', '/search', { query, page_size: 100, filter: { property: 'object', value: filtro }, ...(cursor ? { start_cursor: cursor } : {}) });
      out.push(...j.results);
      cursor = j.has_more && out.length < max ? j.next_cursor : null;
    } while (cursor);
    return out;
  }

  /** Busca con varias consultas (nombre del KOL, sin tildes, primer nombre) y junta sin repetir. */
  async function buscarVarias(consultas, filtro) {
    const vistos = new Map();
    for (const q of [...new Set(consultas.filter(Boolean))]) {
      for (const p of await buscar(q, filtro, 100)) vistos.set(p.id, p);
    }
    return [...vistos.values()];
  }

  /** Pagina del DD de un KOL: el titulo debe decir "Due Diligence" y el nombre del KOL. */
  async function buscarDD(nombre) {
    const nucleo = nucleoNombre(nombre);
    const paginas = await buscarVarias(['Due Diligence Form', nucleo, sinTildes(nucleo)], 'page');
    const dd = paginas
      .map((p) => ({ p, t: tituloPagina(p) }))
      .filter(({ t }) => /due diligence/i.test(t) && coincide(t, nucleo));
    if (!dd.length) return null;
    // Si hay copias ("... (1)"), manda la original y, entre iguales, la editada mas reciente.
    dd.sort((a, b) => (/\(\d+\)\s*$/.test(a.t) - /\(\d+\)\s*$/.test(b.t)) || (new Date(b.p.last_edited_time) - new Date(a.p.last_edited_time)));
    return { id: dd[0].p.id, titulo: dd[0].t, url: dd[0].p.url, lineas: await lineas(dd[0].p.id), copias: dd.length };
  }

  /** Fila del KOL en el tracker de activacion (base de datos con columna Channel). */
  async function buscarTracker(nombre) {
    const nucleo = nucleoNombre(nombre);
    const paginas = await buscarVarias([nucleo, sinTildes(nucleo), nucleo.split(' ')[0]], 'page');
    const filas = paginas.filter((p) => p.parent && (p.parent.type === 'database_id' || p.parent.type === 'data_source_id')
      && p.properties && p.properties.Channel && coincide(tituloPagina(p), nucleo));
    if (!filas.length) return null;
    filas.sort((a, b) => new Date(b.last_edited_time || 0) - new Date(a.last_edited_time || 0));
    const props = filas[0].properties;
    const val = (k) => {
      const v = props[k];
      if (!v) return '';
      if (v.type === 'select') return v.select ? v.select.name : '';
      if (v.type === 'date') return v.date ? v.date.start : '';
      if (v.type === 'rich_text') return textoRico(v.rich_text);
      if (v.type === 'title') return textoRico(v.title);
      return '';
    };
    return {
      url: filas[0].url,
      region: val('Region'), channelType: val('Channel Type'), model: val('Model'), signedOn: val('Signed On'),
      stage: val('Stage'), startingRate: val('Starting Rate'), upline: val('Upline'), blocker: val('Blocker'), nextAction: val('Next Action'),
    };
  }

  /** Todo lo que Notion sabe del KOL, ya traducido a los campos del bot. */
  async function datosKOL(nombre) {
    const [dd, tr] = await Promise.all([buscarDD(nombre), buscarTracker(nombre)]);
    return { buscado: nucleoNombre(nombre), dd: dd ? { titulo: dd.titulo, url: dd.url, copias: dd.copias } : null, tracker: tr ? { url: tr.url } : null, campos: { ...camposTracker(tr), ...camposDD(dd ? dd.lineas : []) } };
  }

  return { buscarDD, buscarTracker, datosKOL };
}

const sinTildes = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
/** Nombre del KOL sin el canal ni aclaraciones: "Tomas Guiral · TG Bets" -> "Tomas Guiral". */
const nucleoNombre = (s) => String(s || '').split(/\s[·|–—-]\s|\(|\//)[0].trim() || String(s || '').trim();
/** El titulo contiene todas las palabras del nombre (sin tildes ni mayusculas). */
const coincide = (titulo, nucleo) => {
  const t = ` ${normal(titulo)} `;
  const palabras = normal(nucleo).split(' ').filter((w) => w.length > 1);
  return palabras.length > 0 && palabras.every((w) => t.includes(` ${w} `));
};
const normal = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

const VACIO = /^\s*(|-|—|\[.*\]|☐.*|n\/a)\s*$/i;
const limpio = (s) => String(s || '').replace(/\*\*/g, '').trim();

// Etiqueta de la plantilla (fila de tabla, columna 1) -> campo(s) del bot.
const FILAS_2 = [
  [/^lead source/i, 'fuente'],
  [/^lead provider/i, 'proveedor'],
  [/^negotiator$/i, 'negociador'],
  [/^date of first contact/i, 'primerContacto'],
  [/^nickname|telegram handle/i, 'nickname'],
  [/^other contact/i, 'otrosContactos'],
  [/^regions? covered/i, 'regionClientes'],
  [/^platforms currently/i, 'plataformaActual'],
  [/^how long partnered/i, 'tiempoAlianza'],
  [/^current commission/i, 'comisionActual'],
  [/^sub-?agents under/i, 'subagentes'],
  [/relationship with alice/i, 'relacionAlice'],
  [/^channel name/i, 'dcNombre'],
  [/^proposed commission/i, 'tasaPropuesta'],
  [/^proposed first launch/i, 'canalesLanzamiento'],
  [/^proposed trial budget/i, 'presupuestoPrueba'],
  [/^est\.? first-month ggr/i, 'ggrEstimado'],
  [/^identified risks/i, 'riesgos'],
  [/^red flag explanations/i, 'explicacionBanderas'],
  [/^information not obtained/i, 'pendientes'],
  [/^approved commission rate/i, 'tasaAprobada'],
];
// Seccion 5: Metrica | Valor | Como se obtuvo.
const FILAS_3 = [
  [/^subscribers \(as displayed\)/i, 'dcSuscriptores', 'dcSuscriptoresComo'],
  [/^verified subscribers/i, 'dcVerificados', 'dcVerificadosComo'],
  [/^avg\.? views/i, 'dcVistas', 'dcVistasComo'],
  [/^posting frequency/i, 'dcPosts', 'dcPostsComo'],
  [/^6-month subscriber growth/i, 'dcCrecimiento', null],
  [/^unique speakers/i, 'dcHablantes', 'dcHablantesComo'],
  [/^avg\.? messages per day/i, 'dcMensajes', 'dcMensajesComo'],
];
// Seccion 6: Item | Lo que dice | Lo verificado | Metodo.
const FILAS_4 = [
  [/^age distribution/i, 'edad'], [/^main topics/i, 'temas'], [/^user profile/i, 'perfil'], [/^betting preferences/i, 'pref'],
  [/^est\.? average bet/i, 'apuesta'], [/^est\.? monthly active/i, 'activos'], [/^where they currently bet/i, 'donde'],
];

function camposDD(lineas) {
  const c = {};
  const poner = (k, v) => { if (k && !VACIO.test(limpio(v)) && !c[k]) c[k] = limpio(v); };
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    if (l.includes(' | ')) {
      const cel = l.split(' | ').map(limpio);
      const et = cel[0];
      if (cel.length === 2) for (const [re, k] of FILAS_2) if (re.test(et)) poner(k, cel[1]);
      if (cel.length === 3) for (const [re, k, kc] of FILAS_3) if (re.test(et)) { poner(k, cel[1]); poner(kc, cel[2]); }
      if (cel.length >= 4) for (const [re, b] of FILAS_4) if (re.test(et)) { poner(`${b}Dice`, cel[1]); poner(`${b}Verif`, cel[2]); poner(`${b}Metodo`, cel[3]); }
    } else {
      const m = limpio(l).match(/^(Primary channels selected[^:]*|Reason for selection|Bottom line)\s*:\s*(.+)$/i);
      if (m) poner(/primary/i.test(m[1]) ? 'principales' : /reason/i.test(m[1]) ? 'razonPrincipales' : 'conclusion', m[2]);
    }
  }
  if (c.tasaAprobada) {
    const n = c.tasaAprobada.match(/(\d+(?:[.,]\d+)?)\s*%/);
    if (n) c.tasa = n[1].replace(',', '.');
  }
  return c;
}

function camposTracker(t) {
  if (!t) return {};
  const c = {};
  if (t.region) c.region = t.region;
  if (t.upline) c.upline = t.upline;
  const rate = (t.startingRate || '').match(/(\d+(?:[.,]\d+)?)/);
  if (rate) c.tasa = rate[1].replace(',', '.');
  const modelo = { 'agent system': 'sistema', 'referral link': 'referido' }[(t.model || '').toLowerCase()];
  if (modelo) c.modelo = modelo;
  const tipo = { 'telegram channel': 'canal', 'telegram group': 'grupo', 'individual agent': 'sub', other: 'kol' }[(t.channelType || '').toLowerCase()];
  if (tipo) c.tipoCanal = tipo;
  if (t.signedOn) c.firmadoNotion = t.signedOn;
  return c;
}

module.exports = { crearNotion, camposDD, camposTracker, nucleoNombre, coincide };
