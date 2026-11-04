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
// Reglas del due diligence form (plantilla de Notion, "Instructions")
// ---------------------------------------------------------------------------

// Descripciones vagas que la plantilla no acepta.
const VAGOS = [
  'big volume', 'very active', 'lots of people', 'a lot of', 'many people',
  'mucho volumen', 'muy activo', 'muy activa', 'mucha gente', 'bastante gente', 'muchos seguidores', 'muchos clientes', 'harta gente',
];
const contiene = (n, w) => new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(n);

/**
 * Campo del due diligence: nunca vacio, nunca vago. "Not obtained" solo con
 * el motivo y el siguiente paso.
 */
const dato = (clave, pregunta, extra = {}) => ({
  clave,
  pregunta: `${pregunta}\n(Si no lo conseguiste escribe: Not obtained, motivo y next step.)`,
  validar: (v) => {
    const t = String(v).trim();
    const n = C.normalizar(t);
    if (t.length < 3) return { ok: false, error: 'La plantilla no acepta campos en blanco. Escribe el dato, o "Not obtained" con el motivo y el siguiente paso.' };
    if (/^(not obtained|no obtenido)/.test(n)) {
      if (!/(next step|siguiente paso|proximo paso)/.test(n) || t.length < 30) {
        return { ok: false, error: '"Not obtained" debe llevar el motivo y el siguiente paso. Ejemplo: Not obtained, el KOL no tiene dashboard; next step: pedir captura de Telegram Statistics.' };
      }
      return { ok: true, valor: t };
    }
    const vago = VAGOS.find((w) => contiene(n, w));
    if (vago) return { ok: false, error: `"${vago}" es una descripcion vaga y la plantilla la cuenta como incompleta. Pon el numero o el hecho concreto.` };
    if (extra.rechazar) {
      const r = extra.rechazar.find((w) => contiene(n, w));
      if (r) return { ok: false, error: extra.motivoRechazo || `"${r}" no se acepta en este campo.` };
    }
    return { ok: true, valor: t };
  },
  ...extra,
});

// Mediana de view rate por tamano (Benchmarks for Reference).
const BENCH_VIEW = [
  [1000, 5000, 31, '1K – 5K'],
  [5000, 10000, 19, '5K – 10K'],
  [10000, 20000, null, '10K – 20K'],
  [20000, 100000, 9.5, '20K – 100K'],
  [100000, 500000, 6, '100K – 500K'],
  [500000, Infinity, 3.4, '500K+'],
];

function evaluarCanal(a) {
  if (a.dcTipo !== 'canal' || !a.dcSuscriptores) return null;
  const rate = Math.round((a.dcVistas / a.dcSuscriptores) * 1000) / 10;
  const b = BENCH_VIEW.find(([min, max]) => a.dcSuscriptores >= min && a.dcSuscriptores < max);
  const mediana = b ? b[2] : null;
  const bajo = mediana ? rate < mediana / 2 : false;
  return { rate, rango: b ? b[3] : 'under 1K', mediana, bajo };
}

function banderasRojas(a) {
  const f = [];
  if (a.dcPico) f.push('Growth curve shows a vertical spike followed by a drop');
  const ev = evaluarCanal(a);
  if (ev && ev.bajo) f.push('View rate below half the median for its size range');
  if (a.dcReacciones) f.push('Reactions ÷ views below 0.3%');
  if (a.dcRenombrado) f.push('Channel has been renamed or switched content niche');
  if (a.dcAvatares) f.push('Many members with blank avatars / no username');
  if (a.dcPublico === false) f.push('Private or invite-only; public data cannot be verified');
  return f;
}

// ---------------------------------------------------------------------------
// Due diligence form con el formato de la plantilla de Notion
// ---------------------------------------------------------------------------

const MODELO_EN = { sistema: 'Agent system', referido: 'Referral link', ambos: 'Both (different customers)' };
const CANAL_EN = { canal: 'Telegram channel', grupo: 'Telegram group', master: 'Master agent', sub: 'Sub-agent', kol: 'KOL (X / Instagram / Discord)', facebook: 'Facebook' };

function ddForm(a) {
  const v = (x) => (x === undefined || x === null || x === '' ? 'Not obtained' : String(x));
  const yn = (b) => (b ? 'Yes' : 'No');
  const fecha = new Date().toISOString().slice(0, 10);
  const m = a.mensajes !== undefined ? evaluarMetricas(a) : null;
  const ev = evaluarCanal(a);
  const flags = banderasRojas(a);
  const box = (b) => (b ? '☒' : '☐');
  const canales = String(a.inventario || '').split('\n').filter((l) => l.trim());
  const L = [];

  L.push(`# Alice · Sub-Agent Channel Due Diligence Form - KOL - ${v(a.nombre)}`);
  L.push(`v1.0 | ${fecha} | Sportsbook channels`);
  L.push('');
  L.push(`### Due Diligence Form : ${a.linkDoc || '[Google Doc link]'}`);
  L.push('');
  L.push('### Main Channels Information');
  L.push(`- Channel links: ${v(a.linkGrupo)}`);
  L.push(`- Audience: ${a.dcSuscriptores ? `${a.dcSuscriptores} ${a.dcTipo === 'grupo' ? 'members' : 'subscribers'}` : 'Not obtained'}`);
  L.push(`- Benchmark Score: ${a.score !== undefined ? `${a.score}/100, Tier ${a.tier}` : 'Not obtained'}`);
  L.push(`- Bottom line: ${v(a.conclusion)}`);
  L.push('');
  L.push('## Instructions (Required Reading for the Negotiator)');
  L.push('The Negotiator obtains and verifies every data point and is accountable for all of it. Verbal claims are for reference only. Every data point states how it was obtained; anything missing says "Not obtained" with the reason and next step. Blank or vague entries make the form incomplete.');
  L.push('');
  L.push('## 1. Source & Accountability');
  L.push(`| Lead source | ${v(a.fuente)} |`);
  L.push(`| Lead provider | ${v(a.proveedor)} |`);
  L.push(`| Negotiator | ${v(a.negociador || a.bd)} |`);
  L.push(`| Date of first contact | ${v(a.primerContacto)} |`);
  L.push(`| Form submission date | ${fecha} |`);
  L.push('');
  L.push(`## Community Scorecard (${fecha}, aligned with Group Chat Portraits)`);
  L.push(`Score: ${a.score !== undefined ? `${a.score} / 100, Tier ${a.tier}` : 'Not obtained'}. Scope: ${v(a.linkGrupo)}. Observed during live matches on ${a.fechaObservacion ? a.fechaObservacion.slice(0, 10) : 'Not obtained'}.`);
  for (const [k, pts] of SCORECARD) L.push(`- ${k} · ${SCORECARD_EN[k]} (${pts}): ${a[`sc${k}`] ? `✓ ${pts}` : '✗ 0'}`);
  L.push(`- Bonus (up to 32): +${a.bonus || 0}. ${v(a.bonusMotivo)}`);
  if (m) {
    L.push(`Five numbers (last 24 h): ${a.mensajes} messages; ${a.personas} speakers; top-5 share ${a.top5}%; ${a.boletos} slips this week; ${a.menciones} platform mentions per day. Targets: ≥ 50 messages, ≥ 8 speakers, top-5 share 40 to 75%, ≥ 5 slips per week, ≥ 1 platform mention per day. Result: ${m.reglas.filter((r) => r[1]).length} of 5 met.`);
  }
  L.push(`Veto check: ${VETOS.map(([k], i) => `(${i + 1}) ${VETOS_EN[k]}: ${a[k] === undefined ? 'Not obtained' : yn(a[k])}`).join('. ')}.`);
  L.push(`Group type: ${GRUPO_EN[a.tipoGrupo] || 'Not obtained'}.`);
  L.push(`Quick test: (1) Owner and two key people named? ${yn(a.pf1)} (2) 5+ slips this week from different people? ${yn(a.pf2)} (3) Someone explains why they bet? ${yn(a.pf3)} (4) Owner said something useful in 24 h? ${yn(a.pf4)} (5) Every veto item checked? ${yn(a.pf5)}`);
  L.push(`Roles (owner and key people): ${v(a.personasClave)}`);
  L.push(`Competitors (pinned message, promo codes, app in slips): ${v(a.competidores)}. Player complaints: ${v(a.quejas)}`);
  L.push('');
  L.push('## 2. Sub-Agent Basic Information');
  L.push(`| Nickname / Telegram handle | ${v(a.handle)} |`);
  L.push(`| Other contact details | ${v(a.otrosContactos)} |`);
  L.push(`| Regions covered | ${v(a.regionClientes)} (customers' language: ${v(a.idioma)}) |`);
  L.push(`| Platforms currently partnered with | ${v(a.plataformaActual)} |`);
  L.push(`| How long partnered | ${v(a.tiempoAlianza)} |`);
  L.push(`| Current commission rate & settlement method | ${v(a.comisionActual)}. Deductions: ${v(a.deducciones)} |`);
  L.push(`| Sub-agents under them / tiers / size | ${v(a.subagentes)} |`);
  L.push(`| Any relationship with Alice staff | ${v(a.relacionAlice)} |`);
  L.push(`Regions Covered: ${box(/mexic|latam|colombi|peru|argentin|chile|ecuador|venezuel|guatemal|bolivi|uruguay|paraguay/.test(C.normalizar(a.regionClientes || '')))} Mexico · LATAM ☐ Russia · CIS ☐ South Korea ☐ Southeast Asia ☐ Overseas Chinese ☐ Other`);
  L.push('');
  L.push('## 3. Promotion Channel Types');
  L.push('Tick all that apply.');
  L.push(`General: ${box(a.tipoCanal === 'canal')} Telegram channel ${box(a.tipoCanal === 'grupo')} Telegram group ☐ Discord ${box(a.tipoCanal === 'kol')} X (Twitter) ☐ YouTube ☐ TikTok ☐ Instagram ☐ Twitch ☐ Kick`);
  L.push('South Korea: ☐ KakaoTalk open chat ☐ Naver Cafe ☐ Naver Band ☐ SOOP (AfreecaTV) ☐ Scam-verification sites ☐ Tipsters');
  L.push('Russian-speaking: ☐ VK ☐ Odnoklassniki ☐ Russian-language forums ☐ Arbitrage traffic teams');
  L.push('Southeast Asia: ☐ Facebook groups ☐ Line ☐ Zalo ☐ Viber');
  L.push(`Latin America: ☐ WhatsApp groups ${box(a.tipoCanal === 'facebook')} Facebook`);
  L.push('Chinese-speaking: ☐ WeChat groups ☐ Xiaohongshu (RedNote)');
  L.push(`Non-public: ${box(a.dcPublico === false)} Individual agent (own clients, no public promotion) ☐ Migrating from another platform ☐ Offline / personal network`);
  L.push('');
  L.push('## 4. Channel Inventory (Complete)');
  L.push('| # | Channel name | Link | Followers / members | Type |');
  canales.forEach((c, i) => L.push(`| ${i + 1} | ${c.split('|').map((x) => x.trim()).join(' | ')} |`));
  L.push(`Primary channels selected for deep dive: ${v(a.principales)}. Reason for selection: ${v(a.razonPrincipales)}`);
  L.push('');
  L.push('## 5. Primary Channel Deep Dive');
  L.push('Complete this section separately for each primary channel. The first launch will use 1–2 channels; deep-dive 3 so we have options and a backup.');
  L.push('**Channel ①**');
  L.push('| Item | Entry |');
  L.push(`| Channel name and link | ${v(a.dcNombre)} |`);
  L.push(`| Type | ${box(a.dcTipo !== 'grupo')} Channel (has view counter) ${box(a.dcTipo === 'grupo')} Group (no view counter) ☐ Other social |`);
  L.push(`| Publicly verifiable? | ${box(a.dcPublico !== false)} Public ${box(a.dcPublico === false)} Private / invite-only |`);
  if (a.dcTipo === 'grupo') {
    L.push('| Metric | Value | How obtained |');
    L.push(`| Members | ${v(a.dcSuscriptores)} | ${v(a.dcSuscriptoresComo)} |`);
    L.push(`| Unique speakers today | ${v(a.dcHablantes)} | ${v(a.dcHablantesComo)} |`);
    L.push(`| Daily active rate | ${a.dcSuscriptores && a.dcHablantes !== undefined ? `${Math.round((a.dcHablantes / a.dcSuscriptores) * 1000) / 10}%` : 'Not obtained'} | Calculated |`);
    L.push(`| Avg. messages per day | ${v(a.dcMensajesDia)} | ${v(a.dcMensajesComo)} |`);
    L.push(`| Bot spam present? | ${box(a.dcBots)} Yes ${box(!a.dcBots)} No | Observation |`);
  } else {
    L.push('| Metric | Value | How obtained |');
    L.push(`| Subscribers (as displayed) | ${v(a.dcSuscriptores)} | ${v(a.dcSuscriptoresComo)} |`);
    L.push(`| Verified subscribers | ${v(a.dcVerificados)} | ${v(a.dcVerificadosComo)} |`);
    L.push(`| Avg. views, last 10 posts | ${v(a.dcVistas)} | ${v(a.dcVistasComo)} |`);
    L.push(`| View rate = avg. views ÷ subscribers | ${ev ? `${ev.rate}%` : 'Not obtained'} | Calculated. ${ev && ev.mediana ? `Median for ${ev.rango}: ~${ev.mediana}%; review threshold ${ev.mediana / 2}%.${ev.bajo ? ' Below half the median.' : ''}` : ''} |`);
    L.push(`| Posting frequency (posts / week) | ${v(a.dcPostsSemana)} | ${v(a.dcPostsComo)} |`);
    L.push(`| 6-month growth curve | ${v(a.dcCrecimiento)} | TGStat / Telemetr / Telegram Statistics |`);
  }
  L.push('Red Flag Check (tick each that applies; any ticked item must be explained in Section 7):');
  ['Growth curve shows a vertical spike followed by a drop', 'View rate below half the median for its size range', 'Reactions ÷ views below 0.3%', 'Channel has been renamed or switched content niche', 'Many members with blank avatars / no username', 'Private or invite-only; public data cannot be verified']
    .forEach((f) => L.push(`${box(flags.includes(f))} ${f}`));
  L.push('Attachments (required): ☐ Screenshots of the last 10 posts (view counts visible) ☐ Screenshot of the last 24 h in private groups or channels ☐ TGStat or Telemetr 6-month growth curve');
  L.push('For Channel ② and Channel ③, copy this section.');
  L.push('');
  L.push('## 6. User & Betting Profile');
  L.push('| Item | Sub-agent claims | Negotiator verified | Verification method |');
  L.push(`| Age distribution (under 30 / 30–40 / 40+) | ${v(a.edadDice)} | ${v(a.edadVerif)} | ${v(a.edadMetodo)} |`);
  L.push(`| Main topics & daily chat content | ${v(a.temasDice)} | ${v(a.temasVerif)} | ${v(a.temasMetodo)} |`);
  L.push(`| User profile | ${v(a.regionClientes)} | ${v(a.perfilVerif)} | ${v(a.perfilMetodo)} |`);
  L.push(`| Betting preferences | ${v(a.prefDice)} | ${v(a.prefVerif)} | ${v(a.prefMetodo)} |`);
  L.push(`| Est. average bet size | ${v(a.apuestaDice)} | ${v(a.apuestaVerif)} | ${v(a.apuestaMetodo)} |`);
  L.push(`| Est. monthly active bettors | ${v(a.activosDice)} | ${v(a.activosVerif)} | ${v(a.activosMetodo)} |`);
  L.push(`| Where they currently bet | ${v(a.dondeDice)} | ${v(a.dondeVerif)} | ${v(a.dondeMetodo)} |`);
  L.push(`| Customers (total / known personally) | ${v(a.clientes)} / ${v(a.conocidos)} | | First call |`);
  L.push('User Profile: ☐ Short-term trading ☐ Meme / low-cap degen tokens ☐ On-chain DeFi ☐ Spot holding ☐ Pure gambling ☐ Other: sports bettors');
  const pref = C.normalizar(`${a.prefDice || ''} ${a.prefVerif || ''}`);
  L.push(`Betting Preferences: ${box(/sport|deport|futbol|football/.test(pref))} Sports ${box(/esport/.test(pref))} Esports ${box(/baccarat/.test(pref))} Baccarat ${box(/slot/.test(pref))} Slots ${box(/lottery|loter/.test(pref))} Lottery ${box(/prediction|prediccion/.test(pref))} Prediction markets`);
  L.push('');
  L.push('## 7. Negotiator Assessment & Recommendation');
  L.push(`| Chosen path | ${MODELO_EN[a.modelo] || 'Not obtained'}. ${v(a.motivoCamino)} |`);
  L.push(`| Proposed commission rate & rationale | ${v(a.tasaPropuesta)} |`);
  L.push(`| Proposed first launch channels (1–2) | ${v(a.canalesLanzamiento)} |`);
  L.push(`| Proposed trial budget & observation period | ${v(a.presupuestoPrueba)} |`);
  L.push(`| Est. first-month GGR range & basis | ${v(a.ggrEstimado)} |`);
  L.push(`| Identified risks | ${v(a.riesgos)} |`);
  L.push(`| Red flag explanations | ${flags.length ? v(a.explicacionBanderas) : 'No red flags ticked'} |`);
  L.push(`| Information not obtained & next steps | ${v(a.pendientes)} |`);
  L.push('');
  L.push('## 8. Approval (filled in by the approver, Stella)');
  L.push('| Decision | ☐ Approved ☐ Revisit after more info ☐ Rejected |');
  L.push('| Approved commission rate | |');
  L.push('| Approved launch channels | |');
  L.push('| Trial budget & observation period | |');
  L.push('| Additional conditions | |');
  L.push('| Approver / Date | |');
  L.push('This form is used together with the "Alice · BD Channel Incentive Policy". The contract is a separate approval.');
  L.push('');
  L.push('## Information we need from the KOL: questions sent and his answers');
  L.push('Questions 1.1 to 5.6 of the template, each with "KOL: (n) answer word for word in Spanish" and "Update: ..." when it changes. Answers collected in the first call:');
  L.push(`- Customers' region: ${v(a.regionClientes)} · Language: ${v(a.idioma)}`);
  L.push(`- Customers: ${v(a.clientes)}, known personally: ${v(a.conocidos)}`);
  L.push(`- Other platform now: ${v(a.otraPlataforma)}`);
  L.push(`- Willing to handle customers' money: ${a.manejaDinero === undefined ? 'Not obtained' : yn(a.manejaDinero)} · Estimated turnover: ${v(a.volumen)}`);
  L.push(`- EVM wallet (OKX / Binance): ${a.tieneWallet === undefined ? 'Not obtained' : yn(a.tieneWallet)}`);
  L.push('');
  L.push('## Summary');
  L.push(v(a.resumen));
  return L.join('\n');
}

// ---------------------------------------------------------------------------
// Pasos
// ---------------------------------------------------------------------------

const FASES = [
  { id: 'Q0', nombre: 'Fuente y responsable (seccion 1 del DD)', etapa: 'Calificando' },
  { id: 'Q1', nombre: 'Observar el grupo', etapa: 'Calificando' },
  { id: 'Q2', nombre: 'Lista de veto', etapa: 'Calificando' },
  { id: 'Q3', nombre: 'Metricas, scorecard y prueba final', etapa: 'Calificando' },
  { id: 'Q4', nombre: 'Primera llamada', etapa: 'Primera llamada', plazo: 'el dia agendado' },
  { id: 'Q5', nombre: 'Datos del sub-agente y canales (secciones 2 a 6 del DD)', etapa: 'Armando DD' },
  { id: 'Q6', nombre: 'Due diligence form', etapa: 'DD con Stella' },
];

const PASOS = [
  {
    id: 'q_fuente',
    fase: 'Q0',
    titulo: 'Sección 1 del DD: fuente y responsable',
    que: [
      'El negociador obtiene y verifica toda la informacion del formulario y responde por ella.',
      'La fuente debe decir persona, ocasion o plataforma. "Lo refirio un amigo" no se acepta.',
    ],
    prueba: {
      tipo: 'formulario',
      pide: 'Completa la seccion 1 del due diligence form.',
      campos: [
        dato('fuente', 'Fuente del lead (persona, ocasion o plataforma; como llego la llamada):', { rechazar: ['referred by a friend', 'referido por un amigo', 'lo refirio un amigo', 'un amigo'], motivoRechazo: '"Referido por un amigo" no se acepta: di quien, en que ocasion o por que plataforma.' }),
        dato('proveedor', 'Quien trajo el lead (lead provider):'),
        dato('negociador', 'Negociador (quien responde por este formulario):'),
        dato('primerContacto', 'Fecha y forma del primer contacto (llamada, reserva, mensaje):'),
      ],
    },
  },
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
    id: 'q_basico',
    fase: 'Q5',
    titulo: 'Sección 2 del DD: datos básicos del sub-agente',
    que: [
      '"Que plataforma usa hoy, que tasa y que se le descuenta": los tres son obligatorios.',
      'Si no sabe responder o es vago, probablemente no tiene experiencia real. No cortes la conversacion: sigue guiandolo y anotalo.',
      'Toda relacion con alguien del equipo de Alice se declara.',
    ],
    prueba: {
      tipo: 'formulario',
      pide: 'Completa la seccion 2 del due diligence form.',
      campos: [
        dato('otrosContactos', 'Otros contactos (WhatsApp, correo) y como los confirmaste:'),
        dato('plataformaActual', 'Plataformas con las que trabaja hoy y como lo verificaste (ej. sin links ni codigos en sus posts del X al Y):'),
        dato('tiempoAlianza', 'Cuanto tiempo lleva o llevo con cada plataforma (y prueba pedida):'),
        dato('comisionActual', 'Tasa actual y forma de pago (frecuencia y metodo):'),
        dato('deducciones', 'Que le descuentan de su comision (bonos, costos, chargebacks), o "None (KOL claim)":'),
        dato('subagentes', 'Sub-agentes bajo el, cuantos niveles y tamano aproximado:'),
        dato('relacionAlice', 'Relacion con alguien del equipo de Alice (debe declararse):'),
      ],
    },
  },
  {
    id: 'q_canales',
    fase: 'Q5',
    titulo: 'Sección 4 del DD: inventario completo de canales',
    que: ['Todos los canales, uno por fila. Esta seccion es solo de registro.', 'Despues elige hasta 3 canales principales para el analisis a fondo.'],
    prueba: {
      tipo: 'formulario',
      pide: 'Registra todos sus canales.',
      campos: [
        {
          clave: 'inventario',
          pregunta: 'Un canal por linea con este formato:\nNombre | Link | Seguidores o miembros (y fecha) | Tipo (channel / group / social / other)',
          validar: (v) => {
            const lineas = String(v).split('\n').map((l) => l.trim()).filter(Boolean);
            if (!lineas.length) return { ok: false, error: 'Registra al menos un canal.' };
            const mala = lineas.find((l) => l.split('|').length !== 4 || l.split('|').some((p) => !p.trim()));
            if (mala) return { ok: false, error: `Esta linea no tiene las 4 partes separadas por "|": ${mala}` };
            return { ok: true, valor: lineas.join('\n') };
          },
        },
        dato('principales', 'Canales principales para el analisis a fondo (maximo 3):'),
        dato('razonPrincipales', 'Por que elegiste esos canales:'),
      ],
    },
  },
  {
    id: 'q_deep',
    fase: 'Q5',
    titulo: 'Sección 5 del DD: análisis a fondo del canal principal',
    que: [
      'Las metricas de canal y de grupo NO son intercambiables: un grupo no tiene contador de vistas, asi que cualquier cifra de "vistas" en un grupo es inventada.',
      'Cada numero dice como se obtuvo. Adjunta capturas de los ultimos 10 posts con las vistas visibles.',
      'Mediana de view rate: 1K-5K ~31%, 5K-10K ~19%, 20K-100K ~9-10%, 100K-500K ~6%, 500K+ ~3.4%. Menos de la mitad de la mediana es bandera roja.',
    ],
    prueba: {
      tipo: 'formulario',
      pide: 'Datos del canal principal.',
      campos: [
        dato('dcNombre', 'Nombre y link del canal principal:'),
        { clave: 'dcTipo', pregunta: 'Es canal (con contador de vistas) o grupo (sin contador)?', opciones: [['canal', 'Canal'], ['grupo', 'Grupo']], validar: (v) => (['canal', 'grupo'].includes(v) ? { ok: true, valor: v } : { ok: false, error: 'Elige canal o grupo.' }) },
        sino('dcPublico', 'Es publico (los datos se pueden verificar)?'),
        num('dcSuscriptores', 'Suscriptores o miembros que muestra hoy:'),
        dato('dcSuscriptoresComo', 'Como obtuviste ese numero (fuente y fecha):'),
        { ...dato('dcVerificados', 'Suscriptores verificados (sin falsos o inflados):'), aplica: (a) => a.dcTipo === 'canal' },
        { ...dato('dcVerificadosComo', 'Como lo verificaste:'), aplica: (a) => a.dcTipo === 'canal' },
        { ...num('dcVistas', 'Vistas promedio de los ultimos 10 posts:'), aplica: (a) => a.dcTipo === 'canal' },
        { ...dato('dcVistasComo', 'Como lo contaste (posts, fechas, excluiste posts recientes?):'), aplica: (a) => a.dcTipo === 'canal' },
        {
          ...num('dcPostsSemana', 'Posts por semana:'),
          aplica: (a) => a.dcTipo === 'canal',
          antes: (a) => {
            const ev = evaluarCanal(a);
            return ev ? [{ titulo: '📊 View rate', texto: `${ev.rate}% (${a.dcVistas} / ${a.dcSuscriptores}).${ev.mediana ? ` Mediana para ${ev.rango}: ~${ev.mediana}%.${ev.bajo ? ' 🚩 Esta por debajo de la mitad de la mediana: tendras que explicarlo en la seccion 7.' : ''}` : ''}` }] : [];
          },
        },
        { ...dato('dcPostsComo', 'Como obtuviste la frecuencia:'), aplica: (a) => a.dcTipo === 'canal' },
        { ...dato('dcCrecimiento', 'Curva de crecimiento de 6 meses (TGStat, Telemetr o Telegram Statistics):'), aplica: (a) => a.dcTipo === 'canal' },
        { ...num('dcHablantes', 'Personas distintas que hablaron hoy:'), aplica: (a) => a.dcTipo === 'grupo' },
        { ...dato('dcHablantesComo', 'Como lo contaste:'), aplica: (a) => a.dcTipo === 'grupo' },
        { ...num('dcMensajesDia', 'Mensajes promedio por dia:'), aplica: (a) => a.dcTipo === 'grupo' },
        { ...dato('dcMensajesComo', 'Como lo contaste:'), aplica: (a) => a.dcTipo === 'grupo' },
        { ...sino('dcBots', 'Hay spam de bots?'), aplica: (a) => a.dcTipo === 'grupo' },
        sino('dcPico', 'La curva muestra un pico vertical seguido de una caida?'),
        sino('dcReacciones', 'Las reacciones son menos del 0.3% de las vistas?'),
        sino('dcRenombrado', 'El canal cambio de nombre o de tema?'),
        sino('dcAvatares', 'Muchos miembros sin foto o sin username?'),
      ],
    },
  },
  {
    id: 'q_audiencia',
    fase: 'Q5',
    titulo: 'Sección 6 del DD: perfil de usuarios y apuestas',
    que: [
      'Dos columnas lado a lado: lo que dice el sub-agente y lo que verificaste tu. Las diferencias grandes son donde se enfoca la negociacion.',
      '"No se" o "el agente no dijo" no se acepta para la apuesta promedio. Fuentes por confiabilidad: capturas de su back office, preguntar en la comunidad, contar los boletos publicados, hablar 1 a 1 con 3 a 5 miembros, lo que dice el agente.',
      '"Agent claim only" se acepta, pero es la confiabilidad mas baja y necesita un plan de verificacion.',
    ],
    prueba: {
      tipo: 'formulario',
      pide: 'Completa la seccion 6 del due diligence form.',
      campos: [
        dato('edadDice', 'Edad, lo que dice el agente (menos de 30 / 30-40 / 40+):'),
        dato('edadVerif', 'Edad, lo que verificaste:'),
        dato('edadMetodo', 'Edad, metodo de verificacion:'),
        dato('temasDice', 'Temas y contenido diario, lo que dice el agente (deportes, ligas):'),
        dato('temasVerif', 'Temas y contenido diario, lo que verificaste en sus posts:'),
        dato('temasMetodo', 'Temas, metodo (posts revisados y fechas):'),
        dato('perfilVerif', 'Perfil de usuarios (paises), lo que verificaste:'),
        dato('perfilMetodo', 'Perfil de usuarios, metodo de verificacion:'),
        dato('prefDice', 'Preferencias de apuesta, lo que dice el agente (deportes, esports, casino):'),
        dato('prefVerif', 'Preferencias de apuesta, lo que verificaste:'),
        dato('prefMetodo', 'Preferencias, metodo de verificacion:'),
        dato('apuestaDice', 'Apuesta promedio, lo que dice el agente (con moneda):', { rechazar: ['no se', 'no sabe', 'dont know', "don't know", 'no dijo'], motivoRechazo: '"No se" no se acepta para la apuesta promedio. Pregunta en la comunidad o cuenta los boletos publicados.' }),
        dato('apuestaVerif', 'Apuesta promedio, lo que verificaste:'),
        dato('apuestaMetodo', 'Apuesta promedio, metodo (si es solo su palabra escribe "Agent claim only" y el plan):'),
        dato('activosDice', 'Apostadores activos al mes, lo que dice el agente:'),
        dato('activosVerif', 'Apostadores activos al mes, lo que verificaste:'),
        dato('activosMetodo', 'Apostadores activos, metodo de verificacion:'),
        dato('dondeDice', 'Donde apuestan hoy, lo que dice el agente:'),
        dato('dondeVerif', 'Donde apuestan hoy, lo que verificaste:'),
        dato('dondeMetodo', 'Donde apuestan, metodo de verificacion:'),
      ],
    },
  },
  {
    id: 'q_propuesta',
    fase: 'Q6',
    titulo: 'Sección 7 del DD: evaluación y recomendación del negociador',
    que: [
      'No ofrezcas tasas al KOL: esto es tu propuesta para Stella.',
      'Cada bandera roja marcada en la seccion 5 se explica aqui.',
    ],
    prueba: {
      tipo: 'formulario',
      pide: 'Completa la seccion 7 del due diligence form.',
      campos: [
        dato('tasaPropuesta', 'Tasa de comision propuesta y por que:'),
        dato('canalesLanzamiento', 'Canales para el primer lanzamiento (1 o 2):'),
        dato('presupuestoPrueba', 'Presupuesto de prueba y periodo de observacion:'),
        dato('ggrEstimado', 'Rango de GGR estimado del primer mes y en que se basa:'),
        dato('riesgos', 'Riesgos identificados:'),
        {
          ...dato('explicacionBanderas', 'Explica cada bandera roja marcada:'),
          aplica: (a) => banderasRojas(a).length > 0,
          antes: (a) => [{ titulo: '🚩 Banderas rojas marcadas', texto: banderasRojas(a).map((f) => `• ${f}`).join('\n') }],
        },
        dato('pendientes', 'Informacion que no conseguiste y siguientes pasos:'),
        dato('conclusion', 'Conclusion en una o dos frases (cual es el activo real y que trato tiene sentido):'),
      ],
    },
  },
  {
    id: 'q_dd',
    fase: 'Q6',
    titulo: 'Armar y enviar el due diligence form a Stella',
    que: [
      'El formulario se arma solo con el formato de la plantilla de Notion (Alice Sub-Agent / Channel Due Diligence Form) y todo lo que registraste. Revisa que nada este inventado.',
      'Crea la pagina en Notion con ese contenido y adjunta las capturas en el apendice (A: estadisticas, B: precios, C: ultimos posts, D: seguimiento).',
      'La seccion 8 (Approval) la llena Stella. El DD y el contrato son dos aprobaciones separadas.',
    ],
    prueba: {
      tipo: 'formulario',
      pide: 'Escribe el resumen final y te armo el formulario completo.',
      campos: [
        dato('resumen', 'Resumen final (canales, activo real, engagement, audiencia, trato propuesto, recomendacion y lo que sigue abierto):'),
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
    fase: 'Q6',
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
  textoSinExpedientes: 'Todavia no tienes expedientes en Calificacion. Cuando un KOL confirme la primera llamada, usa /llamada.',
  textoNuevo: 'Abriendo expediente de calificacion. Lo normal es que llegue desde Outreach cuando se confirma la primera llamada.',
  ayuda: AYUDA,
  cierre: (a) => [{ titulo: `✅ ${a.nombre} · DD aprobado`, texto: 'Este expediente ya paso al escritorio de Activacion. Usa /activacion para seguir.' }],
};

module.exports = { FLUJO_CALIFICACION, ddForm, calcularScore, evaluarMetricas, evaluarCanal, banderasRojas, VAGOS, HORA };
