'use strict';

/**
 * Motor del agente de activacion. No sabe nada de Telegram, terminal ni
 * WhatsApp: recibe una entrada {usuario, texto | foto | boton} y devuelve una
 * lista de salidas neutras {titulo, texto, guion, botones}. Cada canal
 * (telegram.js, cli.js) solo las dibuja.
 *
 * Candados que aplica:
 *  1. Orden estricto: solo se puede completar el paso actual.
 *  2. Prueba obligatoria y validada (captura, hash, link, formulario).
 *  3. Checklists internos completos antes de aceptar la prueba.
 *  4. Formularios que bloquean (region restringida, China, tasa sin aprobar).
 *  5. Guiones de pasos futuros ocultos; subagentes cerrados hasta M4.
 *  6. Mantenimiento solo despues de M4; agentes detenidos no avanzan.
 *  7. Acceso solo para IDs autorizados (es material interno).
 */

const C = require('./contenido');
const P = require('./pasos');

const HORA = 3600 * 1000;
const PLAZOS = { M1: 24 * HORA, M2: 72 * HORA, M3: 168 * HORA };

// Campos del alta de un agente nuevo (/nuevo).
const CAMPOS_NUEVO = [
  { clave: 'nombre', pregunta: 'Nombre del canal o agente (handle de TG):', validar: (v) => (String(v).trim().length >= 2 ? { ok: true, valor: String(v).trim() } : { ok: false, error: 'Nombre demasiado corto.' }) },
  { clave: 'tipoCanal', pregunta: 'Tipo de canal:', opciones: Object.entries(C.TIPOS_CANAL), validar: (v) => (C.TIPOS_CANAL[v] ? { ok: true, valor: v } : { ok: false, error: 'Elige una opcion.' }) },
  { clave: 'idioma', pregunta: 'Idioma principal de sus clientes (ej. espanol, ruso, coreano):', validar: (v) => (String(v).trim() ? { ok: true, valor: String(v).trim() } : { ok: false, error: 'Escribe el idioma.' }) },
  {
    clave: 'modelo',
    antes: (a) => [{ titulo: '🧭 Ruta sugerida (la decision es del agente)', texto: `${C.recomendacionRuta(a)}\n\nFrase para el agente: "Solo tenemos un book. La unica diferencia: quieres tocar el dinero? Si no, link de referido (mas facil, tasa menor). Si si, sistema de agentes (tu pool, apuestas por el cliente, liquidas offline, tasa mayor)." Despues dejalo elegir y no expliques los dos caminos a detalle a la vez.` }],
    pregunta: 'Que modelo eligio el agente?',
    opciones: Object.entries(C.MODELOS),
    validar: (v) => (C.MODELOS[v] ? { ok: true, valor: v } : { ok: false, error: 'Elige una opcion.' }),
  },
  {
    clave: 'firmado',
    pregunta: 'Fecha de firma (escribe "hoy" o AAAA-MM-DD):',
    opciones: [['hoy', 'Hoy']],
    validar: (v, a, ahora) => {
      const s = C.normalizar(v);
      if (s === 'hoy') return { ok: true, valor: ahora.toISOString() };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: false, error: 'Formato AAAA-MM-DD o "hoy".' };
      const d = new Date(`${s}T12:00:00Z`);
      if (Number.isNaN(d.getTime())) return { ok: false, error: 'Fecha invalida.' };
      if (d.getTime() > ahora.getTime() + 24 * HORA) return { ok: false, error: 'La firma no puede estar en el futuro.' };
      return { ok: true, valor: d.toISOString() };
    },
  },
];

const ICONO = { ENVIAR: '📤 ENVIAR', REENVIAR: '🔁 REENVIAR (para sus clientes)', INTERNO: '🔒 INTERNO (no reenviar)' };

const FLUJO_ACTIVACION = {
  id: 'activacion',
  nombre: 'Activacion',
  PASOS: P.PASOS,
  FASES: P.FASES,
  CAMPOS_NUEVO,
  PLAZOS,
  HITOS: ['M1', 'M2', 'M3', 'M4'],
  BLOQUEOS: C.BLOQUEOS,
  bloqueoDeFase: (f) => {
    if (['C0', 'C1', 'M1', 'C2'].includes(f)) return 'M1';
    if (['C3', 'M2', 'C7'].includes(f)) return 'M2';
    if (f === 'M3') return 'M3';
    return 'M4';
  },
};

const SOLO_ACTIVACION = ['subagentes', 'semanal', 'reactivar', 'calc', 'resumen', 'exportar'];

function crearMotor({ store, permitidos = [], ahora = () => new Date(), flujo = FLUJO_ACTIVACION, alCerrar = null }) {
  const F = flujo;
  const estado = store.leer();
  estado.usuarios = estado.usuarios || {};
  estado.agentes = estado.agentes || {};
  estado.seq = estado.seq || 0;
  const guardar = () => store.guardar(estado);

  // ------------------------------------------------------------- utilidades
  const fecha = (iso) => (iso ? iso.slice(0, 16).replace('T', ' ') : '');
  const dia = (iso) => (iso ? iso.slice(0, 10) : '');
  const msg = (texto, extra = {}) => ({ texto, ...extra });

  function usuario(u) {
    const id = String(u.id);
    if (!estado.usuarios[id]) estado.usuarios[id] = { id, activo: null, esperando: null };
    estado.usuarios[id].id = id;
    if (u.nombre) estado.usuarios[id].nombre = u.nombre;
    return estado.usuarios[id];
  }

  function pasosDe(a) { return F.PASOS.filter((p) => !p.aplica || p.aplica(a)); }
  function pasoActual(a) { return pasosDe(a).find((p) => !a.pasos[p.id]) || null; }
  function fase(id) { return F.FASES.find((f) => f.id === id); }

  function etapa(a) {
    if (a.estado === 'detenido') return '中止合作 (detenido)';
    const p = pasoActual(a);
    if (!p) return F.etiquetaCierre || '完成闭环 (ciclo cerrado)';
    if (a.hitos.M4) return '完成闭环 (ciclo cerrado)';
    return fase(p.fase).etapa;
  }

  function vencimiento(a, hito) {
    if (!a.firmado || !F.PLAZOS[hito]) return null;
    return new Date(new Date(a.firmado).getTime() + F.PLAZOS[hito]);
  }

  function lineaPlazos(a) {
    const t = ahora().getTime();
    if (!F.HITOS.length) return '';
    if (!a.firmado) return `⏳ Los plazos de ${F.HITOS.join(', ')} arrancan el dia que se firma el contrato.`;
    return F.HITOS.map((h) => {
      if (a.hitos[h]) return `✅ ${h} ${dia(a.hitos[h])}`;
      if (!F.PLAZOS[h]) return `⬜ ${h} (primera liquidacion semanal)`;
      const v = vencimiento(a, h);
      const horas = Math.round((v.getTime() - t) / HORA);
      return horas < 0 ? `🔴 ${h} VENCIDO hace ${-horas} h` : `⬜ ${h} vence en ${horas} h (${fecha(v.toISOString())})`;
    }).join('\n');
  }

  function bloqueosDeFase(f) { return F.bloqueoDeFase(f); }

  function guionesSalida(a, p) {
    const g = p.guiones ? p.guiones(a) : [];
    const out = [];
    for (const x of g) {
      // Regla de Telegram: maximo 6 lineas por mensaje para el KOL. Si es mas largo, se parte.
      const partes = x.tipo === 'INTERNO' ? [x.texto] : P.partirMensaje(x.texto);
      partes.forEach((texto, i) => {
        const titulo = partes.length > 1 ? `${x.titulo} (${i + 1}/${partes.length}, envialos seguidos)` : x.titulo;
        out.push(msg('', { guion: { tipo: x.tipo, etiqueta: ICONO[x.tipo], titulo, texto } }));
      });
    }
    return out;
  }

  function agenteActivo(u) {
    return u.activo ? estado.agentes[u.activo] : null;
  }

  // -------------------------------------------------------------- vistas
  function mostrarPaso(a, { conGuiones = true } = {}) {
    if (a.estado === 'detenido') return [msg(`⛔ ${a.nombre} esta detenido (中止合作). Usa /reanudar si vuelve la cooperacion.`)];
    const p = pasoActual(a);
    if (!p) return mostrarCierre(a);
    const lista = pasosDe(a);
    const n = lista.indexOf(p) + 1;
    const f = fase(p.fase);
    const lineas = [
      `Fase: ${f.nombre}${f.plazo ? ` (plazo: ${f.plazo})` : ''}`,
      `Paso ${n} de ${lista.length}`,
      '',
      ...(p.que || []).map((l) => `• ${l}`),
    ];
    if (p.checklist) {
      const hechos = a.checks[p.id] || [];
      lineas.push('', `Checklist (${hechos.length}/${p.checklist.length}). Marca cada uno antes de subir la prueba.`);
    }
    lineas.push('', `🔐 Para avanzar: ${p.prueba.pide}${p.prueba.tipo === 'formulario' ? ' Toca "Responder las preguntas" y te las hago una por una.' : ''}`);
    if (a.bloqueo) lineas.push('', `🚧 Bloqueo actual: ${a.bloqueo}`);

    const botones = [];
    if (p.checklist) {
      const hechos = a.checks[p.id] || [];
      p.checklist.forEach((item, i) => botones.push([{ t: `${hechos.includes(i) ? '☑' : '☐'} ${item}`, d: `k:${i}` }]));
    }
    const ETIQUETA_HECHO = {
      formulario: '📝 Responder las preguntas',
      captura: '📸 Marcar hecho (subir captura)',
      captura_o_texto: '📸 Marcar hecho (captura o texto)',
      hash: '🔗 Marcar hecho (pegar hash)',
      link_referido: '🔗 Marcar hecho (pegar link)',
    };
    botones.push([{ t: ETIQUETA_HECHO[p.prueba.tipo] || '✅ Marcar hecho', d: 'h' }]);
    botones.push([...(p.guiones ? [{ t: '📤 Guiones', d: 'g' }] : []), { t: '🚧 Bloqueos', d: 'b' }, { t: '❓ FAQ', d: 'f' }]);
    botones.push([{ t: '📥 Traer datos de Notion', d: 'notion' }]);

    const out = [msg(lineas.join('\n'), { titulo: `${a.nombre} · ${p.titulo}`, botones })];
    if (conGuiones) out.push(...guionesSalida(a, p));
    return out;
  }

  function mostrarCierre(a) {
    if (F.cierre) return F.cierre(a).map((x) => msg(x.texto, x));
    return [msg(
      `M4 completo y subagentes tratados. Este agente esta en MANTENIMIENTO.\n\nCada semana:\n${P.MANTENIMIENTO_SEMANAL.map((x) => `• ${x}`).join('\n')}\n\nSi baja su volumen usa /reactivar para diagnosticar donde se detuvo.`,
      { titulo: `🏁 ${a.nombre} · ciclo cerrado`, botones: [[{ t: '📅 Semanal', d: 'sem' }, { t: '🩺 Reactivar', d: 'rx' }]] },
    )];
  }

  function estadoAgente(a) {
    const p = pasoActual(a);
    const n = a.notion || {};
    const sinChino = (t) => (t ? t.replace(/\s*\([^)]*[\u3400-\u9fff][^)]*\)/g, '') : t);
    const v = (k) => a[k] || n[k] || '';
    const lineas = [`Canal: ${a.nombre} (#${a.id})`];
    lineas.push(`Tipo: ${sinChino(C.TIPOS_CANAL[v('tipoCanal')]) || '-'} · Modelo: ${sinChino(C.MODELOS[v('modelo')]) || '-'}`);
    if (F.HITOS && F.HITOS.length) {
      lineas.push(`Region: ${v('region') || '-'} · Idioma: ${v('idioma') || '-'}`);
      lineas.push(`Wallet: ${v('wallet') || '-'}`);
      lineas.push(`Tasa: ${v('tasa') ? `${v('tasa')}%` : '-'} · Upline: ${v('upline') || '-'}`);
    } else {
      lineas.push(`Region de clientes: ${v('regionClientes') || '-'}`);
      lineas.push(`Fuente: ${v('fuente') || '-'} · Negociador: ${v('negociador') || '-'}`);
    }
    if (a.score !== undefined) lineas.push(`Score: ${a.score} / 100 · Tier ${a.tier}`);
    lineas.push(`${F.HITOS && F.HITOS.length ? `Firmado: ${dia(a.firmado) || '-'} · ` : ''}BD: ${a.bd}`);
    lineas.push(`Stage: ${etapa(a)}`, `Paso actual: ${p ? p.titulo : 'ninguno'}`);
    const plazos = lineaPlazos(a);
    if (plazos && plazos.trim()) lineas.push('', plazos);
    lineas.push('', `Blocker: ${a.bloqueo || '-'}`, `Next Action: ${a.accion || '-'}`);
    if (a.notionInfo) lineas.push('', `📥 Notion: ${a.notionInfo}`);
    return [msg(lineas.join('\n'), { titulo: '📋 Estado', botones: [[{ t: '📥 Traer datos de Notion', d: 'notion' }]] })];
  }

  function checklistCompleto(a) {
    const lineas = [];
    for (const f of F.FASES) {
      lineas.push('', `${f.id} · ${f.nombre}`);
      for (const p of F.PASOS.filter((x) => x.fase === f.id)) {
        if (p.aplica && !p.aplica(a)) { lineas.push(`➖ ${p.titulo} (no aplica a este modelo)`); continue; }
        const h = a.pasos[p.id];
        lineas.push(h ? `✅ ${p.titulo} · ${fecha(h.hecho)} · prueba: ${h.prueba.resumen}` : `⬜ ${p.titulo}`);
      }
    }
    return [msg(lineas.join('\n').trim(), { titulo: `🗂 Checklist con pruebas · ${a.nombre}` })];
  }

  function resumenEquipo(a) {
    const x = (id) => (a.pasos[id] ? '√' : (P.PASOS.find((p) => p.id === id).aplica && !P.PASOS.find((p) => p.id === id).aplica(a) ? '-' : '□'));
    const texto = [
      `Channel: ${a.nombre}  No.: ${a.id}`,
      '',
      'C1 Onboarding',
      `${x('c1_tracker')} Notion entry created`,
      `${x('c1_datos')} 4 details submitted (login wallet / nickname / upline / rate)`,
      '',
      'C2 Full materials',
      `${x('c2_materiales')} Product intro / tutorials / picks channel / fixture schedule`,
      '',
      'C3 Explained separately',
      `${x('c3_red')} Deposit: follow the network on the deposit page + OKX or Binance`,
      `${x('c3_regiones')} Restricted regions ${x('c3_retiro')} Withdrawal address ≠ deposit address`,
      '',
      'C5 M2 six steps',
      `${x('m1_login')} Login ${x('m2_cliente')} Add customer ${x('m2_deposito')} Deposit ${x('m2_asignar')} Allocate balance ${x('m2_apostar')} Place bet ${x('m2_ticket')} Check attribution`,
      '',
      'C6 Activation actions',
      `${x('m3_post')} Launch post written & handed over ${x('m3_link')} Referral link obtained & posted`,
      `${x('m3_sistema')} Agent system actually running ${x('m3_campana')} One campaign / push done`,
      '',
      'C7 Vaccinations',
      `${x('c7_cero')} Commission may be 0 + negative carry-forward ${x('c7_7030')} 70/30 ${x('c7_overview')} Overview ≠ settlement basis`,
      '',
      'Milestones',
      `M1 ${dia(a.hitos.M1) || '____'} M2 ${dia(a.hitos.M2) || '____'} M3 ${dia(a.hitos.M3) || '____'} M4 ${dia(a.hitos.M4) || '____'}`,
    ].join('\n');
    return [msg('Telegram quick version del checklist: marca cada punto (□ → √) y publicala en el grupo del EQUIPO, nunca en el del KOL.'), msg('', { guion: { tipo: 'INTERNO', etiqueta: ICONO.INTERNO, titulo: 'Resumen para el grupo del equipo', texto } })];
  }

  function exportarCsv(bdId) {
    const cols = ['Channel', 'NO.', 'Region', 'Channel Type', 'Model', 'Owner', 'Signed On', 'Stage', 'M1 Done', 'M2 Done', 'M3 Done', 'M4 Done', 'Blocker', 'Next Action', 'Starting Rate', 'Upline'];
    const q = (v) => `"${String(v === undefined || v === null ? '' : v).replace(/"/g, '""')}"`;
    const filas = Object.values(estado.agentes).filter((a) => a.bdId === bdId).map((a) => [
      a.nombre, a.id, a.region, C.TIPOS_CANAL[a.tipoCanal], C.MODELOS[a.modelo], a.bd, dia(a.firmado), etapa(a),
      dia(a.hitos.M1), dia(a.hitos.M2), dia(a.hitos.M3), dia(a.hitos.M4), a.bloqueo, a.accion, a.tasa ? `${a.tasa}%` : '', a.upline,
    ].map(q).join(','));
    if (!filas.length) return [msg('No tienes agentes todavia. Usa /nuevo.')];
    return [msg('', { guion: { tipo: 'INTERNO', etiqueta: ICONO.INTERNO, titulo: 'Tracker en CSV (pegalo en Notion o Sheets)', texto: [cols.map(q).join(','), ...filas].join('\n') } })];
  }

  // ---------------------------------------------------------- formularios
  function preguntar(u, a, campos) {
    const e = u.esperando;
    while (e.i < campos.length && campos[e.i].aplica && !campos[e.i].aplica({ ...a, ...e.datos })) e.i += 1;
    if (e.i >= campos.length) return null;
    const c = campos[e.i];
    const out = [];
    if (c.antes) {
      const extra = c.antes({ ...a, ...e.datos }, e.datos);
      for (const x of extra) {
        out.push(x.tipo ? msg('', { guion: { tipo: x.tipo, etiqueta: ICONO[x.tipo], titulo: x.titulo, texto: x.texto } }) : msg(x.texto, { titulo: x.titulo }));
      }
    }
    const botones = (c.opciones || []).map(([v, t]) => [{ t, d: `o:${v}` }]);
    let pregunta = c.pregunta;
    const sugerido = a.notion && a.notion[c.clave];
    if (sugerido && c.tipo !== 'foto') {
      if (c.opciones) {
        const op = c.opciones.find(([v]) => v === sugerido);
        if (op) { pregunta += `\n\n📥 En Notion: ${op[1]}`; botones.unshift([{ t: `📥 Usar el de Notion: ${op[1]}`.slice(0, 60), d: `o:${op[0]}` }]); }
      } else {
        pregunta += `\n\n📥 En Notion: «${String(sugerido).slice(0, 600)}»\nÚsalo si sigue siendo cierto, o escribe la respuesta correcta.`;
        botones.unshift([{ t: '📥 Usar el de Notion', d: 'nt' }]);
      }
    }
    botones.push([{ t: '✖ Cancelar', d: 'x' }]);
    out.push(msg(pregunta, { titulo: `📝 ${e.i + 1}/${campos.length}`, botones }));
    return out;
  }

  function camposDe(e) {
    if (e.origen === 'nuevo') return F.CAMPOS_NUEVO;
    if (e.origen === 'escalar') return CAMPOS_ESCALAR;
    return F.PASOS.find((p) => p.id === e.pasoId).prueba.campos;
  }

  function responderFormulario(u, entrada) {
    const e = u.esperando;
    const campos = camposDe(e);
    const a = e.origen === 'nuevo' ? {} : agenteActivo(u) || {};
    const c = campos[e.i];
    let res;
    if (c.tipo === 'foto') {
      res = entrada.foto ? { ok: true, valor: entrada.foto.id } : { ok: false, error: '📸 Aqui necesito una captura (foto), no texto.' };
    } else {
      const v = entrada.texto !== undefined ? entrada.texto : entrada.opcion;
      if (v === undefined || v === null || String(v).trim() === '') return [msg('Escribe una respuesta o usa /cancelar.')];
      res = c.validar(String(v), { ...a, ...e.datos }, ahora());
    }
    if (!res.ok) {
      if (res.bloquear && e.origen === 'paso') {
        a.bloqueo = res.error.replace(/^[^\w¿"]+/, '').slice(0, 140);
        a.historial.push({ at: ahora().toISOString(), evento: 'bloqueo', detalle: a.bloqueo });
        u.esperando = null;
        guardar();
        return [msg(`${res.error}\n\nEl paso queda abierto y registre el bloqueo. Cuando se resuelva, vuelve con /paso.`, { titulo: '🔒 No se puede avanzar' })];
      }
      return [msg(`❌ ${res.error}`), ...preguntar(u, a, campos)];
    }
    e.datos[c.clave] = res.valor;
    e.i += 1;
    guardar();
    const sig = preguntar(u, a, campos);
    if (sig) return sig;
    return terminarFormulario(u, e);
  }

  function terminarFormulario(u, e) {
    u.esperando = null;
    if (e.origen === 'nuevo') return crearAgente(u, e.datos);
    if (e.origen === 'escalar') return armarEscalamiento(u, e.datos);
    const a = agenteActivo(u);
    const p = F.PASOS.find((x) => x.id === e.pasoId);
    const datos = { ...e.datos };
    const foto = datos.capturaEnvio;
    delete datos.capturaEnvio;
    Object.assign(a, datos);
    if (e.pasoId === 'm4_liquidacion') a.liquidaciones.push({ at: ahora().toISOString(), ...datos });
    const resumen = foto ? 'formulario + captura' : `formulario (${Object.keys(datos).join(', ')})`;
    return completar(u, a, p, { tipo: 'formulario', resumen, foto: foto || null });
  }

  // ---------------------------------------------------------------- agentes
  function crearAgente(u, d) {
    estado.seq += 1;
    const id = String(estado.seq);
    const a = {
      id, ...d, bd: u.nombre || 'BD', bdId: u.id,
      estado: 'activo', pasos: {}, checks: {}, hitos: {}, alertas: {}, liquidaciones: [], historial: [],
      bloqueo: '', accion: '', creado: ahora().toISOString(),
    };
    estado.agentes[id] = a;
    u.activo = id;
    guardar();
    return [
      msg(`Agente #${id} creado: ${a.nombre}. Ya es tu agente activo.\n\nRegla de todo el proceso: un agente solo esta activado cuando tuvo en sus manos dinero real nuestro una vez. Firmar no es el resultado.\n\n${lineaPlazos(a)}`, { titulo: '✅ Alta creada' }),
      ...mostrarPaso(a),
    ];
  }

  function validarPrueba(p, entrada) {
    const t = (entrada.texto || '').trim();
    switch (p.prueba.tipo) {
      case 'captura':
        return entrada.foto ? { ok: true, resumen: 'captura', foto: entrada.foto.id } : { ok: false, error: '📸 Este paso exige una CAPTURA (foto). El texto no cuenta como prueba.' };
      case 'captura_o_texto':
        if (entrada.foto) return { ok: true, resumen: 'captura', foto: entrada.foto.id };
        return t.length >= 15 ? { ok: true, resumen: t.slice(0, 80) } : { ok: false, error: 'Manda una captura o un texto concreto de al menos 15 caracteres (por ejemplo la hora exacta del mensaje y a quien).' };
      case 'hash':
        return P.HASH_RE.test(t) ? { ok: true, resumen: `hash ${t.slice(0, 12)}...` } : { ok: false, error: 'No es un hash valido: 0x + 64 hexadecimales (o 64 hex en TRON). Pidele el hash al agente.' };
      case 'link_referido':
        return /^https?:\/\/\S+[?&]code=[A-Za-z0-9_-]+/.test(t) ? { ok: true, resumen: t } : { ok: false, error: 'El link debe estar COMPLETO e incluir ?code=. Un link sin codigo no atribuye registros.' };
      default:
        return { ok: false, error: 'Tipo de prueba desconocido.' };
    }
  }

  function completar(u, a, p, prueba) {
    const t = ahora();
    a.pasos[p.id] = { hecho: t.toISOString(), prueba, por: u.nombre || '' };
    a.historial.push({ at: t.toISOString(), evento: 'paso', paso: p.id, prueba: prueba.resumen });
    a.bloqueo = '';
    const out = [];
    if (p.id === 'm3_link' && prueba.resumen.startsWith('http')) a.linkReferido = prueba.resumen;
    if (p.alCompletar) {
      const extra = p.alCompletar(a, t);
      if (extra) out.push(...extra.map((x) => msg(x.texto, x)));
    }
    if (p.hito) {
      a.hitos[p.hito] = t.toISOString();
      const v = vencimiento(a, p.hito);
      const tarde = v && t > v ? ` (fuera de plazo por ${Math.round((t - v) / HORA)} h)` : ' (en plazo)';
      out.push(msg(`🎯 ${p.hito} COMPLETO${v ? tarde : ''}. Anota la fecha en el tracker: ${p.hito} Done = ${dia(t.toISOString())}.`));
      if (p.hito === 'M4') out.push(msg('💰 Ciclo cerrado: cambia Stage a 完成闭环 en el tracker. Tienes 24 h para hablar de subagentes.'));
    }
    if (p.ventanaHoras && a.hitos.M4) {
      const horas = (t - new Date(a.hitos.M4)) / HORA;
      if (horas > p.ventanaHoras) out.push(msg(`⚠️ Se hizo ${Math.round(horas)} h despues de M4: fuera de la ventana de 24 h. La conversion es menor; registralo para la proxima.`));
    }
    guardar();
    out.unshift(msg(`✅ Paso completado: ${p.titulo}`));
    if (!pasoActual(a) && alCerrar && !a.cerradoEn) {
      a.cerradoEn = t.toISOString();
      guardar();
      out.push(...alCerrar(a, u));
      return out;
    }
    out.push(...mostrarPaso(a));
    return out;
  }

  // ------------------------------------------------------------ escalamiento
  const CAMPOS_ESCALAR = [
    { clave: 'motivo', pregunta: 'Que tipo de problema es?', opciones: [...C.ESCALAR_SIEMPRE.map((x, i) => [String(i), x]), ['otro', 'Otro']], validar: (v) => ({ ok: true, valor: C.ESCALAR_SIEMPRE[Number(v)] || (v === 'otro' ? 'Otro' : String(v)) }) },
    { clave: 'que', pregunta: 'Que paso? (una o dos lineas)', validar: (v) => (String(v).trim().length >= 10 ? { ok: true, valor: String(v).trim() } : { ok: false, error: 'Describelo un poco mas.' }) },
    { clave: 'error', pregunta: 'Texto EXACTO del error (o "ninguno"):', validar: (v) => ({ ok: true, valor: String(v).trim() }) },
    { clave: 'ref', pregunta: 'Hash de transaccion o referencia de ticket (o "no aplica"):', validar: (v) => ({ ok: true, valor: String(v).trim() }) },
    { clave: 'captura', tipo: 'foto', pregunta: 'Manda la captura de pantalla del problema.' },
  ];

  function armarEscalamiento(u, d) {
    const a = agenteActivo(u);
    a.bloqueo = `Escalado: ${d.motivo}`.slice(0, 140);
    a.historial.push({ at: ahora().toISOString(), evento: 'escalado', ...d });
    guardar();
    const regional = /region|idioma/i.test(d.motivo);
    return [
      msg(`${regional ? 'Tema de region o idioma: SIEMPRE a Stella, en privado, nunca en el grupo.\n\n' : ''}Manda esto por DM a tu lider / Stella y adjunta la captura. Escalar no es molestar: convierte un problema de tu canal en capacidad del producto para todos.`, { titulo: '🆘 Escalamiento listo' }),
      msg('', { guion: { tipo: 'INTERNO', etiqueta: ICONO.INTERNO, titulo: 'Mensaje de escalamiento', texto: `ESCALATION · ${d.motivo}\nChannel: ${a.nombre} (#${a.id})\nAgent wallet: ${a.wallet || '-'}\nWhat happened: ${d.que}\nExact error: ${d.error}\nTx hash / ticket: ${d.ref}\nTime: ${fecha(ahora().toISOString())} UTC\nBD: ${a.bd}\n(screenshot attached)` } }),
    ];
  }

  // --------------------------------------------------------- vistas extra
  function vistaFaq(arg) {
    if (arg === undefined) {
      return [msg('Elige un tema. Las respuestas estan listas para enviar al agente.', { titulo: '❓ FAQ del agente', botones: [...C.FAQ.map((c, i) => [{ t: c.cat, d: `f:${i}` }]), [{ t: 'Preguntas de BDs', d: 'fb' }]] })];
    }
    const [ci, ii] = arg.split(':').map(Number);
    const cat = C.FAQ[ci];
    if (!cat) return [msg('Tema no encontrado.')];
    if (Number.isNaN(ii) || ii === undefined) {
      return [msg('Elige la pregunta:', { titulo: cat.cat, botones: cat.items.map((x, i) => [{ t: x[0], d: `f:${ci}:${i}` }]) })];
    }
    const it = cat.items[ii];
    if (!it) return [msg('Pregunta no encontrada.')];
    const out = [msg('', { guion: { tipo: 'ENVIAR', etiqueta: ICONO.ENVIAR, titulo: it[0], texto: it[1] } })];
    if (it[2]) out.push(msg(it[2].replace('[I] ', '🔒 Interno: ')));
    return out;
  }

  function vistaLista(titulo, filas) {
    return [msg(filas.map(([a, b]) => `• ${a}: ${b}`).join('\n'), { titulo })];
  }

  function vistaBloqueos(a, arg) {
    const p = pasoActual(a);
    const key = bloqueosDeFase(p ? p.fase : 'M4');
    const lista = F.BLOQUEOS[key] || [];
    if (arg === undefined) {
      return [msg(`Bloqueos tipicos de ${key}. Elige el que aplica y lo registro como Blocker del dia.\nSi es otro, escribe /bloqueo y el texto.`, { titulo: '🚧 Donde se atoro?', botones: [...lista.map((x, i) => [{ t: x[0], d: `b:${i}` }]), [{ t: '🆘 Escalar', d: 'esc' }]] })];
    }
    const b = lista[Number(arg)];
    if (!b) return [msg('Bloqueo no encontrado.')];
    a.bloqueo = b[0];
    a.historial.push({ at: ahora().toISOString(), evento: 'bloqueo', detalle: b[0] });
    guardar();
    const out = [msg(b[1], { titulo: `🚧 ${b[0]}` })];
    if (/deposite pero no puedo apostar/i.test(b[0])) {
      out.push(msg('', { guion: { tipo: 'ENVIAR', etiqueta: ICONO.ENVIAR, titulo: 'Deposite pero no puedo apostar', texto: 'Lo mas seguro es que falte un paso: despues de que el dinero esta en tu pool, tienes que asignarle saldo al cliente.\n\nBilletera -> "Allocate", o detalle del cliente -> "Adjust balance" -> eliges cliente -> monto -> cualquier motivo -> confirmar. Despues Place bet ya funciona.\n\n9 de cada 10 agentes nuevos se saltan este paso: no eres tu.' } }));
    }
    if (/sistema esta roto|bloquea la apuesta/i.test(b[0])) {
      out.push(msg('', { guion: { tipo: 'ENVIAR', etiqueta: ICONO.ENVIAR, titulo: 'El sistema esta roto?', texto: 'Mandame el mensaje exacto que ves en pantalla y una captura, lo reviso.\n\nPor favor no sigas haciendo clic ni cambies de wallet para reintentar: intentar una y otra vez puede desordenar el estado. Mandame la captura y te respondo en 10 minutos.' } }));
    }
    if (/no cuadran|region|idioma|registered agent|pantalla blanca|bloquea la apuesta/i.test(`${b[0]} ${b[1]}`)) {
      out.push(msg('Esto se escala. Usa el boton para armar el mensaje.', { botones: [[{ t: '🆘 Escalar ahora', d: 'esc' }]] }));
    }
    return out;
  }

  function vistaReactivar(a, arg) {
    if (arg === undefined) {
      return [msg('Donde se detuvo? Nunca preguntes "por que no has empezado?": pregunta "donde te atoraste?" y dale algo listo.', { titulo: '🩺 Despertar a un agente callado', botones: P.DIAGNOSTICO.map((x, i) => [{ t: x[0], d: `rx:${i}` }]) })];
    }
    const d = P.DIAGNOSTICO[Number(arg)];
    if (!d) return [msg('Opcion no encontrada.')];
    const out = [msg(`Razon real habitual: ${d[1]}.`, { titulo: d[0] })];
    if (d[2]) {
      const p = P.PASOS.find((x) => x.id === d[2]);
      if (!a.pasos[p.id] && pasoActual(a) !== p) {
        out.push(msg('🔒 Ese guion pertenece a un paso que este agente aun no alcanza. Sigue el paso actual con /paso.'));
      } else {
        out.push(...guionesSalida(a, p));
      }
    } else {
      out.push(msg('🔒 Interno: nunca preguntes "¿por que no has empezado a promocionar?". Lo pone a la defensiva. Preguntale donde se trabo y dale algo listo.'));
      out.push(msg('', { guion: { tipo: 'ENVIAR', etiqueta: ICONO.ENVIAR, titulo: 'Mensaje 31 · Reactivación general', texto: P.GUION_REACTIVAR } }));
    }
    return out;
  }

  function vistaAgentes(u) {
    const mios = Object.values(estado.agentes).filter((a) => String(a.bdId) === String(u.id));
    if (!mios.length) return [msg(F.textoSinExpedientes || 'No tienes agentes todavia. Llegan solos cuando Stella aprueba un due diligence en Calificacion, o usa /nuevo para registrar una firma.')];
    return [msg('Elige el agente con el que vas a trabajar:', {
      titulo: '👥 Tus agentes',
      botones: mios.map((a) => [{ t: `${a.id === u.activo ? '▶ ' : ''}#${a.id} ${a.nombre} · ${etapa(a)}`, d: `a:${a.id}` }]),
    })];
  }

  function ayuda() {
    return [msg([
      'Te guio paso por paso desde la firma hasta el primer pago (M1 a M4). No puedes saltarte pasos: cada uno pide una prueba verificable.',
      '',
      'Trabajo diario',
      '/nuevo · registrar un agente recien firmado',
      '/agentes · tus agentes y cambiar de activo',
      '/paso · paso actual con sus guiones',
      '/estado · hitos, plazos, blocker',
      '/checklist · C1 a C8 con pruebas',
      '/resumen · version rapida para el grupo del equipo',
      '/bloqueo [texto] · registrar o diagnosticar un bloqueo',
      '/accion texto · siguiente accion (Next Action)',
      '/escalar · armar un escalamiento',
      '/calc GGR deducciones [tasa] · calcular una liquidacion',
      '/exportar · tracker en CSV',
      '',
      'Despues de M4',
      '/subagentes · guion de subagentes (cerrado hasta M4)',
      '/semanal · acciones fijas de cada semana',
      '/reactivar · despertar a un agente callado',
      '',
      'Consulta',
      '/faq · preguntas del agente con respuestas',
      '/numeros · cifras clave · /links · links clave',
      '/nodecir · lo que nunca se dice · /reglas · lineas rojas',
      '/tbc · puntos pendientes de confirmar (no se prometen)',
      '',
      '/detener motivo · /reanudar · /cancelar',
    ].join('\n'), { titulo: '🤖 Agente de activacion de canales' })];
  }

  // -------------------------------------------------------------- comandos
  function requiereAgente(u) {
    const a = agenteActivo(u);
    if (!a) return { error: [msg('Primero elige un agente con /agentes o crea uno con /nuevo.')] };
    return { a };
  }

  function comando(u, uid, nombre, arg) {
    if (F.id !== 'activacion' && SOLO_ACTIVACION.includes(nombre)) {
      return [msg(`Ese comando es del escritorio de Activacion. Estas en ${F.nombre}.`)];
    }
    if (nombre === 'ayuda' || nombre === 'start' || nombre === 'help') {
      if (F.ayuda) return [msg(F.ayuda, { titulo: `🤖 Escritorio de ${F.nombre}` })];
    }
    switch (nombre) {
      case 'start': case 'ayuda': case 'help': return ayuda();
      case 'nuevo':
        u.esperando = { tipo: 'form', origen: 'nuevo', i: 0, datos: {} };
        guardar();
        return [msg(F.textoNuevo || 'Vamos a registrar una firma. Todo lo de hoy se hace HOY: fila en el tracker y alta enviada a CS.', { titulo: '🆕 Nuevo' }), ...preguntar(u, {}, F.CAMPOS_NUEVO)];
      case 'agentes': return vistaAgentes(u);
      case 'usar': {
        const a = estado.agentes[arg];
        if (!a || String(a.bdId) !== String(uid)) return [msg('Ese agente no existe o no es tuyo.')];
        u.activo = a.id; guardar();
        return mostrarPaso(a, { conGuiones: false });
      }
      case 'faq': return vistaFaq();
      case 'numeros': return vistaLista('🔢 Cifras clave (memorizalas)', C.NUMEROS);
      case 'links': return [msg([`Sitio: ${C.LINKS.sitio}`, `Portal de agentes: ${C.LINKS.portal}`, `Referidos: ${C.LINKS.referido}`, ...Object.entries(C.LINKS.picks).map(([k, v]) => `Picks ${k}: ${v}`), `Tracker: ${C.LINKS.tracker}`].join('\n'), { titulo: '🔗 Links' })];
      case 'nodecir': return [...vistaLista('🙊 Nunca digas esto', C.NUNCA_DECIR), msg('Lo que dices no se puede retirar: cada frase de estas es un hueco que despues tienes que tapar.')];
      case 'reglas': return [msg(C.REGLAS_TELEGRAM.map((x) => `• ${x}`).join('\n'), { titulo: '💬 Reglas para los mensajes de Telegram' }), msg(C.LINEAS_ROJAS.map((x) => `• ${x}`).join('\n'), { titulo: '🚫 Lineas rojas de promocion' }), msg(`Escalar de inmediato:\n${C.ESCALAR_SIEMPRE.map((x, i) => `${i + 1}. ${x}`).join('\n')}\n\nFuera de tu alcance (pasalo, no lo respondas):\n${C.FUERA_DE_ALCANCE.map((x) => `• ${x}`).join('\n')}`)];
      case 'tbc': return [...vistaLista('⚠️ Pendientes de confirmar: NO se prometen al agente', C.TBC)];
      case 'calc': {
        const [g, d, t] = (arg || '').split(/\s+/).map(P.numero);
        const a = agenteActivo(u);
        const tasa = t || (a && a.tasa);
        if (g === null || g === undefined || d === null || d === undefined || !tasa) return [msg('Uso: /calc GGR deducciones [tasa]. Ejemplo: /calc 1200 200 20')];
        return P.calculoLiquidacion({ tasa }, { ggr: g, deducciones: d, tendencia: '[sube X% / igual / baja X%]' })
          .map((x) => msg('', { guion: { tipo: x.tipo, etiqueta: ICONO[x.tipo], titulo: x.titulo, texto: x.texto } }));
      }
      case 'exportar': return exportarCsv(uid);
      case 'cancelar':
        u.esperando = null; guardar();
        return [msg('Cancelado. Nada se marco como hecho.')];
      default: break;
    }

    const { a, error } = requiereAgente(u);
    if (error) return error;
    switch (nombre) {
      case 'paso': return mostrarPaso(a, { conGuiones: false });
      case 'guiones': { const p = pasoActual(a); return p ? guionesSalida(a, p).concat(p.guiones ? [] : [msg('Este paso no tiene guion: es una accion tuya.')]) : mostrarCierre(a); }
      case 'estado': return estadoAgente(a);
      case 'checklist': return checklistCompleto(a);
      case 'resumen': return resumenEquipo(a);
      case 'bloqueo':
        if (arg) {
          a.bloqueo = arg.slice(0, 140);
          a.historial.push({ at: ahora().toISOString(), evento: 'bloqueo', detalle: a.bloqueo });
          guardar();
          return [msg(`Blocker registrado: ${a.bloqueo}\nCopialo al tracker hoy. Si es uno de los 5 casos que se escalan, usa /escalar.`)];
        }
        return vistaBloqueos(a);
      case 'accion':
        if (!arg) return [msg('Uso: /accion texto con fecha. Ejemplo: /accion 06-11 mandarle el post de lanzamiento')];
        a.accion = arg.slice(0, 140); guardar();
        return [msg(`Next Action registrada: ${a.accion}`)];
      case 'escalar':
        u.esperando = { tipo: 'form', origen: 'escalar', i: 0, datos: {} }; guardar();
        return [msg('Reporta en el momento en que lo detectas. No lo resuelvas tu ni esperes a la junta semanal.', { titulo: '🆘 Escalar' }), ...preguntar(u, a, CAMPOS_ESCALAR)];
      case 'subagentes':
        if (!a.hitos.M4) return [msg(`🔒 Cerrado hasta M4. Hablar de subagentes antes de que cobre suena a reclutar gente: no sabe aun si el mismo gana.\n\nSi lo pide, estacionalo: "Primero metamos tu primera comision a tu wallet y luego te muestro subagentes con tus numeros reales".\n\nAhora vas en: ${etapa(a)}.`, { titulo: '🔒 Subagentes' })];
        return guionesSalida(a, P.PASOS.find((p) => p.id === 'c8_subagentes'));
      case 'semanal':
        if (!a.hitos.M4) return [msg('🔒 El mantenimiento empieza despues de M4. Antes de eso, todo el foco esta en el paso actual (/paso).')];
        return [msg(P.MANTENIMIENTO_SEMANAL.map((x) => `• ${x}`).join('\n'), { titulo: '📅 Cada semana' }), ...guionesSalida(a, P.PASOS.find((p) => p.id === 'm3_contenido'))];
      case 'reactivar': return vistaReactivar(a);
      case 'detener':
        if (!arg) return [msg('Uso: /detener motivo')];
        a.estado = 'detenido'; a.bloqueo = `Detenido: ${arg}`.slice(0, 140);
        a.historial.push({ at: ahora().toISOString(), evento: 'detenido', detalle: arg }); guardar();
        return [msg(`${a.nombre} queda como 中止合作. Actualiza el tracker.`)];
      case 'reanudar':
        a.estado = 'activo'; a.historial.push({ at: ahora().toISOString(), evento: 'reanudado' }); guardar();
        return mostrarPaso(a, { conGuiones: false });
      default:
        return [msg('No conozco ese comando. Usa /ayuda.')];
    }
  }

  // --------------------------------------------------------------- botones
  function boton(u, uid, d) {
    if (d === 'x') return comando(u, uid, 'cancelar');
    if (d.startsWith('o:')) {
      if (!u.esperando || u.esperando.tipo !== 'form') return [msg('Ese formulario ya no esta activo.')];
      return responderFormulario(u, { opcion: d.slice(2) });
    }
    if (d === 'nt') {
      if (!u.esperando || u.esperando.tipo !== 'form') return [msg('Ese formulario ya no esta activo.')];
      const a = agenteActivo(u) || {};
      const c = camposDe(u.esperando)[u.esperando.i];
      const v = c && a.notion && a.notion[c.clave];
      if (!v) return [msg('No hay dato de Notion para esta pregunta: escribe la respuesta.')];
      return responderFormulario(u, { texto: String(v) });
    }
    if (d.startsWith('a:')) return comando(u, uid, 'usar', d.slice(2));
    if (d === 'f') return vistaFaq();
    if (d === 'fb') return vistaLista('Preguntas de BDs en el entrenamiento', C.FAQ_BD);
    if (d.startsWith('f:')) return vistaFaq(d.slice(2));
    if (d === 'esc') return comando(u, uid, 'escalar');

    const { a, error } = requiereAgente(u);
    if (error) return error;
    if (a.estado === 'detenido') return [msg('Este agente esta detenido. Usa /reanudar.')];
    if (d === 'sem') return comando(u, uid, 'semanal');
    if (d === 'rx') return vistaReactivar(a);
    if (d.startsWith('rx:')) return vistaReactivar(a, d.slice(3));
    if (d === 'g') return comando(u, uid, 'guiones');
    if (d === 'p') return comando(u, uid, 'paso');
    if (d === 'notion') return [msg('Buscando en Notion... (si no responde, usa /notion)')];
    if (d === 'b') return vistaBloqueos(a);
    if (d.startsWith('b:')) return vistaBloqueos(a, d.slice(2));

    const p = pasoActual(a);
    if (!p) return mostrarCierre(a);
    if (d.startsWith('k:')) {
      const i = Number(d.slice(2));
      if (!p.checklist || !p.checklist[i]) return [msg('Ese punto ya no es parte del paso actual.')];
      const l = a.checks[p.id] || [];
      a.checks[p.id] = l.includes(i) ? l.filter((x) => x !== i) : [...l, i];
      guardar();
      return mostrarPaso(a, { conGuiones: false });
    }
    if (d === 'h') {
      if (p.checklist) {
        const faltan = p.checklist.filter((_, i) => !(a.checks[p.id] || []).includes(i));
        if (faltan.length) return [msg(`🔒 Aun no. Faltan estos puntos del checklist:\n${faltan.map((x) => `☐ ${x}`).join('\n')}`)];
      }
      if (p.prueba.tipo === 'formulario') {
        u.esperando = { tipo: 'form', origen: 'paso', pasoId: p.id, i: 0, datos: {} };
        guardar();
        return [msg(p.prueba.pide, { titulo: `📝 ${p.titulo}` }), ...preguntar(u, a, p.prueba.campos)];
      }
      u.esperando = { tipo: 'prueba', pasoId: p.id };
      guardar();
      return [msg(`🔐 ${p.prueba.pide}`, { titulo: 'Prueba requerida', botones: [[{ t: '✖ Cancelar', d: 'x' }]] })];
    }
    return [msg('Boton no reconocido.')];
  }

  // --------------------------------------------------------------- entrada
  function recibir(entrada) {
    const uid = String(entrada.usuario.id);
    if (permitidos.length && !permitidos.map(String).includes(uid)) {
      return [msg(`🔒 Acceso solo para el equipo BD de Alice / Kixly. Tu ID es ${uid}: pidele al administrador que lo agregue.`)];
    }
    const u = usuario(entrada.usuario);

    if (entrada.boton) return boton(u, uid, entrada.boton);

    const texto = (entrada.texto || '').trim();
    if (texto.startsWith('/')) {
      const m = texto.match(/^\/(\w+)(?:@\w+)?\s*([\s\S]*)$/);
      if (!m) return ayuda();
      return comando(u, uid, m[1].toLowerCase(), m[2].trim() || undefined);
    }

    const e = u.esperando;
    if (e && e.tipo === 'form') return responderFormulario(u, entrada);
    if (e && e.tipo === 'prueba') {
      const a = agenteActivo(u);
      const p = a && pasoActual(a);
      if (!p || p.id !== e.pasoId) { u.esperando = null; guardar(); return [msg('El paso cambio. Usa /paso.')]; }
      const v = validarPrueba(p, entrada);
      if (!v.ok) return [msg(`❌ ${v.error}`)];
      u.esperando = null;
      return completar(u, a, p, { tipo: p.prueba.tipo, resumen: v.resumen, foto: v.foto || null });
    }
    if (entrada.foto) return [msg('Recibi una captura, pero no hay un paso esperando prueba. Toca "✅ Marcar hecho" primero (/paso).')];
    return [msg('Usa /paso para ver lo que sigue o /ayuda para ver todo lo que puedo hacer.')];
  }

  // ------------------------------------------------------ alertas de plazo
  function revisarPlazos() {
    const t = ahora();
    const avisos = [];
    const hoy = t.toISOString().slice(0, 10);
    const porBd = {};
    for (const a of Object.values(estado.agentes)) {
      if (a.estado !== 'activo') continue;
      const out = [];
      for (const h of Object.keys(F.PLAZOS)) {
        if (a.hitos[h] || a.alertas[h]) continue;
        const venc = vencimiento(a, h);
        if (venc && t > venc) {
          a.alertas[h] = t.toISOString();
          out.push(msg(`🔴 ${a.nombre}: ${h} VENCIDO. Plazo era ${fecha(vencimiento(a, h).toISOString())}.\nRevisa donde se atoro (/agentes -> #${a.id} -> /bloqueo) y registra la siguiente accion.`));
        }
      }
      if (a.hitos.M4 && !a.pasos.c8_subagentes && !a.alertas.C8 && t - new Date(a.hitos.M4) > 18 * HORA) {
        a.alertas.C8 = t.toISOString();
        out.push(msg(`⏰ ${a.nombre}: se cierra la ventana de 24 h despues de M4 para hablar de subagentes.`));
      }
      if (out.length) avisos.push({ usuario: a.bdId, salidas: out });
      if (!a.hitos.M4 || !a.pasos.c8_subagentes) (porBd[a.bdId] = porBd[a.bdId] || []).push(a);
    }
    for (const [bdId, lista] of Object.entries(porBd)) {
      const u = estado.usuarios[bdId];
      if (!u || u.ultimoRecordatorio === hoy) continue;
      u.ultimoRecordatorio = hoy;
      avisos.push({ usuario: bdId, salidas: [msg(`Actualiza hoy el tracker (Blocker y Next Action):\n${lista.map((a) => `• #${a.id} ${a.nombre} · ${etapa(a)}${a.bloqueo ? ` · 🚧 ${a.bloqueo}` : ''}`).join('\n')}`, { titulo: '🗓 Recordatorio diario' })] });
    }
    if (avisos.length) guardar();
    return avisos;
  }

  /** Crea un expediente directo, sin formulario (lo usa la oficina en los traspasos). */
  function importar(usuarioEntrada, datos) {
    const u = usuario(usuarioEntrada);
    estado.seq += 1;
    const id = String(estado.seq);
    const a = {
      id, ...datos, origen: 'oficina', bd: u.nombre || 'BD', bdId: u.id,
      estado: 'activo', pasos: {}, checks: {}, hitos: {}, alertas: {}, liquidaciones: [], historial: [],
      bloqueo: '', accion: '', creado: ahora().toISOString(),
    };
    estado.agentes[id] = a;
    u.activo = id;
    guardar();
    return a;
  }

  function verPaso(uEntrada) {
    const u = usuario(uEntrada);
    const a = agenteActivo(u);
    return a ? mostrarPaso(a) : [msg(`No hay expediente activo en ${F.nombre}.`)];
  }

  /** Expediente activo del usuario (para que la capa async sepa a quien buscar en Notion). */
  function activoDe(uEntrada) {
    const u = usuario(uEntrada);
    return agenteActivo(u) || null;
  }

  /**
   * Guarda lo que trajo Notion en el expediente activo. No marca pasos ni salta nada: cada dato
   * queda como respuesta sugerida en su pregunta y pasa por la misma validacion.
   */
  function aplicarNotion(uEntrada, r) {
    const u = usuario(uEntrada);
    const a = agenteActivo(u);
    if (!a) return [msg(`No hay expediente activo en ${F.nombre}. Elige uno con /agentes.`)];
    const campos = r.campos || {};
    const n = Object.keys(campos).length;
    if (!r.dd && !r.tracker) {
      const buscado = r.buscado || a.nombre;
      return [msg(`Busque "${buscado}" y no encontre en Notion su "Due Diligence Form - KOL - ${buscado}" ni una fila suya en el tracker.\n\nRevisa que el titulo del DD lleve ese nombre y que la pagina este compartida con la integracion del bot (··· > Conexiones).`, { titulo: '📥 Notion' })];
    }
    a.notion = { ...(a.notion || {}), ...campos };
    a.notionInfo = [r.dd ? 'DD encontrado' : 'sin DD', r.tracker ? 'fila del tracker encontrada' : 'sin fila en el tracker', `${n} datos`].join(' · ');
    a.historial.push({ at: ahora().toISOString(), evento: 'notion', detalle: a.notionInfo });
    guardar();
    const lista = Object.entries(campos).slice(0, 25).map(([k, v]) => `• ${k}: ${String(v).slice(0, 80)}`).join('\n');
    return [msg([
      r.dd ? `DD: ${r.dd.titulo}${r.dd.copias > 1 ? ` (hay ${r.dd.copias} paginas con ese nombre: use la original)` : ''}` : 'DD: no encontrado',
      r.tracker ? 'Tracker: fila encontrada' : 'Tracker: sin fila',
      '',
      n ? `Traje ${n} datos. En cada pregunta te los ofrezco con el boton "📥 Usar el de Notion"; los confirmas o los corriges. Ningun paso se marca solo.` : 'La pagina existe pero no encontre datos llenos en la plantilla.',
      n ? `\n${lista}` : '',
    ].join('\n'), { titulo: `📥 Notion · ${a.nombre}`, botones: [[{ t: '▶ Seguir con el paso', d: 'p' }]] })];
  }

  return { recibir, revisarPlazos, importar, verPaso, etapa, pasoActual, activoDe, aplicarNotion, flujo: F, _estado: estado };
}

module.exports = { crearMotor, PLAZOS, FLUJO_ACTIVACION, HORA };
