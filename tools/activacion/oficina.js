'use strict';

/**
 * OFICINA ALICE AI: un solo bot con tres escritorios conectados.
 *
 *   1. OUTREACH      (tarea programada diaria) encuentra y contacta KOLs hasta
 *                    que se confirma la primera llamada.  -> /llamada
 *   2. CALIFICACION  evalua el grupo, registra la primera llamada y arma el
 *                    due diligence form para Stella.      -> DD aprobado
 *   3. ACTIVACION    segunda llamada, contrato y entrenamiento M1 a M4.
 *
 * Cada KOL tiene un solo expediente que avanza de escritorio en escritorio.
 * Los traspasos son automaticos y con candado: no se activa a nadie sin DD
 * aprobado, y no se califica a nadie sin llamada confirmada.
 */

const path = require('path');
const { crearMotor } = require('./motor');
const { FLUJO_CALIFICACION } = require('./calificacion');
const { storeArchivo } = require('./store');

const STATE_DIR = path.join(__dirname, '..', '..', 'state');

const ESCRITORIOS = {
  o: { id: 'outreach', nombre: 'Outreach', icono: '📣' },
  c: { id: 'calificacion', nombre: 'Calificacion', icono: '🔎' },
  a: { id: 'activacion', nombre: 'Activacion', icono: '🚀' },
};
const POR_ID = Object.fromEntries(Object.entries(ESCRITORIOS).map(([k, v]) => [v.id, k]));

const TAREAS = [
  ['ALICE AI - Outreach diario KOLs Mexico', 'lunes a viernes, 8:30 a. m. (Colombia)', 'Respuestas, follow-ups, primeros contactos (max 50), prompts para Claude Chrome, actualizacion del sheet y reporte. Si alguien confirma llamada, el reporte trae el comando /llamada listo.'],
  ['ALICE AI - Calificacion de KOLs (Telegram)', 'lunes a viernes, 7:42 p. m. (Colombia)', 'Detecta primeras llamadas confirmadas, prepara la observacion nocturna de cada grupo para Claude Chrome, la guia de la llamada y el borrador del due diligence form.'],
  ['ALICE AI - Activacion de canales M1-M4', 'lunes a viernes, 12:23 p. m. (Colombia)', 'Segundas llamadas por agendar, contratos pendientes, plazos M1 a M3 vencidos y los guiones del dia por agente.'],
];

function crearOficina({ dir = STATE_DIR, permitidos = [], ahora = () => new Date(), stores = {} } = {}) {
  const storeOf = stores.oficina || storeArchivo(path.join(dir, 'oficina.json'));
  const estado = storeOf.leer();
  estado.usuarios = estado.usuarios || {};
  const guardar = () => storeOf.guardar(estado);
  const msg = (texto, extra = {}) => ({ texto, ...extra });

  const activacion = crearMotor({
    store: stores.activacion || storeArchivo(path.join(dir, 'activaciones.json')),
    permitidos,
    ahora,
  });

  const calificacion = crearMotor({
    store: stores.calificacion || storeArchivo(path.join(dir, 'calificaciones.json')),
    permitidos,
    ahora,
    flujo: FLUJO_CALIFICACION,
    alCerrar: (exp, u) => {
      // Traspaso automatico: DD aprobado -> Activacion.
      const nuevo = activacion.importar({ id: u.id, nombre: u.nombre }, {
        nombre: exp.nombre,
        tipoCanal: exp.tipoCanal,
        modelo: exp.modelo,
        idioma: exp.idioma,
        regionSugerida: exp.regionClientes,
        numeroSheet: exp.numeroSheet,
        handle: exp.handle,
        calificacionId: exp.id,
        score: exp.score,
        tier: exp.tier,
        firmado: null,
      });
      exp.activacionId = nuevo.id;
      oficinaUsuario(u.id).escritorio = 'a';
      guardar();
      return [
        msg(`Stella aprobo el due diligence form de ${exp.nombre}. El expediente pasa al escritorio de ACTIVACION (#${nuevo.id}).\n\nSiguiente: agendar la segunda llamada y cerrar el contrato.`, { titulo: '➡️ Traspaso a Activacion' }),
        ...envolver('a', activacion.verPaso({ id: u.id, nombre: u.nombre })),
      ];
    },
  });

  const MOTORES = { c: calificacion, a: activacion };

  function oficinaUsuario(id) {
    const k = String(id);
    if (!estado.usuarios[k]) estado.usuarios[k] = { escritorio: 'o' };
    return estado.usuarios[k];
  }

  /** Prefija los botones con el escritorio para que un clic viejo no caiga en otro. */
  function envolver(k, salidas) {
    const e = ESCRITORIOS[k];
    return salidas.map((s) => {
      const out = { ...s };
      if (s.botones) out.botones = s.botones.map((fila) => fila.map((b) => ({ ...b, d: `${k}|${b.d}` })));
      if (k !== 'o' && s.titulo && !s.guion) out.titulo = `${e.icono} ${s.titulo}`;
      return out;
    });
  }

  // ---------------------------------------------------------------- vistas
  function menu() {
    return [msg([
      'Tres escritorios conectados. Cada KOL avanza de uno a otro y no se puede saltar una etapa.',
      '',
      '📣 Outreach: encuentra y contacta hasta que se confirma la primera llamada.',
      '🔎 Calificacion: evalua el grupo, registra la llamada y arma el due diligence form.',
      '🚀 Activacion: segunda llamada, contrato y M1 a M4 hasta el primer pago.',
      '',
      'Llamada confirmada: /llamada · Ver todo el embudo: /pipeline',
    ].join('\n'), {
      titulo: '🏢 Oficina ALICE AI',
      botones: [
        [{ t: '📣 Outreach', d: 'o|ir:o' }, { t: '🔎 Calificacion', d: 'o|ir:c' }, { t: '🚀 Activacion', d: 'o|ir:a' }],
        [{ t: '📞 Registrar llamada confirmada', d: 'o|llamada' }],
        [{ t: '📊 Pipeline', d: 'o|pipeline' }],
      ],
    })];
  }

  function vistaOutreach() {
    return [
      msg([
        'El outreach corre como tarea programada en Claude (no desde este bot). Lee el sheet de Leads, revisa respuestas, prepara follow-ups y primeros contactos, y deja todo en borrador para Maria.',
        '',
        'Sheet: https://docs.google.com/spreadsheets/d/1YbjjvoEaaJ9PuHn5s1JVEdKJzoPpvgJzUAJhatxeMvo/edit?gid=1619343648',
        '',
        'Traspaso: cuando un KOL confirma la primera llamada, registralo con /llamada. Su expediente se abre en Calificacion y desde ahi nadie lo puede activar sin due diligence aprobado.',
      ].join('\n'), { titulo: '📣 Escritorio de Outreach', botones: [[{ t: '📞 Registrar llamada confirmada', d: 'o|llamada' }], [{ t: '🗓 Tareas programadas', d: 'o|tareas' }]] }),
    ];
  }

  function vistaTareas() {
    return [msg(TAREAS.map(([n, h, q]) => `• ${n}\n  ${h}\n  ${q}`).join('\n\n'), { titulo: '🗓 Agentes programados' })];
  }

  function pipeline(uid) {
    const mios = (m) => Object.values(m._estado.agentes).filter((x) => String(x.bdId) === String(uid));
    const cal = mios(calificacion);
    const act = mios(activacion);
    const lineas = ['🔎 CALIFICACION'];
    const enCal = cal.filter((x) => !x.activacionId);
    lineas.push(...(enCal.length ? enCal.map((x) => `#${x.id} ${x.nombre} · ${calificacion.etapa(x)}${x.tier ? ` · Tier ${x.tier}` : ''}${x.bloqueo ? ` · 🚧 ${x.bloqueo}` : ''}`) : ['(vacio)']));
    lineas.push('', '🚀 ACTIVACION');
    lineas.push(...(act.length ? act.map((x) => `#${x.id} ${x.nombre} · ${activacion.etapa(x)}${x.bloqueo ? ` · 🚧 ${x.bloqueo}` : ''}`) : ['(vacio)']));
    const cerrados = act.filter((x) => x.hitos && x.hitos.M4).length;
    lineas.push('', `Activados con primer pago (M4): ${cerrados}`);
    return [msg(lineas.join('\n'), { titulo: '📊 Pipeline de la oficina' })];
  }

  function irA(u, uid, k) {
    u.escritorio = k;
    guardar();
    if (k === 'o') return vistaOutreach();
    const m = MOTORES[k];
    return envolver(k, [msg(`Estas en ${ESCRITORIOS[k].nombre}. /agentes para tus expedientes, /paso para el paso actual, /ayuda para todo.`, { titulo: `${ESCRITORIOS[k].icono} Escritorio de ${ESCRITORIOS[k].nombre}` })])
      .concat(envolver(k, m.recibir({ usuario: { id: uid, nombre: u.nombre }, texto: '/agentes' })));
  }

  // --------------------------------------------------------------- entrada
  function recibir(entrada) {
    const uid = String(entrada.usuario.id);
    if (permitidos.length && !permitidos.map(String).includes(uid)) {
      return [msg(`🔒 Acceso solo para el equipo de ALICE AI. Tu ID es ${uid}: pidele al administrador que lo agregue.`)];
    }
    const u = oficinaUsuario(uid);
    if (entrada.usuario.nombre) u.nombre = entrada.usuario.nombre;

    let k = u.escritorio;
    let ent = entrada;

    if (entrada.boton) {
      const [pref, ...resto] = entrada.boton.split('|');
      const d = resto.join('|');
      if (pref === 'o') {
        if (d.startsWith('ir:')) return irA(u, uid, d.slice(3));
        if (d === 'llamada') return recibir({ usuario: entrada.usuario, texto: '/llamada' });
        if (d === 'pipeline') return pipeline(uid);
        if (d === 'tareas') return vistaTareas();
        return menu();
      }
      if (!MOTORES[pref]) return menu();
      k = pref;
      ent = { ...entrada, boton: d };
      if (u.escritorio !== k) { u.escritorio = k; guardar(); }
    } else {
      const t = (entrada.texto || '').trim();
      const cmd = (t.match(/^\/(\w+)/) || [])[1];
      switch (cmd && cmd.toLowerCase()) {
        case 'start': case 'oficina': case 'menu': return menu();
        case 'pipeline': return pipeline(uid);
        case 'tareas': return vistaTareas();
        case 'outreach': return irA(u, uid, 'o');
        case 'calificacion': case 'calificar': return irA(u, uid, 'c');
        case 'activacion': case 'activar': return irA(u, uid, 'a');
        case 'llamada':
          u.escritorio = 'c'; guardar();
          return envolver('c', [msg('Primera llamada confirmada: abro su expediente en Calificacion. Antes de la llamada vas a observar el grupo, revisar el veto y aplicar el scorecard.', { titulo: '📞 Traspaso desde Outreach' })])
            .concat(envolver('c', calificacion.recibir({ usuario: entrada.usuario, texto: '/nuevo' })));
        default: break;
      }
      if (k === 'o') {
        if (cmd === 'ayuda' || cmd === 'help') return menu();
        return [msg('Estas en el escritorio de Outreach. Usa /llamada para pasar un KOL a Calificacion, /calificacion o /activacion para cambiar de escritorio, o /oficina para el menu.')];
      }
    }

    return envolver(k, MOTORES[k].recibir(ent));
  }

  function revisarPlazos() {
    const out = [];
    for (const [k, m] of Object.entries(MOTORES)) {
      for (const aviso of m.revisarPlazos()) out.push({ usuario: aviso.usuario, salidas: envolver(k, aviso.salidas) });
    }
    return out;
  }

  function registrarChat(uid, chat) {
    const u = oficinaUsuario(uid);
    if (u.chat !== chat) { u.chat = chat; guardar(); }
  }
  const chatDe = (uid) => oficinaUsuario(uid).chat;

  return { recibir, revisarPlazos, registrarChat, chatDe, motores: MOTORES, _estado: estado };
}

module.exports = { crearOficina, ESCRITORIOS, TAREAS, POR_ID };
