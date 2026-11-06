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
  [/^posting frequency/i, 'dcPostsSemana', 'dcPostsComo'],
  [/^6-month subscriber growth/i, 'dcCrecimiento', null],
  [/^unique speakers/i, 'dcHablantes', 'dcHablantesComo'],
  [/^avg\.? messages per day/i, 'dcMensajesDia', 'dcMensajesComo'],
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
      const m = limpio(l).match(/^(Reason for selection|Bottom line)\s*:\s*(.+)$/i);
      if (m) poner(/reason/i.test(m[1]) ? 'razonPrincipales' : 'conclusion', m[2]);
    }
  }
  derivados(lineas, c);
  if (c.tasaAprobada) {
    const n = c.tasaAprobada.match(/(\d+(?:[.,]\d+)?)\s*%/);
    if (n) c.tasa = n[1].replace(',', '.');
  }
  return c;
}

const SI = /^\s*(?:[✓✔✅☑]|(?:yes|si|sí|true)(?![a-z]))/i;
const NO = /^\s*(?:[✗✘❌☐]|(?:no|none|ninguno|ninguna|not seen|no se vio|false)(?![a-z]))/i;
const siNo = (t) => (SI.test(t) ? 'si' : NO.test(t) ? 'no' : null);
const numero = (t) => { const m = String(t).replace(/,/g, '').match(/\d+(?:\.\d+)?/); return m ? m[0] : null; };

/** Lo que el DD dice en texto libre (scorecard, cinco numeros, vetos, prueba rapida, roles). */
function derivados(lineas, c) {
  const poner = (k, v) => { if (k && v !== null && v !== undefined && String(v).trim() !== '' && c[k] === undefined) c[k] = String(v).trim(); };
  const inventario = [];
  for (const bruta of lineas) {
    const l = limpio(bruta);
    // Scorecard A-F: "A · Members talk ... (15): ✓ 15. evidencia"
    const sc = l.match(/^[-•]?\s*([A-F])\s*·[^:]*\(\d+\)\s*:\s*(.*)$/);
    if (sc) { poner(`sc${sc[1]}`, siNo(sc[2])); continue; }
    const bonus = l.match(/^[-•]?\s*Bonus[^:]*:\s*\+?\s*(\d+)\.?\s*(.*)$/i);
    if (bonus) { poner('bonus', bonus[1]); poner('bonusMotivo', bonus[2]); continue; }
    const cinco = l.match(/^Five numbers[^:]*:\s*(.*)$/i);
    if (cinco) {
      const partes = cinco[1].split(';').map((x) => x.trim());
      const valor = (t) => (t.includes(':') ? t.split(':').slice(1).join(':') : t).split(/\.\s+(?=[A-Z])/)[0];
      ['mensajes', 'personas', 'top5', 'boletos', 'menciones'].forEach((k, i) => { if (partes[i]) poner(k, numero(valor(partes[i]))); });
      continue;
    }
    const veto = l.match(/^Veto check[^:]*:\s*(.*)$/i);
    if (veto) {
      const items = veto[1].split(/\(\d\)/).slice(1);
      ['vetoRegion', 'vetoMenores', 'vetoEstafa', 'vetoSoloAdmins', 'vetoAyuda'].forEach((k, i) => {
        if (!items[i]) return;
        const resp = items[i].split(':').slice(1).join(':');
        poner(k, siNo(resp));
      });
      continue;
    }
    const quick = l.match(/^Quick test:\s*(.*)$/i);
    if (quick) {
      const items = quick[1].split(/\(\d\)/).slice(1);
      ['pf1', 'pf2', 'pf3', 'pf4', 'pf5'].forEach((k, i) => {
        if (!items[i]) return;
        const resp = items[i].split('?').slice(1).join('?');
        poner(k, siNo(resp));
      });
      continue;
    }
    const tipo = l.match(/^Group type[^:]*:\s*(.*)$/i);
    if (tipo) {
      const t = tipo[1].toLowerCase();
      const k = /casino|slot/.test(t) ? 'casino' : /licen|sportsbook chat|casa/.test(t) ? 'casa' : /spam/.test(t) ? 'spam'
        : /esport/.test(t) ? 'esports' : /tipster/.test(t) ? 'tipster' : /small|chico|owner/.test(t) ? 'chico' : null;
      poner('tipoGrupo', k);
      continue;
    }
    const prim = l.match(/^Primary channels selected[^:]*:\s*(.*?)(?:\s*Reason for selection:\s*(.*))?$/i);
    if (prim) { poner('principales', prim[1].replace(/\.\s*$/, '')); poner('razonPrincipales', prim[2]); continue; }
    const canal1 = l.match(/^Channel\s*(?:①|1)\s*:\s*(.*)$/i);
    if (canal1) {
      poner('dcNombre', canal1[1]);
      poner('dcTipo', /view counter|\bchannel\b/i.test(canal1[1]) ? 'canal' : /\bgroup\b/i.test(canal1[1]) ? 'grupo' : null);
      poner('dcPublico', /\bprivate|invite/i.test(canal1[1]) ? 'no' : /\bpublic\b/i.test(canal1[1]) ? 'si' : null);
      continue;
    }
    if (/☑\s*Telegram channel/i.test(l)) poner('tipoCanal', 'canal');
    else if (/☑\s*Telegram group/i.test(l)) poner('tipoCanal', 'grupo');
    const roles = l.match(/^Roles:\s*(.*)$/i);
    if (roles) { poner('personasClave', roles[1]); continue; }
    const comp = l.match(/^Competitors[^:]*:\s*(.*?)(?:\.\s*Player complaints[^:]*:\s*(.*))?$/i);
    if (comp) { poner('competidores', comp[1]); poner('quejas', comp[2]); continue; }
    // Inventario (seccion 4): "# | Nombre | Link | Seguidores | Tipo"
    const cel = bruta.split(' | ').map(limpio);
    if (cel.length === 5 && /^\d+$/.test(cel[0]) && cel[1]) inventario.push(`${cel[1]} · ${cel[2]} · ${cel[3]} · ${cel[4]}`);
    if (cel.length === 2 && /^type$/i.test(cel[0])) poner('dcTipo', /(☑|✅|\[x\])\s*channel/i.test(cel[1]) ? 'canal' : /(☑|✅|\[x\])\s*group/i.test(cel[1]) ? 'grupo' : null);
    if (cel.length === 2 && /^publicly verifiable/i.test(cel[0])) poner('dcPublico', /(☑|✅|\[x\])\s*public/i.test(cel[1]) ? 'si' : /(☑|✅|\[x\])\s*private/i.test(cel[1]) ? 'no' : null);
  }
  if (inventario.length) poner('inventario', inventario.join('\n'));
  // El texto que sigue al titulo "Summary" es el resumen final del DD.
  const iSum = lineas.findIndex((x) => /^summary$/i.test(limpio(x)));
  if (iSum >= 0) {
    const sig = lineas.slice(iSum + 1).find((x) => limpio(x));
    if (sig && !/^appendix/i.test(limpio(sig))) poner('resumen', limpio(sig));
  }
  // Prueba de 2 minutos del paso "Entrar al grupo": sale del mismo scorecard.
  // "Hablan de partidos, momios y apuestas?" es sobre el contenido: basta con que se hable de apuestas (A, B o C).
  if (c.scA || c.scB || c.scC) poner('t2Partidos', [c.scA, c.scB, c.scC].includes('si') ? 'si' : 'no');
  if (c.scD) poner('t2Boletos', c.scD);
  if (c.scE) poner('t2Owner', c.scE);
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
