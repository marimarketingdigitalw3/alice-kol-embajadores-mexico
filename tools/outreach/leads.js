'use strict';

/**
 * Reglas de outreach sobre la pestana Leads: filtros de seguridad, tiers, cadencia, canal y cola
 * del dia. Funciones puras: reciben filas del sheet y una fecha, y no tocan nada externo.
 */

const T = require('./plantillas');

// Columnas de la pestana Leads (encabezado en la fila 4, datos desde la fila 5).
const FILA_INICIO = 5;
const COL = {
  num: 0, kol: 1, owner: 2, status: 3, perfilTipo: 4, pais: 5, plataforma: 6, seguidores: 7, perfil: 8,
  contacto: 9, tipoContacto: 10, score: 18, tier: 19, veto: 20, alerta: 21, porque: 22, evidencia: 23,
  next: 24, grupo: 25, notas: 32,
};
const LETRA = { status: 'D', next: 'Y', notas: 'AG' };
const LIMITE_PRIMEROS = 50;
const DIA = 24 * 3600 * 1000;

const MESES = {
  jan: 0, january: 0, enero: 0, feb: 1, february: 1, febrero: 1, mar: 2, march: 2, marzo: 2, apr: 3, april: 3, abril: 3,
  may: 4, mayo: 4, jun: 5, june: 5, junio: 5, jul: 6, july: 6, julio: 6, aug: 7, august: 7, agosto: 7,
  sep: 8, sept: 8, september: 8, septiembre: 8, oct: 9, october: 9, octubre: 9, nov: 10, november: 10, noviembre: 10,
  dec: 11, december: 11, diciembre: 11,
};

const limpio = (s) => String(s == null ? '' : s).trim();

// ------------------------------------------------------------------ fechas
/** Fecha de hoy en Colombia (UTC-5, sin horario de verano) a medianoche UTC, para contar dias. */
function hoyCol(ahora) {
  const t = new Date(ahora.getTime() - 5 * 3600 * 1000);
  return Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
}
const fmt = (ms) => { const d = new Date(ms); return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`; };
const dias = (desde, hasta) => Math.round((hasta - desde) / DIA);

const MARCA_MARIA = /mar[ií]a|@mariadelmarborrerog|mborrero@/i;
const ES_ENVIO = /first contact|primer contacto|follow-?up|followed up|seguimiento|messaged|we (?:sent|emailed|contacted|wrote|gave message)|contacted|emailed|escribimos|enviamos|contactamos/i;

/**
 * Lee Team Notes y devuelve los mensajes enviados: fechas, follow-ups hechos y si hay mensajes de
 * Maria. Acepta "September 18th", "Oct 1st" y lineas "Update D/M/AAAA: ...". Una fecha que va
 * justo despues de "Update" en ingles ("Update Oct 15:") es la fecha de la nota, no de un envio.
 */
function leerNotas(notas, hoy, { soloMaria = false } = {}) {
  const fechas = new Set();
  let fuExplicito = 0;
  let hayMaria = false;
  const anio = new Date(hoy).getUTCFullYear();
  for (const linea of String(notas || '').split(/\n+/)) {
    const esDeMaria = MARCA_MARIA.test(linea);
    if (esDeMaria && ES_ENVIO.test(linea)) hayMaria = true;
    if (soloMaria && !esDeMaria) continue;
    const up = linea.match(/^\s*update\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s*:?(.*)$/i);
    if (up) {
      if (ES_ENVIO.test(up[4]) && !/no (?:se )?(?:envi|sent)|not sent|bloquead/i.test(up[4])) {
        fechas.add(Date.UTC(+up[3], +up[2] - 1, +up[1]));
      }
    } else {
      const re = /(update\s+)?\b([a-záéíóú]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi;
      let m;
      while ((m = re.exec(linea))) {
        if (m[1]) continue;
        const mes = MESES[m[2].toLowerCase()];
        if (mes == null) continue;
        let f = Date.UTC(anio, mes, +m[3]);
        if (f > hoy + DIA) f = Date.UTC(anio - 1, mes, +m[3]);
        // Solo cuenta si la frase habla de un envio nuestro (no de cuando el lead escribio).
        const contexto = linea.slice(Math.max(0, m.index - 80), m.index);
        if (ES_ENVIO.test(contexto) || /\b(on|el)\s*$/i.test(contexto)) fechas.add(f);
      }
    }
    for (const fm of linea.matchAll(/follow-?up\s*(\d)/gi)) fuExplicito = Math.max(fuExplicito, +fm[1]);
  }
  const lista = [...fechas].sort((a, b) => a - b);
  const followups = Math.max(fuExplicito, lista.length ? lista.length - 1 : 0);
  return { fechas: lista, primero: lista[0] || null, ultimo: lista[lista.length - 1] || null, followups, hayMaria };
}

// ------------------------------------------------------------------ leads
function aLead(fila, i) {
  const v = (k) => limpio(fila[COL[k]]);
  return {
    fila: FILA_INICIO + i,
    num: v('num'), kol: v('kol'), owner: v('owner'), status: v('status'), pais: v('pais'), plataforma: v('plataforma'),
    seguidores: v('seguidores'), perfil: v('perfil'), contacto: v('contacto'), tipoContacto: v('tipoContacto'),
    score: Number(String(v('score')).replace(',', '.')) || 0, tier: v('tier').toUpperCase(), veto: v('veto'),
    alerta: v('alerta'), evidencia: v('evidencia'), next: v('next'), grupo: v('grupo'), notas: v('notas'),
  };
}
const leerLeads = (filas) => filas.map(aLead).filter((l) => l.num && l.kol);

/** Nombre para el saludo: sin emojis ni simbolos decorativos. */
function nombre(l) {
  const n = l.kol.replace(/[^\p{L}\p{N}\s.&'-]/gu, ' ').replace(/\s+/g, ' ').trim();
  return n || l.kol;
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/https?:\/\/(www\.)?/, '').replace(/[^a-z0-9@./]/g, '').replace(/\/$/, '');

// ------------------------------------------------------------------ canal
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;

/** Por donde se escribe al lead, desde que cuenta, y si se puede enviar o requiere accion manual. */
function canal(l) {
  const dc = l.contacto;
  const ct = l.tipoContacto.toLowerCase();
  const fuentes = [dc, l.perfil];
  if (/whatsapp/.test(ct) || /wa\.me|chat\.whatsapp/i.test(dc)) return { tipo: 'manual', motivo: 'WhatsApp: se escribe a mano.' };
  if (/web|form/.test(ct)) return { tipo: 'manual', motivo: 'Formulario web: se llena a mano.' };
  if (/discord/.test(ct)) return { tipo: 'manual', motivo: 'Discord: se escribe a mano.' };
  const mail = (dc.match(EMAIL_RE) || [])[0];
  if (mail && !/t\.me|instagram|x\.com|twitter/i.test(dc)) return { tipo: 'email', destino: mail, nombre: 'Email', cuenta: T.CUENTAS.email };
  for (const f of fuentes) {
    if (/t\.me\/(\+|joinchat)/i.test(f) && f === dc) {
      return { tipo: 'manual', motivo: 'Contacto directo faltante: el enlace es de un grupo, no del admin.' };
    }
    const tg = f.match(/t\.me\/([A-Za-z0-9_]{4,})/i);
    // Enlace de invitacion sin el "+" (ej. t.me/R6hCEqChlBg0YzAx): es un grupo privado, no un usuario.
    if (tg && /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z0-9]{14,}$/.test(tg[1])) {
      if (f === dc) return { tipo: 'manual', motivo: 'Contacto directo faltante: el enlace es una invitación a un grupo privado, no el usuario del admin.' };
      continue;
    }
    if (tg && (f === dc || /telegram/.test(ct))) return { tipo: 'telegram', destino: `@${tg[1]}`, nombre: 'Telegram DM', cuenta: T.CUENTAS.telegram };
    if (/instagram\.com\//i.test(f)) {
      const h = f.match(/instagram\.com\/([A-Za-z0-9_.]+)/i);
      return { tipo: 'instagram', destino: h ? `@${h[1]}` : f, nombre: 'Instagram DM', cuenta: T.CUENTAS.instagram };
    }
    if (/(x|twitter)\.com\//i.test(f)) {
      const h = f.match(/(?:x|twitter)\.com\/([A-Za-z0-9_]+)/i);
      return { tipo: 'x', destino: h ? `@${h[1]}` : f, nombre: 'X DM', cuenta: T.CUENTAS.x };
    }
    if (/tiktok\.com\//i.test(f)) {
      const h = f.match(/tiktok\.com\/@?([A-Za-z0-9_.]+)/i);
      return { tipo: 'tiktok', destino: h ? `@${h[1]}` : f, nombre: 'TikTok DM', cuenta: T.CUENTAS.tiktok };
    }
  }
  const handle = (dc.match(/@[A-Za-z0-9_.]{3,}/) || [])[0];
  if (handle) {
    if (/telegram/i.test(dc) || /telegram/.test(ct) || /telegram/i.test(l.plataforma)) return { tipo: 'telegram', destino: handle, nombre: 'Telegram DM', cuenta: T.CUENTAS.telegram };
    if (/instagram/i.test(ct + l.plataforma)) return { tipo: 'instagram', destino: handle, nombre: 'Instagram DM', cuenta: T.CUENTAS.instagram };
    if (/twitter|\bx\b/i.test(ct + ' ' + l.plataforma)) return { tipo: 'x', destino: handle, nombre: 'X DM', cuenta: T.CUENTAS.x };
    if (/tiktok/i.test(ct + l.plataforma)) return { tipo: 'tiktok', destino: handle, nombre: 'TikTok DM', cuenta: T.CUENTAS.tiktok };
  }
  if (/youtube/.test(ct)) return { tipo: 'manual', motivo: 'YouTube no tiene DMs y no hay correo: contacto directo faltante.' };
  return { tipo: 'manual', motivo: 'Contacto directo faltante.' };
}

// ------------------------------------------------------------------ filtros
const RE_NO_ESCRIBIR = /do not message|don'?t message|no (?:le )?escrib|no contactar|said no|dijo que no|not interested|no le interesa|check (?:that|the) thread|ya hab[ií]a mensajes|hilo previo|duplicate messages|by mistake|por error|menor(?:es)? de edad|minors?\b|underage/i;
const RE_AUN_NO = /do not contact yet|no contactar todav[ií]a|revisar antes de contactar/i;
const RE_EXCLUSIVIDAD = /exclusiv|bookmakers? or codes|c[oó]digo/i;
const RE_CHAT_ABIERTO = /open chat|chat abierto/i;
const RE_DESCARTAR = /rule out|do not insist|descartar|no insistir/i;
const RE_NUNCA_LLEGO = /never arrived|nunca lleg/i;

/** Motivo por el que un lead no se toca hoy (null si pasa los filtros de seguridad). */
function bloqueo(l) {
  if (l.tier === 'VETO' || l.veto) return `Veto: ${l.veto || 'tier Veto'}`;
  if (/closed/i.test(l.status)) return 'Cerrado (Closed - no).';
  if (/active/i.test(l.status)) return 'Ya firmado (Active): se gestiona en Activación.';
  if (RE_NO_ESCRIBIR.test(l.notas)) return 'Team Notes pide no escribir o revisar un hilo previo.';
  if (RE_DESCARTAR.test(l.next)) return `Next step: ${l.next}`;
  if (/^bloqueado:/i.test(l.next)) return `${l.next} (revisar a mano)`;
  return null;
}

// ------------------------------------------------------------------ cadencia
const PASOS = { primer: 'Primer contacto', fu1: 'Follow-up 1', fu2: 'Follow-up 2', fu3: 'Follow-up 3 (cierre suave)', manager: 'Primer contacto (manager o agencia)' };

/**
 * Que le toca hoy a un lead con Status = Contacted. Devuelve { paso } para enviar, { cerrar } si
 * pasaron mas de 25 dias, { faltaFecha } si las notas no tienen fecha, o null si hoy no toca nada.
 */
function cadencia(l, hoy, { soloMaria = false } = {}) {
  const n = leerNotas(l.notas, hoy, { soloMaria });
  if (!n.primero) return { faltaFecha: true };
  const d = dias(n.primero, hoy);
  if (n.ultimo === hoy) return null; // ya se le escribio hoy
  if (dias(n.ultimo, hoy) < 3) return null;
  const fu = n.followups;
  const info = { diasDesde: d, followups: fu, primero: n.primero };
  if (d > 25) {
    if (fu >= 3) return { cerrar: true, ...info };
    if (/follow and pause|last follow-?up|[uú]ltimo (?:follow|seguimiento)/i.test(l.next) && fu < 3) return { paso: 'fu3', ...info };
    return { cerrar: true, ...info };
  }
  if (fu === 0 && d >= 5) return { paso: 'fu1', ...info };
  if (fu === 1 && d >= 10) return { paso: 'fu2', ...info };
  if (fu === 2 && d >= 18) return { paso: 'fu3', ...info };
  return null;
}

// ------------------------------------------------------------------ mensaje
function mensaje(l, paso, c = canal(l)) {
  const n = nombre(l);
  const esEmail = c.tipo === 'email';
  const esManager = /manager|agency|agencia/i.test(l.tipoContacto);
  let texto;
  if (paso === 'primer' && esManager) texto = T.manager(n, esEmail);
  else texto = (esEmail ? T.email : T.dm)[paso](n);
  const asunto = esEmail ? (paso === 'primer' ? T.ASUNTO : `Re: ${T.ASUNTO}`) : null;
  return { texto, asunto, etiqueta: paso === 'primer' && esManager ? PASOS.manager : PASOS[paso] };
}

// ------------------------------------------------------------------ cola
function grupoPais(pais) {
  const p = pais.toLowerCase();
  if (/^m[eé]xico$/.test(p)) return 1;
  if (/m[eé]xico/.test(p) || /spanish/.test(p)) return 2;
  return 3;
}

function orden(a, b) {
  const g = (l) => (l.tier === 'A' ? 0 : grupoPais(l.pais));
  return g(a) - g(b) || b.score - a.score || (b.evidencia === 'High') - (a.evidencia === 'High');
}

/** Cuantos primeros contactos ya se registraron hoy (en Team Notes, por el bot o la tarea). */
function primerosDeHoy(leads, hoy) {
  const marca = new RegExp(`update\\s+${fmt(hoy).replace(/\//g, '\\/')}\\s*:[^\\n]*(primer contacto|first contact)`, 'i');
  return leads.filter((l) => marca.test(l.notas)).length;
}

/**
 * Arma el trabajo del dia en el orden de la tarea programada: respuestas, follow-ups, primera
 * vuelta (Owner Maria) y segunda vuelta (Owner Juanes), con todos los filtros y alertas.
 */
function armarDia(leads, ahora = new Date()) {
  const hoy = hoyCol(ahora);
  const r = { hoy, respuestas: [], juanesAbiertas: [], followups: [], primeros: [], cerrar: [], exclusividad: [], faltaFecha: [], manual: [], bloqueados: [], duplicados: [] };

  // Duplicados: mismo nombre o mismo contacto en varias filas.
  const claves = new Map();
  for (const l of leads) {
    for (const k of [norm(l.kol), norm(l.contacto)].filter((x) => x.length > 3)) {
      if (!claves.has(k)) claves.set(k, []);
      claves.get(k).push(l);
    }
  }
  const gemelos = (l) => {
    const s = new Set();
    for (const k of [norm(l.kol), norm(l.contacto)].filter((x) => x.length > 3)) for (const o of claves.get(k) || []) if (o !== l) s.add(o);
    return [...s];
  };

  for (const l of leads) {
    const esMaria = /^mar[ií]a$/i.test(l.owner);
    const esJuanes = /^juanes$/i.test(l.owner);
    const st = l.status.toLowerCase();

    if (/replied|in conversation/.test(st)) {
      if (bloqueo(l) && /closed/i.test(l.status)) continue;
      (esMaria ? r.respuestas : r.juanesAbiertas).push(l);
      continue;
    }
    const b = bloqueo(l);
    if (b) { if (!/closed/i.test(l.status)) r.bloqueados.push({ l, motivo: b }); continue; }
    if (!['A', 'B'].includes(l.tier)) continue; // Tier C: sin mensajes nuevos
    const c = canal(l);

    // Juanes contactado pero el mensaje nunca llego: cuenta como no contactado.
    const noContactado = st === 'not contacted' || (esJuanes && RE_NUNCA_LLEGO.test(l.notas) && !leerNotas(l.notas, hoy).hayMaria);

    if (noContactado) {
      if (RE_AUN_NO.test(l.notas)) { r.bloqueados.push({ l, motivo: 'Team Notes: no contactar todavía.' }); continue; }
      if (RE_EXCLUSIVIDAD.test(l.alerta)) { r.exclusividad.push(l); continue; }
      const otros = gemelos(l);
      if (otros.some((o) => !/not contacted/i.test(o.status))) { r.duplicados.push({ l, otros }); continue; }
      const mejor = otros.filter((o) => /not contacted/i.test(o.status)).every((o) => o.score < l.score || (o.score === l.score && +o.num > +l.num));
      if (!mejor) { r.duplicados.push({ l, otros }); continue; }
      if (c.tipo === 'manual') { r.manual.push({ l, motivo: c.motivo }); continue; }
      if (esMaria || esJuanes) r.primeros.push({ l, paso: 'primer', vuelta: esMaria ? 1 : 2, canal: c });
      continue;
    }

    if (st === 'contacted') {
      if (esMaria) {
        const k = cadencia(l, hoy);
        if (!k) continue;
        if (k.faltaFecha) { r.faltaFecha.push(l); continue; }
        if (k.cerrar) { r.cerrar.push({ l, ...k }); continue; }
        if (c.tipo === 'manual') { r.manual.push({ l, motivo: c.motivo }); continue; }
        r.followups.push({ l, paso: k.paso, canal: c, ...k });
      } else if (esJuanes) {
        const n = leerNotas(l.notas, hoy);
        if (n.hayMaria) {
          // Ya entro a la cadencia de Maria: se cuenta desde el mensaje de Maria.
          const k = cadencia(l, hoy, { soloMaria: true });
          if (!k || k.faltaFecha) continue;
          if (k.cerrar) { r.cerrar.push({ l, ...k }); continue; }
          if (c.tipo === 'manual') { r.manual.push({ l, motivo: c.motivo }); continue; }
          r.followups.push({ l, paso: k.paso, canal: c, ...k });
        } else if (n.ultimo && dias(n.ultimo, hoy) >= 7) {
          if (RE_EXCLUSIVIDAD.test(l.alerta)) { r.exclusividad.push(l); continue; }
          if (c.tipo === 'manual') { r.manual.push({ l, motivo: c.motivo }); continue; }
          r.primeros.push({ l, paso: 'primer', vuelta: 2, canal: c, desdeJuanes: true });
        }
      }
    }
  }

  r.primeros.sort((a, b) => a.vuelta - b.vuelta || orden(a.l, b.l));
  r.followups.sort((a, b) => orden(a.l, b.l));
  r.yaHoy = primerosDeHoy(leads, hoy);
  r.cupo = Math.max(0, LIMITE_PRIMEROS - r.yaHoy);
  r.primerosHoy = r.primeros.slice(0, r.cupo);
  return r;
}

// ------------------------------------------------------------------ escritura
function ventana(primero, a, b) { return `${fmt(primero + a * DIA)} y ${fmt(primero + b * DIA)}`; }

/** Lo que se escribe en el sheet despues de un envio confirmado. */
function registroEnvio(l, paso, c, hoy, { primero = hoy, vuelta = 1 } = {}) {
  const base = paso === 'primer' ? hoy : primero;
  const next = {
    primer: `Follow-up 1 entre ${ventana(base, 5, 9)}`,
    fu1: `Follow-up 2 entre ${ventana(base, 10, 17)}`,
    fu2: `Follow-up 3 (cierre suave) entre ${ventana(base, 18, 25)}`,
    fu3: `Cerrar si no responde antes de ${fmt(base + 26 * DIA)}`,
  }[paso];
  const que = paso === 'primer' ? `primer contacto${vuelta === 2 ? ' (segunda vuelta)' : ''}` : PASOS[paso].toLowerCase();
  return {
    status: 'Contacted',
    next,
    nota: `Update ${fmt(hoy)}: ${que} por ${c.nombre} desde la cuenta de María (bot de outreach). Sin respuesta aún.`,
  };
}

const MOTIVOS_NO_ENVIO = {
  dm: 'DM cerrado',
  cuenta: 'cuenta no encontrada',
  respondio: 'ya había respondido',
  grupo: 'grupo sin chat abierto (solo publica el admin)',
  veto: 'señal de veto en la bio (picks fijos, otra casa o menores)',
  limite: 'límite de mensajes de la plataforma',
};

function registroNoEnvio(motivo, hoy) {
  return { next: `Bloqueado: ${motivo}`, nota: `Update ${fmt(hoy)}: no se envió (${motivo}). Revisado desde el bot de outreach.` };
}

const CLASIFICACION = {
  interes: { status: 'Replied', next: 'Pendiente de María: enviar respuesta con agenda', etiqueta: 'interés claro' },
  comercial: { status: 'Replied', next: 'Prioridad María: preguntó por términos comerciales', etiqueta: 'pregunta comercial' },
  ambigua: { status: 'Replied', next: 'Prioridad María: respuesta ambigua, revisar', etiqueta: 'respuesta ambigua' },
  no: { status: 'Closed - no', next: 'Cerrado', etiqueta: 'dijo que no' },
};

function registroRespuesta(clase, texto, hoy, canalNombre) {
  const c = CLASIFICACION[clase];
  return { status: c.status, next: c.next, nota: `Update ${fmt(hoy)}: respondió${canalNombre ? ` por ${canalNombre}` : ''} (${c.etiqueta}): "${texto}".` };
}

function registroCierre(hoy) {
  return { status: 'Closed - no', next: 'Cerrado por falta de respuesta', nota: `Update ${fmt(hoy)}: cerrado por falta de respuesta (más de 25 días). Desde el bot de outreach.` };
}

module.exports = {
  COL, LETRA, FILA_INICIO, LIMITE_PRIMEROS, PASOS, MOTIVOS_NO_ENVIO, CLASIFICACION,
  hoyCol, fmt, dias, leerNotas, leerLeads, nombre, canal, bloqueo, cadencia, mensaje, armarDia,
  registroEnvio, registroNoEnvio, registroRespuesta, registroCierre, RE_CHAT_ABIERTO, RE_EXCLUSIVIDAD,
};
