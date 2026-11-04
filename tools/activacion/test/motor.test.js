'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { crearMotor } = require('../motor');
const { storeMemoria } = require('../store');
const { renderTelegram } = require('../telegram');
const P = require('../pasos');

const BD = { id: 42, nombre: 'Mar' };
const WALLET = `0x${'a'.repeat(40)}`;
const HASH = `0x${'b'.repeat(64)}`;

function nuevoMotor(opts = {}) {
  let t = new Date('2026-11-04T10:00:00Z');
  const reloj = { avanzar: (h) => { t = new Date(t.getTime() + h * 3600 * 1000); } };
  const motor = crearMotor({ store: storeMemoria(), ahora: () => t, ...opts });
  const tx = (texto) => motor.recibir({ usuario: BD, texto });
  const bt = (boton) => motor.recibir({ usuario: BD, boton });
  const foto = () => motor.recibir({ usuario: BD, foto: { id: 'file123' } });
  const todo = (salidas) => salidas.map((s) => `${s.titulo || ''} ${s.texto || ''} ${s.guion ? s.guion.texto : ''}`).join('\n');
  return { motor, tx, bt, foto, todo, reloj };
}

function alta(m, modelo = 'ambos', tipo = 'grupo') {
  m.tx('/nuevo');
  m.tx('Canal Prueba');
  m.bt(`o:${tipo}`);
  m.tx('espanol');
  m.bt(`o:${modelo}`);
  return m.bt('o:hoy');
}

const actual = (m) => { const a = Object.values(m.motor._estado.agentes)[0]; return P.PASOS.filter((p) => !p.aplica || p.aplica(a)).find((p) => !a.pasos[p.id]); };

function llenarDatos(m, region = 'Mexico') {
  m.bt('h');
  m.tx(WALLET); m.tx('pruebita'); m.tx('plataforma'); m.tx('15'); m.bt('o:si');
  m.tx(region);
  return m.bt('o:si');
}

test('crea el agente y arranca en el primer paso de la firma', () => {
  const m = nuevoMotor();
  const out = alta(m);
  assert.match(m.todo(out), /Agente #1 creado/);
  assert.strictEqual(actual(m).id, 'c1_tracker');
});

test('no avanza sin prueba: texto corto rechazado, captura aceptada', () => {
  const m = nuevoMotor();
  alta(m);
  m.bt('h');
  assert.match(m.todo(m.tx('listo')), /al menos 15/);
  assert.strictEqual(actual(m).id, 'c1_tracker');
  m.foto();
  assert.strictEqual(actual(m).id, 'c1_datos');
});

test('wallet invalida, China y region restringida bloquean el alta', () => {
  const m = nuevoMotor();
  alta(m);
  m.bt('h'); m.foto();
  m.bt('h');
  assert.match(m.todo(m.tx('0x123')), /No es una wallet EVM/);
  m.tx(WALLET); m.tx('pruebita'); m.tx('plataforma');
  assert.match(m.todo(m.tx('10')), /parte de 15%/);
  m.tx('22'); m.bt('o:si');
  assert.match(m.todo(m.tx('5')), /contrapartida/);
  m.tx('exclusividad 6 meses');
  assert.match(m.todo(m.tx('Mexico, China')), /PROHIBIDA/);
  assert.strictEqual(actual(m).id, 'c1_datos');

  llenarDatos(m, 'Vietnam');
  assert.strictEqual(actual(m).id, 'c1_datos');
  const a = Object.values(m.motor._estado.agentes)[0];
  assert.match(a.bloqueo, /Region restringida/);
});

test('tasa sin aprobar de Stella bloquea', () => {
  const m = nuevoMotor();
  alta(m);
  m.bt('h'); m.foto();
  m.bt('h'); m.tx(WALLET); m.tx('x1'); m.tx('plataforma'); m.tx('15');
  assert.match(m.todo(m.bt('o:no')), /aprueba Stella/);
  assert.strictEqual(actual(m).id, 'c1_datos');
});

test('subagentes y mantenimiento cerrados antes de M4', () => {
  const m = nuevoMotor();
  alta(m);
  assert.match(m.todo(m.tx('/subagentes')), /Cerrado hasta M4/);
  assert.match(m.todo(m.tx('/semanal')), /despues de M4/);
});

test('recorrido completo hasta M4 y subagentes, con todos los candados', () => {
  const m = nuevoMotor();
  alta(m, 'ambos', 'grupo');
  m.bt('h'); m.foto(); // tracker
  llenarDatos(m);
  assert.strictEqual(actual(m).id, 'c1_firma');

  const avanzar = (id, fn) => { assert.strictEqual(actual(m).id, id); m.bt('h'); fn(); };
  avanzar('c1_firma', () => m.tx('Respondio 10:32: si, es mi OKX'));
  // El mensaje a CS exige captura
  m.bt('h');
  assert.match(m.todo(m.tx('mensaje enviado a CS hoy')), /CAPTURA/);
  m.foto();
  avanzar('c1_avisos', () => m.tx('Mensaje 3 enviado 10:40 por DM'));
  avanzar('m1_alta', () => m.tx('Stella confirmo 14:00 por DM'));
  avanzar('m1_listo', () => m.tx('Enviado 14:05 por Telegram'));
  avanzar('m1_login', () => m.foto());
  assert.ok(Object.values(m.motor._estado.agentes)[0].hitos.M1);

  // Checklist de materiales obligatorio
  assert.strictEqual(actual(m).id, 'c2_materiales');
  assert.match(m.todo(m.bt('h')), /Faltan estos puntos/);
  for (let i = 0; i < 5; i += 1) m.bt(`k:${i}`);
  m.bt('h'); m.foto();

  for (const id of ['c3_red', 'c3_regiones', 'c3_retiro', 'm2_apertura']) avanzar(id, () => m.tx('Enviado 15:10 por DM, confirmo leido'));
  avanzar('m2_cliente', () => m.foto());
  m.bt('h');
  assert.match(m.todo(m.tx('0xabc')), /hash valido/);
  m.tx(HASH);
  for (const id of ['m2_asignar', 'm2_apostar']) avanzar(id, () => m.foto());
  avanzar('m2_ticket', () => m.tx('Revisamos juntos la conciliacion 16:00'));
  avanzar('m2_liquidada', () => m.foto());
  assert.ok(Object.values(m.motor._estado.agentes)[0].hitos.M2);

  for (const id of ['c7_cero', 'c7_7030', 'c7_overview', 'c7_comision']) avanzar(id, () => m.tx('Enviado 17:00 por DM, sin dudas'));
  avanzar('m3_post', () => m.foto());
  m.bt('h');
  assert.match(m.todo(m.tx('https://kixly.co/referral')), /COMPLETO/);
  m.tx('https://kixly.co/?code=ABC123');
  assert.strictEqual(Object.values(m.motor._estado.agentes)[0].linkReferido, 'https://kixly.co/?code=ABC123');
  assert.strictEqual(actual(m).id, 'm3_sistema');
  for (let i = 0; i < 4; i += 1) m.bt(`k:${i}`);
  m.bt('h'); m.foto();
  avanzar('m3_contenido', () => m.tx('Calendario enviado 18:00'));
  avanzar('m3_campana', () => m.foto());
  avanzar('m3_cliente', () => m.foto());
  assert.ok(Object.values(m.motor._estado.agentes)[0].hitos.M3);

  // Liquidacion: formulario con calculo y captura final
  m.bt('h'); m.tx('1200'); m.tx('200');
  const calc = m.todo(m.tx('primer periodo'));
  assert.match(calc, /A pagar: 150 USDT/);
  assert.match(calc, /Pagado ahora \(70 %\): 105 USDT/);
  assert.match(m.todo(m.tx('ya lo mande')), /captura/);
  m.foto();
  avanzar('m4_comision', () => m.foto());
  avanzar('m4_retiro', () => m.tx(HASH));
  const a = Object.values(m.motor._estado.agentes)[0];
  assert.ok(a.hitos.M4);
  assert.match(m.todo(m.tx('/subagentes')), /primera comisión/);
  avanzar('c8_subagentes', () => m.tx('Enviado 19:00, va a pensar en 2 personas'));
  assert.strictEqual(actual(m), undefined);
  assert.match(m.todo(m.tx('/paso')), /MANTENIMIENTO/);
  assert.match(m.todo(m.tx('/resumen')), /M1 2026-11-04/);
});

test('modelo solo sistema no exige link de referido', () => {
  const m = nuevoMotor();
  alta(m, 'sistema', 'grupo');
  const a = Object.values(m.motor._estado.agentes)[0];
  const ids = P.PASOS.filter((p) => !p.aplica || p.aplica(a)).map((p) => p.id);
  assert.ok(!ids.includes('m3_link'));
  assert.ok(ids.includes('m3_sistema'));
});

test('alerta de plazo vencido de M1 y recordatorio diario', () => {
  const m = nuevoMotor();
  alta(m);
  m.reloj.avanzar(25);
  const avisos = m.motor.revisarPlazos();
  const texto = avisos.flatMap((x) => x.salidas).map((s) => s.texto).join('\n');
  assert.match(texto, /M1 VENCIDO/);
  assert.match(texto, /Actualiza hoy el tracker/);
  assert.strictEqual(m.motor.revisarPlazos().length, 0, 'no repite alertas el mismo dia');
});

test('acceso restringido a IDs permitidos', () => {
  const m = nuevoMotor({ permitidos: ['999'] });
  assert.match(m.todo(m.tx('/ayuda')), /Acceso solo/);
});

test('no se pueden ver guiones de pasos futuros desde reactivar', () => {
  const m = nuevoMotor();
  alta(m);
  assert.match(m.todo(m.bt('rx:2')), /aun no alcanza/);
});

test('render de Telegram escapa HTML y pone guiones en <pre>', () => {
  const [r] = renderTelegram({ guion: { etiqueta: '📤 ENVIAR', titulo: 'x', texto: 'a < b & c' } });
  assert.match(r.texto, /<pre>a &lt; b &amp; c<\/pre>/);
});

test('ningun guion usa raya larga ni promesas prohibidas', () => {
  const a = { modelo: 'ambos', tipoCanal: 'grupo', tasa: 20, wallet: WALLET };
  for (const p of P.PASOS) {
    for (const g of (p.guiones ? p.guiones(a) : [])) {
      assert.ok(!/[—–]/.test(g.texto), `raya larga en ${p.id}`);
      if (g.tipo !== 'INTERNO') assert.ok(!/garantizad[oa]s?\b(?! )|sin limite|cubrimos tus perdidas/i.test(g.texto.replace(/sin resultados garantizados/i, '')), `promesa prohibida en ${p.id}`);
    }
  }
});

test('ningun mensaje para el KOL pasa de 6 lineas (los largos se parten)', () => {
  const a = { modelo: 'ambos', tipoCanal: 'canal', tasa: 20, wallet: WALLET };
  for (const p of P.PASOS) {
    for (const g of (p.guiones ? p.guiones(a) : [])) {
      if (g.tipo === 'INTERNO') continue;
      for (const parte of P.partirMensaje(g.texto)) {
        assert.ok(parte.split('\n').filter((l) => l.trim()).length <= 6, `${p.id}: ${g.titulo}`);
      }
    }
  }
  assert.strictEqual(P.partirMensaje('1\n2\n3\n4\n5\n6\n7\n8').length, 2);
});

test('el orden del dia de firma es: datos, firma, CS, advertencias', () => {
  const ids = P.PASOS.map((p) => p.id);
  assert.ok(ids.indexOf('c1_datos') < ids.indexOf('c1_firma'));
  assert.ok(ids.indexOf('c1_firma') < ids.indexOf('c1_cs'));
  assert.ok(ids.indexOf('c1_cs') < ids.indexOf('c1_avisos'));
  assert.match(P.PASOS.find((p) => p.id === 'c1_datos').guiones({})[0].texto, /escribe "platform"/);
});
