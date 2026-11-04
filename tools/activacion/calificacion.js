'use strict';

/**
 * Escritorio de CALIFICACION (Telegram qualification).
 *
 * Arranca cuando se confirma la primera llamada con un KOL (traspaso desde
 * Outreach) y termina cuando Stella aprueba su due diligence form. Ahi el
 * expediente pasa solo al escritorio de Activacion.
 *
 * Fuente: "LATAM - BD guide (EN)" en Notion, etapas 2 (Qualify) y 3 (First
 * contact and signing). Evalua el GRUPO que corre el KOL, no solo a la
 * persona: lo que importa es cuanta gente distinta habla de apuestas cada dia.
 */

const C = require('./contenido');
const { si, numero } = require('./pasos');

const HORA = 3600 * 1000;

const sino = (clave, pregunta, extra = {}) => ({
  clave,
  pregunta,
  opciones: [['si', 'Si'], ['no', 'No']],
  validar: (v) => {
    const b = si(v);
    return b === null ? { ok: false, error: 'Responde si o no.' } : { ok: true, valor: b };
  },
  ...extra,
});

const texto = (clave, pregunta, min = 2) => ({
  clave,
  pregunta,
  validar: (v) => (String(v).trim().length >= min ? { ok: true, valor: String(v).trim() } : { ok: false, error: 'Escribe un poco mas.' }),
});

const num = (clave, pregunta, max = Infinity) => ({
  clave,
  pregunta,
  validar: (v) => {
    const n = numero(v);
    return n === null || n < 0 || n > max ? { ok: false, error: `Escribe un numero${max !== Infinity ? ` entre 0 y ${max}` : ''}.` } : { ok: true, valor: n };
  },
});

// ---------------------------------------------------------------------------
// Tablas de la guia
// ---------------------------------------------------------------------------

const TIPOS_GRUPO = {
  chico: ['Grupo chico de apuestas con owner activo', 'ok'],
  tipster: ['Canal de tipster + su chat', 'ok'],
  esports: ['Grupo de apuestas de esports', 'ok'],
  casa: ['Chat de una casa de apuestas con licencia', 'fuera'],
  casino: ['Grupo de casino o slots', 'fuera'],
  spam: ['Spam, gente pidiendo o solo chat de juego', 'fuera'],
};

const VETOS = [
  ['vetoRegion', 'Hay miembros en regiones restringidas (Singapur, Hong Kong, Macao, Taiwan, EE.UU., Australia, Vietnam o China continental)?'],
  ['vetoMenores', 'Hay senales de menores (escuela, examenes, tarea, domingo)?'],
  ['vetoEstafa', 'Hay estafas: "partido arreglado", "100% seguro", "recuperamos tus perdidas"?'],
  ['vetoSoloAdmins', 'Solo publican admins o bots?'],
  ['vetoAyuda', 'Es un grupo para dejar de apostar o de ayuda con deudas?'],
];

const SCORECARD = [
  ['A', 15, 'Hablan de partidos y apuestas, y se preguntan que jugar'],
  ['B', 15, 'Alguien publica picks y otros los siguen'],
  ['C', 10, 'Comparten su logica: momios, lesiones, alineaciones'],
  ['D', 10, 'Vuelven al chat boletos y resultados'],
  ['E', 10, 'El owner esta presente y modera'],
  ['F', 8, 'Recomiendan o comparan plataformas'],
];

const VETOS_EN = {
  vetoRegion: 'Members in restricted regions (incl. Mainland China)',
  vetoMenores: 'Signs of minors',
  vetoEstafa: 'Scams (fixed matches, "100% sure", loss recovery)',
  vetoSoloAdmins: 'Only admins or bots post',
  vetoAyuda: 'Quit-gambling or debt-help group',
};
const SCORECARD_EN = {
  A: 'Members talk about matches and bets, ask what to play',
  B: 'Someone posts picks and others follow them',
  C: 'They share betting logic: odds, injuries, line-ups',
  D: 'Slips and results come back into the chat',
  E: 'The owner is present and moderates',
  F: 'Members recommend or compare platforms',
};
const METRICAS_EN = ['Messages (24 h)', 'Different people speaking', 'Share of top 5 speakers', 'Slips per week', 'Platform mentions per day'];
const GRUPO_EN = { chico: 'Small betting group with an active owner', tipster: 'Tipster channel + its chat', esports: 'Esports betting group' };

function evaluarMetricas(d) {
  const reglas = [
    ['Mensajes en 24 h', d.mensajes >= 50, `${d.mensajes} (min 50)`],
    ['Personas distintas hablando', d.personas >= 8, `${d.personas} (min 8)`],
    ['Peso de los 5 que mas hablan', d.top5 >= 40 && d.top5 <= 75, `${d.top5}% (entre 40% y 75%)`],
    ['Boletos por semana', d.boletos >= 5, `${d.boletos} (min 5)`],
    ['Menciones de plataformas por dia', d.menciones >= 1, `${d.menciones} (min 1)`],
  ];
  return { reglas, pasa: reglas.every((r) => r[1]) };
}

function calcularScore(d) {
  const base = SCORECARD.reduce((s, [k, pts]) => s + (d[`sc${k}`] ? pts : 0), 0);
  const total = Math.min(100, base + (d.bonus || 0));
  const tier = total >= 70 ? 'A' : total >= 50 ? 'B' : 'C';
  return { base, total, tier };
}

// ---------------------------------------------------------------------------
// Due diligence form (para Stella)
// ---------------------------------------------------------------------------

function ddForm(a) {
  const yn = (b) => (b ? 'Yes' : 'No');
  const m = a.mensajes !== undefined ? evaluarMetricas(a) : null;
  const sc = a.score !== undefined ? a : null;
  const lineas = [
    'KOL / CHANNEL DUE DILIGENCE FORM',
    `Prepared by: ${a.bd} · Date: ${new Date().toISOString().slice(0, 10)}`,
    '',
    '1. IDENTITY',
    `KOL / channel: ${a.nombre}`,
    `Lead sheet #: ${a.numeroSheet || '-'}`,
    `Platform / handle: ${a.handle || '-'}`,
    `Group or channel link: ${a.linkGrupo || '-'}`,
    `Channel type: ${({ canal: 'Telegram channel', grupo: 'Telegram group', master: 'Master agent', sub: 'Sub-agent', kol: 'KOL (X / Instagram / Discord)', facebook: 'Facebook' })[a.tipoCanal] || '-'}`,
    `Group type observed: ${GRUPO_EN[a.tipoGrupo] || '-'}`,
    `Owner and key people: ${a.personasClave || '-'}`,
    '',
    '2. REGION AND LANGUAGE',
    `Customers' region: ${a.regionClientes || '-'}`,
    `Customers' language: ${a.idioma || '-'}`,
    'Restricted regions / Mainland China: checked, none',
    '',
    '3. VETO CHECK',
    ...VETOS.map(([k]) => `${VETOS_EN[k]}: ${yn(a[k])}`),
    '',
    '4. ACTIVITY (LAST 24 HOURS)',
    ...(m ? m.reglas.map(([, ok, v], i) => `${METRICAS_EN[i]}: ${v.replace('min', 'min.').replace('entre', 'between').replace(' y ', ' and ')} ${ok ? 'PASS' : 'FAIL'}`) : ['-']),
    `Observed during live matches on: ${a.fechaObservacion ? a.fechaObservacion.slice(0, 10) : '-'}`,
    '',
    '5. SCORECARD',
    ...SCORECARD.map(([k, pts]) => `${k} (${pts}): ${yn(a[`sc${k}`])} · ${SCORECARD_EN[k]}`),
    `Bonus: ${a.bonus || 0} · ${a.bonusMotivo || '-'}`,
    `TOTAL SCORE: ${sc ? sc.score : '-'} / 100 · TIER ${sc ? sc.tier : '-'}`,
    '',
    '6. FINAL TEST',
    `Can name the owner and two key people: ${yn(a.pf1)}`,
    `5+ slips this week from different people: ${yn(a.pf2)}`,
    `Someone explained why they bet, not just what: ${yn(a.pf3)}`,
    `Owner / admin added something useful in last 24 h: ${yn(a.pf4)}`,
    `Every veto item checked: ${yn(a.pf5)}`,
    '',
    '7. MARKET INTEL',
    `Competitors seen (apps in slips, pinned codes): ${a.competidores || '-'}`,
    `Player complaints about current platform: ${a.quejas || '-'}`,
    '',
    '8. FIRST CALL',
    `Date: ${a.fechaLlamada ? a.fechaLlamada.slice(0, 10) : '-'}`,
    `Customers (total / known personally): ${a.clientes ?? '-'} / ${a.conocidos ?? '-'}`,
    `Working with another platform: ${a.otraPlataforma || '-'}`,
    `Willing to handle customers' money: ${a.manejaDinero === undefined ? '-' : yn(a.manejaDinero)}`,
    `Estimated turnover: ${a.volumen || '-'}`,
    `Has EVM wallet (OKX / Binance): ${a.tieneWallet === undefined ? '-' : yn(a.tieneWallet)}`,
    '',
    '9. CHOSEN PATH',
    `Model: ${({ sistema: 'Agent system', referido: 'Referral link', ambos: 'Both (different customers)' })[a.modelo] || '-'}`,
    `Reason: ${a.motivoCamino || '-'}`,
    '',
    '10. RISKS AND BD RECOMMENDATION',
    `Risks / observations: ${a.riesgos || '-'}`,
    `BD recommendation: ${a.recomendacion || '-'}`,
    '',
    'Approval needed: Stella (the contract is a separate approval).',
  ];
  return lineas.join('\n');
}

// ---------------------------------------------------------------------------
// Pasos
// ---------------------------------------------------------------------------

const FASES = [
  { id: 'Q1', nombre: 'Observar el grupo', etapa: 'Calificando' },
  { id: 'Q2', nombre: 'Lista de veto', etapa: 'Calificando' },
  { id: 'Q3', nombre: 'Metricas, scorecard y prueba final', etapa: 'Calificando' },
  { id: 'Q4', nombre: 'Primera llamada', etapa: 'Primera llamada', plazo: 'el dia agendado' },
  { id: 'Q5', nombre: 'Due diligence form', etapa: 'DD con Stella' },
];

const PASOS = [
  {
    id: 'q_grupo',
    fase: 'Q1',
    titulo: 'Entrar al grupo, subir 50 mensajes y clasificarlo',
    que: [
      'Abre el grupo o canal y sube 50 mensajes.',
      'Prueba de 2 minutos: hablan de partidos, momios y apuestas? hay capturas de boletos? hay un owner o admin que de verdad habla?',
      'Se evalua el GRUPO, no la persona. Los miembros no son la metrica: importa cuanta gente distinta habla de apuestas cada dia.',
    ],
    prueba: {
      tipo: 'formulario',
      pide: 'Clasifica el grupo.',
      campos: [
        {
          clave: 'tipoGrupo',
          pregunta: 'Que tipo de grupo es?',
          opciones: Object.entries(TIPOS_GRUPO).map(([k, [t]]) => [k, t]),
          validar: (v) => {
            const t = TIPOS_GRUPO[v];
            if (!t) return { ok: false, error: 'Elige una opcion.' };
            if (v === 'casa') return { ok: false, bloquear: true, error: '⛔ Chat de una casa con licencia: ya esta ligado a otra marca. No se trabaja (regla de casas rivales). Registralo en el sheet.' };
            if (v === 'casino') return { ok: false, bloquear: true, error: '⛔ Grupo de casino o slots: solo sirve para campanas de casino, no para esta. Registralo y suelta el lead.' };
            if (v === 'spam') return { ok: false, bloquear: true, error: '⛔ Spam o solo chat de juego: no vale la pena. Registra el motivo y suelta el lead.' };
            return { ok: true, valor: v };
          },
        },
        sino('t2Partidos', 'Hablan de partidos, momios y apuestas?'),
        sino('t2Boletos', 'Hay capturas de boletos?'),
        sino('t2Owner', 'Hay alguien con titulo de owner o admin que de verdad habla?', {
          validar: (v, a) => {
            const b = si(v);
            if (b === null) return { ok: false, error: 'Responde si o no.' };
            if (!b || !a.t2Partidos || !a.t2Boletos) return { ok: false, bloquear: true, error: '⛔ No pasa la prueba de 2 minutos. Registra el motivo en el sheet y suelta el lead.' };
            return { ok: true, valor: b };
          },
        }),
      ],
    },
  },
  {
    id: 'q_horario',
    fase: 'Q1',
    titulo: 'Observarlo a la hora correcta (noche o partido en vivo)',
    que: [
      'Los grupos estan casi callados de dia y despiertan de noche, durante los partidos en vivo. Si lo revisas a las 10 a. m. lo vas a calificar mal.',
      'Los grupos de esports se mueven aun mas tarde.',
      'Las 5 metricas del siguiente paso se cuentan sobre las ultimas 24 horas, incluyendo esa noche.',
    ],
    prueba: { tipo: 'captura', pide: 'Captura del grupo durante un partido en vivo o de noche (que se vea la hora).' },
    alCompletar: (a, t) => { a.fechaObservacion = t.toISOString(); },
  },
  {
    id: 'q_veto',
    fase: 'Q2',
    titulo: 'Revisar la lista de veto',
    que: [
      'Si UNA sola es cierta, el grupo queda fuera, tenga el score que tenga.',
      'Ejemplo real: un grupo con 90 en el sheet resulto ser de jugadores de Dota con senales de menores. Vetado.',
    ],
    prueba: {
      tipo: 'formulario',
      pide: 'Responde cada punto de veto.',
      campos: VETOS.map(([k, q]) => sino(k, q, {
        validar: (v) => {
          const b = si(v);
          if (b === null) return { ok: false, error: 'Responde si o no.' };
          if (b) return { ok: false, bloquear: true, error: `⛔ VETADO: ${q.replace(/\?$/, '')}. El lead queda fuera sin importar el score. Marca Tier = Veto en el sheet y avisa a Maria. Si es tema de region, escala a Stella en privado.` };
          return { ok: true, valor: false };
        },
      })),
    },
  },
  {
    id: 'q_metricas',
    fase: 'Q3',
    titulo: 'Contar las 5 metricas (ultimas 24 horas)',
    que: ['Cuenta sobre lo que leiste, no sobre el numero de miembros.'],
    prueba: {
      tipo: 'formulario',
      pide: 'Captura los 5 numeros.',
      campos: [
        num('mensajes', 'Mensajes en las ultimas 24 h:'),
        num('personas', 'Personas distintas que hablaron:'),
        num('top5', 'Que % de los mensajes son de los 5 que mas hablan? (0 a 100)', 100),
        num('boletos', 'Capturas de boletos en la semana:'),
        {
          ...num('menciones', 'Menciones de plataformas por dia:'),
          validar: (v, a) => {
            const n = numero(v);
            if (n === null || n < 0) return { ok: false, error: 'Escribe un numero.' };
            const ev = evaluarMetricas({ ...a, menciones: n });
            if (!ev.pasa) {
              const fallan = ev.reglas.filter((r) => !r[1]).map((r) => `• ${r[0]}: ${r[2]}`).join('\n');
              return { ok: false, bloquear: true, error: `⛔ No pasa el minimo de actividad:\n${fallan}\n\nRegistra los numeros en el sheet. Si esta cerca, vuelve a contar otra noche de partido.` };
            }
            return { ok: true, valor: n };
          },
        },
      ],
    },
  },
  {
    id: 'q_score',
    fase: 'Q3',
    titulo: 'Aplicar el scorecard (100 puntos)',
    que: ['70 o mas = Tier A, contactar al owner esta semana. 50 a 69 = Tier B, observar 1 a 2 semanas. Menos de 50 = Tier C, registrar el motivo y soltar.'],
    prueba: {
      tipo: 'formulario',
      pide: 'Marca cada criterio.',
      campos: [
        ...SCORECARD.map(([k, pts, q]) => sino(`sc${k}`, `${k} (${pts} pts): ${q}?`)),
        num('bonus', 'Bonus (0 a 32): quejas de su plataforma actual, titulos o apodos, pagan por picks, usan IA o modelos, picos en noches de partido:', 32),
        texto('bonusMotivo', 'Que viste para ese bonus? (escribe "nada" si fue 0)'),
        {
          clave: 'observadoSemana',
          aplica: (a) => calcularScore(a).tier === 'B',
          antes: (a) => [{ titulo: '🟡 Tier B', texto: `Score ${calcularScore(a).total}. La guia dice observar 1 a 2 semanas antes de avanzar.` }],
          pregunta: 'Ya lo observaste al menos 1 semana? (si / no)',
          opciones: [['si', 'Si'], ['no', 'No']],
          validar: (v) => {
            const b = si(v);
            if (b === null) return { ok: false, error: 'Responde si o no.' };
            if (!b) return { ok: false, bloquear: true, error: '🔒 Tier B: sigue observando el grupo 1 a 2 semanas (noches de partido) y vuelve a este paso.' };
            return { ok: true, valor: true };
          },
        },
      ],
    },
    alCompletar: (a) => {
      const r = calcularScore(a);
      a.score = r.total;
      a.tier = r.tier;
      if (r.tier === 'C') {
        a.estado = 'detenido';
        a.bloqueo = `Tier C (${r.total}): registrar motivo y soltar`;
        return [{ texto: `⛔ Score ${r.total}: Tier C. La guia dice registrar el motivo y soltarlo. El expediente queda detenido. Actualiza el sheet.` }];
      }
      return [{ texto: `📊 Score ${r.total} / 100 · Tier ${r.tier}.` }];
    },
  },
  {
    id: 'q_prueba_final',
    fase: 'Q3',
    titulo: 'Prueba final antes de marcarlo como buen lead',
    que: ['Si la respuesta a la 1 o la 2 es "no", todavia no es buen lead.'],
    prueba: {
      tipo: 'formulario',
      pide: 'Responde con honestidad.',
      campos: [
        sino('pf1', '1. Puedo nombrar al owner y a otras dos personas clave?'),
        sino('pf2', '2. Vi al menos 5 boletos esta semana de personas distintas?'),
        sino('pf3', '3. Alguien explico POR QUE apuesta, no solo que?'),
        sino('pf4', '4. El owner o un admin dijo algo util en las ultimas 24 h?'),
        sino('pf5', '5. Revise todos los puntos de veto, sobre todo menores y region?', {
          validar: (v, a) => {
            const b = si(v);
            if (b === null) return { ok: false, error: 'Responde si o no.' };
            if (!a.pf1 || !a.pf2) return { ok: false, bloquear: true, error: '🔒 Si la 1 o la 2 es "no", todavia no es buen lead. Sigue observando y vuelve.' };
            if (!b) return { ok: false, bloquear: true, error: '🔒 Revisa todos los puntos de veto antes de seguir.' };
            return { ok: true, valor: b };
          },
        }),
      ],
    },
  },
  {
    id: 'q_registro',
    fase: 'Q3',
    titulo: 'Registrar personas clave, competencia y quejas',
    que: ['Las quejas de los jugadores son tu argumento de venta en la llamada.'],
    prueba: {
      tipo: 'formulario',
      pide: 'Anota lo que viste.',
      campos: [
        texto('personasClave', 'Owner y dos personas clave (nombres o handles):', 5),
        texto('competidores', 'Competencia que viste (la app en los boletos, el codigo fijado). Escribe "ninguna" si no viste:'),
        texto('quejas', 'Quejas de los jugadores sobre su plataforma actual (escribe "ninguna" si no hay):'),
      ],
    },
  },
  {
    id: 'q_prep',
    fase: 'Q4',
    titulo: 'Preparar la primera llamada',
    que: [
      'Saldras de la llamada con 4 cosas: entiende las dos entradas, conoces su estructura de clientes, eligio por donde empezar y sabe el siguiente paso.',
      'Nada de firma ni tasas ofrecidas por iniciativa tuya.',
      'Confirma region y que no hay menores ANTES de hablar de terminos.',
      'La pregunta 4 es "manejar el dinero de tus clientes", nunca "poner dinero por adelantado": esa version hace retroceder a la mitad.',
      'Si dice "entendido" muy rapido, preguntale como haria una apuesta uno de sus clientes: 6 de cada 10 confunden los dos caminos.',
    ],
    guiones: (a) => [
      { tipo: 'INTERNO', titulo: 'Las 5 preguntas obligatorias', texto: '1. Donde estan tus clientes y que idioma hablan?\n2. Cuantos son, y a cuantos conoces en persona?\n3. Trabajas hoy con otra plataforma? Con link o apostando por ellos?\n4. Estarias dispuesto a manejar el dinero de tus clientes, y mas o menos cuanto podrias mover?\n5. Tienes una wallet EVM (OKX o Binance)?' },
      { tipo: 'INTERNO', titulo: 'Si pregunta por el producto, una linea', texto: 'Solo tenemos un book. La unica diferencia es si quieres manejar el dinero. Si no, usas tu link de referido: el cliente se registra y juega solo, y ganas una comision menor. Si si, usas el sistema de agentes: apuestas por tus clientes y ganas una comision mayor.' },
      { tipo: 'INTERNO', titulo: 'Como leer su primera respuesta', texto: '"Que es esto?" -> el producto en una linea\n"Cuanto pagan?" -> responde sin dar numeros todavia\n"Tengo X personas" o "trabaje con otra plataforma" -> directo a las 5 preguntas\n"Es seguro? Es legal?" -> solo las 3 lineas aprobadas de seguridad\n"Quiero ver el back office" -> capturas, luego los dos caminos' },
      ...(a.quejas && C.normalizar(a.quejas) !== 'ninguna' ? [{ tipo: 'INTERNO', titulo: 'Tu argumento (quejas que viste)', texto: a.quejas }] : []),
    ],
    prueba: { tipo: 'captura', pide: 'Captura de la llamada agendada en el calendario.' },
  },
  {
    id: 'q_llamada',
    fase: 'Q4',
    titulo: 'Registrar la primera llamada (las 5 respuestas)',
    que: ['Marca las 4 salidas de la llamada y luego captura sus respuestas.'],
    checklist: [
      'Entiende las dos entradas (link o sistema)',
      'Conozco su estructura de clientes',
      'Eligio por donde empezar',
      'Sabe cual es el siguiente paso',
    ],
    prueba: {
      tipo: 'formulario',
      pide: 'Captura lo que respondio.',
      campos: [
        {
          clave: 'regionClientes',
          pregunta: '1. Donde estan sus clientes? (paises separados por coma)',
          validar: (v) => {
            const rev = C.revisarRegiones(v);
            if (!rev.partes.length) return { ok: false, error: 'Escribe al menos un pais.' };
            if (rev.china) return { ok: false, bloquear: true, error: '⛔ China continental: prohibido sin excepcion. Escala a Stella en privado. No sigue.' };
            if (rev.restringidas.length) return { ok: false, bloquear: true, error: `⛔ Region restringida: ${rev.restringidas.join(', ')}. Escala a Stella en privado, sin workaround.` };
            return { ok: true, valor: String(v).trim() };
          },
        },
        texto('idioma', '1b. Que idioma hablan sus clientes?'),
        num('clientes', '2. Cuantos clientes tiene?'),
        num('conocidos', '2b. A cuantos conoce en persona?'),
        texto('otraPlataforma', '3. Trabaja hoy con otra plataforma? Cual, y con link o apostando por ellos? (o "ninguna")'),
        sino('manejaDinero', '4. Esta dispuesto a manejar el dinero de sus clientes?'),
        texto('volumen', '4b. Cuanto podria mover mas o menos? (lo que dijo, sin inventar)'),
        sino('tieneWallet', '5. Tiene wallet EVM (OKX o Binance)?'),
      ],
    },
    alCompletar: (a, t) => { a.fechaLlamada = t.toISOString(); },
  },
  {
    id: 'q_camino',
    fase: 'Q4',
    titulo: 'Registrar el camino que eligio',
    que: [
      'Di solo la frase de una linea y dejalo decidir.',
      'Regla: un cliente, un camino. Si un cliente usa los dos, no hay doble pago.',
      'Si tiene voz propia y audiencia en X, evalualo tambien como tipster.',
    ],
    prueba: {
      tipo: 'formulario',
      pide: 'Que eligio?',
      campos: [
        {
          clave: 'modelo',
          antes: (a) => [{ titulo: '🧭 Ruta sugerida (decide el KOL)', texto: `${C.recomendacionRuta(a)}${a.manejaDinero === false ? '\n\nDijo que NO quiere manejar dinero: referido, sin forzar.' : ''}` }],
          pregunta: 'Camino elegido:',
          opciones: Object.entries(C.MODELOS),
          validar: (v, a) => {
            if (!C.MODELOS[v]) return { ok: false, error: 'Elige una opcion.' };
            if (v !== 'referido' && a.manejaDinero === false) return { ok: false, error: 'Dijo que no quiere manejar dinero de clientes: el sistema de agentes no aplica. No lo fuerces (dira que si y despues no lo hara).' };
            return { ok: true, valor: v };
          },
        },
        texto('motivoCamino', 'Por que eligio ese camino? (en sus palabras)'),
      ],
    },
  },
  {
    id: 'q_dd',
    fase: 'Q5',
    titulo: 'Armar y enviar el due diligence form a Stella',
    que: [
      'El formulario se arma solo con todo lo que registraste. Revisa que nada este inventado.',
      'El DD y el contrato son dos aprobaciones separadas, ambas de Stella. No se juntan ni se saltan.',
    ],
    prueba: {
      tipo: 'formulario',
      pide: 'Completa las dos ultimas secciones del formulario.',
      campos: [
        texto('riesgos', 'Riesgos u observaciones (escribe "ninguno" si no hay):'),
        texto('recomendacion', 'Tu recomendacion para Stella (ej. "Aprobar, Tier A, empezar con sistema de agentes con sus 10 clientes mas cercanos"):', 10),
        {
          clave: 'capturaEnvio',
          tipo: 'foto',
          antes: (a) => [
            { tipo: 'INTERNO', titulo: 'Due diligence form (copialo y mandalo a Stella)', texto: ddForm(a) },
          ],
          pregunta: 'Manda el formulario de arriba a Stella y envia aqui la captura del envio.',
        },
      ],
    },
  },
  {
    id: 'q_dd_aprobado',
    fase: 'Q5',
    titulo: 'Stella aprobo el due diligence form',
    que: ['Sin esta aprobacion no se agenda la segunda llamada ni se habla de contrato.', 'Si Stella lo rechaza: /detener con su motivo y actualiza el sheet.'],
    prueba: { tipo: 'captura', pide: 'Captura de la aprobacion de Stella.' },
  },
];

const CAMPOS_NUEVO = [
  texto('nombre', 'Nombre del KOL o canal:'),
  texto('numeroSheet', '# del lead en el sheet de outreach (o "nuevo"):', 1),
  texto('handle', 'Plataforma y handle (ej. Telegram @handle):', 3),
  texto('linkGrupo', 'Link del grupo o canal que vas a evaluar:', 5),
  { clave: 'tipoCanal', pregunta: 'Tipo de canal:', opciones: Object.entries(C.TIPOS_CANAL), validar: (v) => (C.TIPOS_CANAL[v] ? { ok: true, valor: v } : { ok: false, error: 'Elige una opcion.' }) },
  texto('fechaAgendada', 'Fecha de la primera llamada confirmada (AAAA-MM-DD):', 10),
];

const BLOQUEOS = {
  Q: [
    ['El grupo esta callado cuando lo reviso', 'Revisalo de noche o durante un partido en vivo. Los de esports, aun mas tarde.'],
    ['No encuentro al owner', 'Busca el contacto publico: bio del grupo, mensaje fijado o una cuenta de "manager". Nunca escribas a miembros a sus espaldas.'],
    ['Hay alguien que "solo asesora"', 'Bandera roja: quien dice "no apuesto, solo asesoro", promete ganancias seguras o pide que le escriban por DM.'],
    ['Mucho movimiento pero de poca calidad', 'Ocupado no es lo mismo que bueno: un grupo lleno de gente pidiendo, spam y sin admin presente no vale.'],
    ['Pregunta cuanto pagamos en la llamada', 'Responde sin dar numeros todavia. Los terminos se ven despues del DD, en la segunda llamada.'],
    ['Pregunta si es seguro o legal', 'Solo las 3 lineas aprobadas de seguridad. Nada de improvisar.'],
  ],
};

const AYUDA = [
  'Califico al KOL despues de la primera llamada confirmada y armo su due diligence form para Stella. No puedes saltarte pasos.',
  '',
  '/paso · paso actual · /estado · resumen del expediente',
  '/agentes · tus expedientes · /checklist · todo con pruebas',
  '/nuevo · abrir expediente a mano (normalmente llega desde Outreach)',
  '/bloqueo · bloqueos tipicos · /escalar · armar escalamiento',
  '/faq · /nodecir · /reglas · /numeros',
  '/detener motivo · /reanudar · /cancelar',
].join('\n');

const FLUJO_CALIFICACION = {
  id: 'calificacion',
  nombre: 'Calificacion',
  PASOS,
  FASES,
  CAMPOS_NUEVO,
  PLAZOS: {},
  HITOS: [],
  BLOQUEOS,
  bloqueoDeFase: () => 'Q',
  etiquetaCierre: 'DD aprobado (pasa a Activacion)',
  textoNuevo: 'Abriendo expediente de calificacion. Lo normal es que llegue desde Outreach cuando se confirma la primera llamada.',
  ayuda: AYUDA,
  cierre: (a) => [{ titulo: `✅ ${a.nombre} · DD aprobado`, texto: 'Este expediente ya paso al escritorio de Activacion. Usa /activacion para seguir.' }],
};

module.exports = { FLUJO_CALIFICACION, ddForm, calcularScore, evaluarMetricas, HORA };
