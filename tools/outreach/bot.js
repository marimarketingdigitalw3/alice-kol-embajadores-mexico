'use strict';

/**
 * Bot de outreach de ALICE AI. Trabaja sobre la pestana Leads del sheet: arma la cola del dia con
 * las reglas de la campana, entrega el mensaje exacto por lead y, cuando se confirma el envio,
 * registra Status, Next step y Team Notes en el sheet. No envia nada a los KOLs: eso lo hace Maria.
 *
 * Interfaz igual a la de la oficina: recibir({ usuario, texto | boton }) -> salidas neutras
 * ({ titulo, texto, guion, botones }), pero asincrona porque lee y escribe el sheet.
 */

const L = require('./leads');
const T = require('./plantillas');

function crearBotOutreach({ sheet, estado = {}, permitidos = [], ahora = () => new Date() }) {
  estado.usuarios = estado.usuarios || {};
  const msg = (texto, extra = {}) => ({ texto, ...extra });

  function usuario(id) {
    const k = String(id);
    if (!estado.usuarios[k]) estado.usuarios[k] = {};
    return estado.usuarios[k];
  }

  async function dia() {
    const leads = L.leerLeads(await sheet.leer());
    return { leads, d: L.armarDia(leads, ahora()) };
  }

  const btnMenu = [[{ t: '📋 Hoy', d: 'hoy' }, { t: '▶️ Siguiente', d: 'sig' }], [{ t: '💬 Respuestas', d: 'resps' }, { t: '⚠️ Alertas', d: 'alr' }]];

  // ------------------------------------------------------------------ vistas
  function menu() {
    return [msg([
      'Te doy la cola del día con el mensaje exacto para cada KOL y, cuando me confirmas el envío, lo registro en el sheet (Status, Next step y Team Notes).',
      '',
      'Yo no le escribo a nadie: tú envías desde tu cuenta y me confirmas.',
      '',
      '/hoy resumen del día · /siguiente próximo lead · /respuestas conversaciones abiertas · /alertas lo que necesita tu revisión · /lead 123 ver un lead · /respondio 123 registrar una respuesta',
    ].join('\n'), { titulo: '📣 Outreach ALICE AI', botones: btnMenu })];
  }

  function cola(d, u) {
    const hoyK = String(d.hoy);
    const salt = u.saltados && u.saltados.dia === hoyK ? u.saltados.nums : [];
    return [...d.followups, ...d.primerosHoy].filter((x) => !salt.includes(x.l.num));
  }

  function resumen(d, u) {
    const g = { A: 0, mx: 0, mxs: 0, resto: 0, juanes: 0 };
    for (const p of d.primerosHoy) {
      if (p.vuelta === 2) g.juanes++;
      else if (p.l.tier === 'A') g.A++;
      else if (/^m[eé]xico$/i.test(p.l.pais)) g.mx++;
      else if (/m[eé]xico|spanish/i.test(p.l.pais)) g.mxs++;
      else g.resto++;
    }
    const pend = cola(d, u).length;
    return [msg([
      `💬 Respuestas abiertas tuyas: ${d.respuestas.length}`,
      `🔁 Follow-ups que tocan: ${d.followups.length}`,
      `🆕 Primeros contactos hoy: ${d.primerosHoy.length} (cupo ${d.cupo} de ${L.LIMITE_PRIMEROS}; ya registrados hoy: ${d.yaHoy})`,
      `   Tier A ${g.A} · B México ${g.mx} · B México sin confirmar ${g.mxs} · B resto LATAM ${g.resto} · Segunda vuelta (Juanes) ${g.juanes}`,
      `✋ A mano (WhatsApp, formulario o sin contacto): ${d.manual.length}`,
      `⚠️ Alertas: exclusividad ${d.exclusividad.length} · sin fecha ${d.faltaFecha.length} · para cerrar ${d.cerrar.length} · duplicados ${d.duplicados.length} · bloqueados ${d.bloqueados.length}`,
      '',
      pend ? `En tu cola quedan ${pend}. Primero follow-ups, luego primeros contactos.` : 'No queda nada en la cola de hoy.',
    ].join('\n'), { titulo: `📋 Outreach de hoy · ${L.fmt(d.hoy)}`, botones: [[{ t: '▶️ Empezar cola', d: 'sig' }], [{ t: '💬 Respuestas', d: 'resps' }, { t: '⚠️ Alertas', d: 'alr' }]] })];
  }

  function info(l) {
    return [
      `#${l.num} · ${l.owner} · ${l.status}`,
      `Tier ${l.tier || '?'} · Score ${l.score} · ${l.pais || 'país sin dato'} · ${l.plataforma} ${l.seguidores ? `(${l.seguidores})` : ''}`.trim(),
      l.perfil ? `Perfil: ${l.perfil}` : null,
    ].filter(Boolean);
  }

  function tarjeta(x, d) {
    const { l, paso, canal: c } = x;
    const m = L.mensaje(l, paso, c);
    const lineas = info(l);
    lineas.push('', `Canal: ${c.nombre} → ${c.destino}`, `Desde: ${c.cuenta}`);
    if (m.asunto) lineas.push(`Asunto: ${m.asunto}${paso === 'primer' ? '' : ' (responder en el mismo hilo)'}`);
    if (x.primero) lineas.push(`Primer contacto: ${L.fmt(x.primero)} (hace ${x.diasDesde} días) · follow-ups hechos: ${x.followups}`);
    if (x.desdeJuanes) lineas.push('Juanes ya le escribió sin respuesta: este es tu primer mensaje desde tu cuenta, por otro canal o día.');
    const checks = [];
    if (L.RE_CHAT_ABIERTO.test(l.alerta)) checks.push('Entra al grupo y confirma que tiene chat abierto con varias personas. Si solo publica el admin o bots, no envíes.');
    if (/observe group|observar/i.test(l.next)) checks.push(`Revisa la actividad del grupo${l.grupo ? ` (${l.grupo})` : ''} antes de escribir.`);
    if (/another channel|otro canal/i.test(l.next)) checks.push(`Next step pide usar un canal distinto al del primer contacto. Si este (${c.nombre}) fue el primero, escríbele por otro de sus perfiles y no por aquí.`);
    if (c.tipo === 'telegram') checks.push('Si el enlace abre un canal o grupo y no un perfil, escríbele al admin por privado; nunca publiques en el canal.');
    checks.push('Revisa la bio: si promete picks fijos o seguros, tiene código con otra casa o es para menores, no envíes.');
    checks.push('Si ya había respondido antes, no envíes nada.');
    lineas.push('', 'Antes de enviar:', ...checks.map((t) => `• ${t}`));
    const pos = d ? `${d.pos} de ${d.total}` : '';
    return [
      msg(lineas.join('\n'), { titulo: `${m.etiqueta} · ${l.kol}${pos ? ` · ${pos}` : ''}` }),
      msg('', { guion: { etiqueta: 'COPIAR Y ENVIAR', titulo: `${m.etiqueta} · ${L.nombre(l)}`, texto: m.texto } }),
      msg('¿Lo enviaste?', { botones: [
        [{ t: '✅ Enviado', d: `env|${l.num}|${paso}` }, { t: '⏭ Saltar', d: `sal|${l.num}` }],
        [{ t: '🚫 No se pudo', d: `no|${l.num}` }, { t: '💬 Ya respondió', d: `resp|${l.num}` }],
      ] }),
    ];
  }

  async function siguiente(u) {
    const { d } = await dia();
    const c = cola(d, u);
    if (!c.length) return [msg('No queda nada en la cola de hoy. Mira /respuestas y /alertas.', { titulo: '✅ Cola terminada', botones: btnMenu })];
    return tarjeta(c[0], { pos: 1, total: c.length });
  }

  async function verLead(num) {
    const { leads, d } = await dia();
    const l = leads.find((x) => x.num === String(num));
    if (!l) return [msg(`No encuentro el lead #${num} en la pestaña Leads.`)];
    const enCola = [...d.followups, ...d.primeros].find((x) => x.l.num === l.num);
    if (enCola) return tarjeta(enCola);
    let estadoHoy = 'Hoy no le toca ningún mensaje.';
    const b = L.bloqueo(l);
    if (b) estadoHoy = `No se le escribe: ${b}`;
    else if (d.exclusividad.includes(l)) estadoHoy = 'Pendiente de validar exclusividad antes de escribirle.';
    else if (d.faltaFecha.includes(l)) estadoHoy = 'Team Notes no tiene fecha de contacto: complétala para calcular la cadencia.';
    else if (d.cerrar.find((x) => x.l === l)) estadoHoy = 'Más de 25 días sin respuesta: candidato a Closed - no.';
    else if (d.manual.find((x) => x.l === l)) estadoHoy = `A mano: ${d.manual.find((x) => x.l === l).motivo}`;
    else if (!['A', 'B'].includes(l.tier)) estadoHoy = 'Tier C: no recibe mensajes nuevos.';
    const notas = l.notas ? l.notas.split('\n').slice(-2).join('\n') : '(sin notas)';
    return [msg([...info(l), `Next step: ${l.next || '(vacío)'}`, '', estadoHoy, '', `Últimas notas:\n${notas}`].join('\n'), {
      titulo: `🔎 ${l.kol}`, botones: [[{ t: '💬 Registrar respuesta', d: `resp|${l.num}` }]],
    })];
  }

  function respuestas(d) {
    if (!d.respuestas.length) return [msg('No tienes conversaciones abiertas (Replied o In conversation).', { titulo: '💬 Respuestas' })];
    const out = [msg(`${d.respuestas.length} conversaciones abiertas tuyas. Para interés claro tienes la respuesta con agenda; si preguntan por pagos o condiciones, no se responde por escrito: va a llamada.`, { titulo: '💬 Respuestas' })];
    for (const l of d.respuestas.slice(0, 15)) {
      const ult = (l.notas.split('\n').filter(Boolean).pop() || '').slice(0, 280);
      out.push(msg(`${l.status} · ${L.canal(l).nombre || 'canal a mano'}\nNext step: ${l.next || '(vacío)'}\n${ult}`, {
        titulo: `#${l.num} ${l.kol}`, botones: [[{ t: '📝 Respuesta con agenda', d: `ag|${l.num}` }, { t: '💬 Registrar', d: `resp|${l.num}` }]],
      }));
    }
    if (d.respuestas.length > 15) out.push(msg(`Y ${d.respuestas.length - 15} más en el sheet.`));
    if (d.juanesAbiertas.length) out.push(msg(`Juanes lleva ${d.juanesAbiertas.length} conversaciones abiertas: esas no se responden desde aquí.`));
    return out;
  }

  function alertas(d) {
    const lista = (arr, f, max = 12) => (arr.length ? arr.slice(0, max).map(f).join('\n') + (arr.length > max ? `\n… y ${arr.length - max} más` : '') : '(ninguno)');
    const out = [
      msg(lista(d.exclusividad, (l) => `#${l.num} ${l.kol} · ${l.alerta}`), { titulo: `🔒 Validar exclusividad antes de escribir (${d.exclusividad.length})` }),
      msg(lista(d.faltaFecha, (l) => `#${l.num} ${l.kol}`), { titulo: `📅 Contacted sin fecha en Team Notes (${d.faltaFecha.length})` }),
      msg(lista(d.manual, (x) => `#${x.l.num} ${x.l.kol} · ${x.motivo}`), { titulo: `✋ Requieren acción manual (${d.manual.length})` }),
      msg(lista(d.duplicados, (x) => `#${x.l.num} ${x.l.kol} · también en ${x.otros.map((o) => `#${o.num} (${o.status})`).join(', ')}`), { titulo: `👯 Duplicados (${d.duplicados.length})` }),
      msg(lista(d.bloqueados, (x) => `#${x.l.num} ${x.l.kol} · ${x.motivo}`), { titulo: `🚧 No se tocan (${d.bloqueados.length})` }),
    ];
    if (d.cerrar.length) {
      out.push(msg(`${d.cerrar.length} leads llevan más de 25 días sin respuesta. Puedes cerrarlos uno por uno:`, { titulo: '🗂 Para pasar a Closed - no' }));
      for (const x of d.cerrar.slice(0, 10)) {
        out.push(msg(`#${x.l.num} ${x.l.kol} · ${x.diasDesde} días · follow-ups ${x.followups}`, { botones: [[{ t: '🗂 Cerrar', d: `cer|${x.l.num}` }]] }));
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ acciones
  async function enviado(u, num, paso) {
    const { leads, d } = await dia();
    const x = [...d.followups, ...d.primeros].find((y) => y.l.num === String(num) && y.paso === paso);
    if (!x) {
      const l = leads.find((y) => y.num === String(num));
      return [msg(`#${num} ${l ? l.kol : ''} ya no está en la cola con ese paso: probablemente alguien ya lo registró hoy. No escribí nada en el sheet.`), ...(await siguiente(u))];
    }
    const reg = L.registroEnvio(x.l, paso, x.canal, d.hoy, { primero: x.primero || d.hoy, vuelta: x.vuelta });
    await sheet.escribir({ num: x.l.num, kol: x.l.kol, ...reg });
    return [msg(`Registrado en el sheet:\nStatus: ${reg.status}\nNext step: ${reg.next}`, { titulo: `✅ #${x.l.num} ${x.l.kol}` }), ...(await siguiente(u))];
  }

  async function saltar(u, num) {
    const hoyK = String(L.hoyCol(ahora()));
    if (!u.saltados || u.saltados.dia !== hoyK) u.saltados = { dia: hoyK, nums: [] };
    if (!u.saltados.nums.includes(String(num))) u.saltados.nums.push(String(num));
    return [msg(`#${num} queda para después (vuelve mañana).`), ...(await siguiente(u))];
  }

  function noSePudo(num) {
    const b = Object.entries(L.MOTIVOS_NO_ENVIO).map(([k, t]) => [{ t, d: `nom|${num}|${k}` }]);
    return [msg('¿Qué pasó? Lo anoto en el sheet y el lead sale de la cola hasta que lo revises.', { titulo: `🚫 #${num}`, botones: b })];
  }

  async function noSePudoMotivo(u, num, clave) {
    const { leads } = await dia();
    const l = leads.find((y) => y.num === String(num));
    if (!l) return [msg(`No encuentro el lead #${num}.`)];
    if (clave === 'respondio') return clasificar(num);
    const reg = L.registroNoEnvio(L.MOTIVOS_NO_ENVIO[clave] || clave, L.hoyCol(ahora()));
    await sheet.escribir({ num: l.num, kol: l.kol, ...reg });
    return [msg(`Anotado: ${reg.next}`, { titulo: `🚫 #${l.num} ${l.kol}` }), ...(await siguiente(u))];
  }

  function clasificar(num) {
    return [msg('¿Cómo respondió?', { titulo: `💬 Respuesta de #${num}`, botones: [
      [{ t: '🙌 Interés claro', d: `cls|${num}|interes` }, { t: '💵 Pregunta comercial', d: `cls|${num}|comercial` }],
      [{ t: '🤔 Ambigua', d: `cls|${num}|ambigua` }, { t: '🙅 Dijo que no', d: `cls|${num}|no` }],
    ] })];
  }

  function pedirTexto(u, num, clase) {
    u.esperando = { tipo: 'respuesta', num: String(num), clase };
    return [msg('Pégame lo que respondió (o un resumen corto). Lo anoto tal cual en Team Notes.', { titulo: `💬 #${num} · ${L.CLASIFICACION[clase].etiqueta}` })];
  }

  async function guardarRespuesta(u, texto) {
    const { num, clase } = u.esperando;
    u.esperando = null;
    const { leads } = await dia();
    const l = leads.find((y) => y.num === num);
    if (!l) return [msg(`No encuentro el lead #${num}.`)];
    const c = L.canal(l);
    const reg = L.registroRespuesta(clase, texto.replace(/\s+/g, ' ').slice(0, 400), L.hoyCol(ahora()), c.nombre);
    await sheet.escribir({ num: l.num, kol: l.kol, ...reg });
    const out = [msg(`Registrado en el sheet:\nStatus: ${reg.status}\nNext step: ${reg.next}`, { titulo: `💬 #${l.num} ${l.kol}` })];
    if (clase === 'interes') out.push(...agenda(l));
    if (clase === 'comercial') out.push(msg('No respondas condiciones por escrito. Lleva la conversación a una llamada con María.'));
    if (clase === 'ambigua') out.push(msg('No improvises la respuesta: queda para revisión de María.'));
    if (clase === 'no') out.push(msg('Respeta el no: sale de la cadencia y no se le vuelve a escribir.'));
    return out;
  }

  function agenda(l) {
    const c = L.canal(l);
    const esEmail = c.tipo === 'email';
    return [msg(`Envíala por el mismo canal donde respondió${esEmail ? `, en el mismo hilo (Asunto: Re: ${T.ASUNTO})` : ''}.`, { titulo: '📝 Respuesta con agenda' }),
      msg('', { guion: { etiqueta: 'COPIAR Y ENVIAR', titulo: `Interés claro · ${L.nombre(l)}`, texto: T.interes(L.nombre(l), esEmail) } })];
  }

  async function cerrar(u, num) {
    const { d } = await dia();
    const x = d.cerrar.find((y) => y.l.num === String(num));
    if (!x) return [msg(`#${num} ya no está en la lista para cerrar. No cambié nada.`)];
    const reg = L.registroCierre(d.hoy);
    await sheet.escribir({ num: x.l.num, kol: x.l.kol, ...reg });
    return [msg(`#${x.l.num} ${x.l.kol} quedó en Closed - no.`)];
  }

  // ------------------------------------------------------------------ entrada
  async function recibir(entrada) {
    const uid = String(entrada.usuario.id);
    if (permitidos.length && !permitidos.map(String).includes(uid)) {
      return [msg(`🔒 Acceso solo para el equipo de ALICE AI. Tu ID es ${uid}: pídele al administrador que lo agregue.`)];
    }
    const u = usuario(uid);
    try {
      if (entrada.boton) {
        const [a, n, extra] = entrada.boton.split('|');
        switch (a) {
          case 'hoy': { const { d } = await dia(); return resumen(d, u); }
          case 'sig': return siguiente(u);
          case 'resps': { const { d } = await dia(); return respuestas(d); }
          case 'alr': { const { d } = await dia(); return alertas(d); }
          case 'env': return enviado(u, n, extra);
          case 'sal': return saltar(u, n);
          case 'no': return noSePudo(n);
          case 'nom': return noSePudoMotivo(u, n, extra);
          case 'resp': return clasificar(n);
          case 'cls': return pedirTexto(u, n, extra);
          case 'ag': { const { leads } = await dia(); const l = leads.find((y) => y.num === n); return l ? agenda(l) : [msg(`No encuentro el lead #${n}.`)]; }
          case 'cer': return cerrar(u, n);
          default: return menu();
        }
      }
      const t = (entrada.texto || '').trim();
      const m = t.match(/^\/(\w+)(?:@\w+)?\s*(.*)$/);
      if (!m && u.esperando && u.esperando.tipo === 'respuesta' && t) return guardarRespuesta(u, t);
      if (m) u.esperando = null;
      const cmd = m ? m[1].toLowerCase() : '';
      const arg = m ? m[2].trim().replace(/^#/, '') : '';
      switch (cmd) {
        case 'hoy': { const { d } = await dia(); return resumen(d, u); }
        case 'siguiente': case 'sig': case 'cola': return siguiente(u);
        case 'respuestas': { const { d } = await dia(); return respuestas(d); }
        case 'alertas': { const { d } = await dia(); return alertas(d); }
        case 'lead': return arg ? verLead(arg) : [msg('Escribe el número del lead, por ejemplo /lead 496.')];
        case 'respondio': return arg ? clasificar(arg) : [msg('Escribe el número del lead, por ejemplo /respondio 496.')];
        case 'reglas': return [msg(T.REGLAS, { titulo: '📏 Reglas' })];
        default: return menu();
      }
    } catch (e) {
      return [msg(`No pude completar la acción: ${e.message}`, { titulo: '⚠️ Error' })];
    }
  }

  /** Resumen de las 8:00 a. m. para cada persona del equipo que ya uso el bot. */
  async function resumenDiario() {
    const { d } = await dia();
    return Object.entries(estado.usuarios)
      .filter(([id, u]) => u.chat && (!permitidos.length || permitidos.map(String).includes(id)))
      .map(([id, u]) => ({ chat: u.chat, salidas: resumen(d, u) }));
  }

  function registrarChat(id, chat) { usuario(id).chat = chat; }

  return { recibir, resumenDiario, registrarChat, _estado: estado };
}

const COMANDOS_OUTREACH = [
  ['hoy', 'Resumen del día'], ['siguiente', 'Próximo lead con su mensaje'], ['respuestas', 'Conversaciones abiertas'],
  ['alertas', 'Lo que necesita tu revisión'], ['lead', 'Ver un lead: /lead 496'], ['respondio', 'Registrar respuesta: /respondio 496'],
  ['reglas', 'Reglas de envío'],
].map(([command, description]) => ({ command, description }));

module.exports = { crearBotOutreach, COMANDOS_OUTREACH };
