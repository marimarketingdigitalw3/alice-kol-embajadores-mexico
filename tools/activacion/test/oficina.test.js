'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { crearOficina } = require('../oficina');
const { storeMemoria } = require('../store');
const { calcularScore } = require('../calificacion');

const BD = { id: 7, nombre: 'Mar' };

function nueva() {
  const of = crearOficina({
    stores: { oficina: storeMemoria(), activacion: storeMemoria(), calificacion: storeMemoria() },
    ahora: () => new Date('2026-11-04T23:00:00Z'),
  });
  const tx = (texto) => of.recibir({ usuario: BD, texto });
  const bt = (boton) => of.recibir({ usuario: BD, boton });
  const foto = () => of.recibir({ usuario: BD, foto: { id: 'f1' } });
  const todo = (s) => s.map((x) => `${x.titulo || ''} ${x.texto || ''} ${x.guion ? x.guion.texto : ''}`).join('\n');
  const exp = () => Object.values(of.motores.c._estado.agentes)[0];
  const act = () => Object.values(of.motores.a._estado.agentes)[0];
  const pasoC = () => of.motores.c.pasoActual(exp());
  return { of, tx, bt, foto, todo, exp, act, pasoC };
}

function abrir(o) {
  o.tx('/llamada');
  o.tx('Picks Pro MX'); o.tx('12'); o.tx('Telegram @pickspro'); o.tx('https://t.me/pickspromx');
  o.bt('c|o:grupo');
  return o.tx('2026-11-06');
}

function hastaMetricas(o) {
  abrir(o);
  o.bt('c|h'); o.bt('c|o:chico'); o.bt('c|o:si'); o.bt('c|o:si'); o.bt('c|o:si');
  o.bt('c|h'); o.foto();
  o.bt('c|h'); for (let i = 0; i < 5; i += 1) o.bt('c|o:no');
}

test('el menu muestra los tres escritorios', () => {
  const o = nueva();
  const out = o.tx('/oficina');
  assert.match(o.todo(out), /Outreach[\s\S]*Calificacion[\s\S]*Activacion/);
});

test('/llamada abre expediente en Calificacion con el primer paso', () => {
  const o = nueva();
  const out = abrir(o);
  assert.match(o.todo(out), /Entrar al grupo/);
  assert.strictEqual(o.pasoC().id, 'q_grupo');
});

test('grupo de casa con licencia, prueba de 2 minutos y veto bloquean', () => {
  const o = nueva();
  abrir(o);
  o.bt('c|h');
  assert.match(o.todo(o.bt('c|o:casa')), /otra marca/);
  assert.strictEqual(o.pasoC().id, 'q_grupo');

  o.bt('c|h'); o.bt('c|o:chico'); o.bt('c|o:si'); o.bt('c|o:no');
  assert.match(o.todo(o.bt('c|o:si')), /prueba de 2 minutos/);

  o.bt('c|h'); o.bt('c|o:chico'); o.bt('c|o:si'); o.bt('c|o:si'); o.bt('c|o:si');
  o.bt('c|h'); o.foto();
  o.bt('c|h'); o.bt('c|o:no');
  assert.match(o.todo(o.bt('c|o:si')), /VETADO/);
  assert.strictEqual(o.pasoC().id, 'q_veto');
});

test('metricas bajo el minimo bloquean', () => {
  const o = nueva();
  hastaMetricas(o);
  o.bt('c|h'); o.tx('20'); o.tx('3'); o.tx('50'); o.tx('6');
  const out = o.todo(o.tx('2'));
  assert.match(out, /No pasa el minimo/);
  assert.match(out, /Mensajes en 24 h/);
});

test('scorecard: Tier C detiene, Tier B exige una semana de observacion', () => {
  assert.strictEqual(calcularScore({ scA: true, scB: true, scC: true, scD: true, scE: true, scF: true, bonus: 0 }).tier, 'B');
  assert.strictEqual(calcularScore({ scA: true, scB: true, scC: true, scD: true, scE: true, scF: true, bonus: 10 }).tier, 'A');
  const o = nueva();
  hastaMetricas(o);
  o.bt('c|h'); o.tx('80'); o.tx('12'); o.tx('55'); o.tx('9'); o.tx('2');
  o.bt('c|h'); ['si', 'si', 'si', 'si', 'si', 'si'].forEach((x) => o.bt(`c|o:${x}`)); o.tx('0'); o.tx('nada');
  assert.match(o.todo(o.bt('c|o:no')), /sigue observando/);
});

test('recorrido completo: llamada -> calificacion -> DD -> activacion -> contrato', () => {
  const o = nueva();
  hastaMetricas(o);
  o.bt('c|h'); o.tx('80'); o.tx('12'); o.tx('55'); o.tx('9'); o.tx('2');
  o.bt('c|h'); ['si', 'si', 'si', 'si', 'si', 'si'].forEach((x) => o.bt(`c|o:${x}`)); o.tx('12'); o.tx('quejas de retiros lentos');
  assert.strictEqual(o.exp().tier, 'A');
  o.bt('c|h'); ['si', 'si', 'si', 'si', 'si'].forEach((x) => o.bt(`c|o:${x}`));
  o.bt('c|h'); o.tx('@owner, @tip1, @tip2'); o.tx('Caliente en boletos'); o.tx('retiros lentos en Caliente');
  assert.strictEqual(o.pasoC().id, 'q_prep');
  o.bt('c|h'); o.foto();

  // checklist de la llamada obligatorio
  assert.match(o.todo(o.bt('c|h')), /Faltan estos puntos/);
  for (let i = 0; i < 4; i += 1) o.bt(`c|k:${i}`);
  o.bt('c|h');
  assert.match(o.todo(o.tx('Mexico, EEUU')), /restringida/);
  o.bt('c|h'); o.tx('Mexico'); o.tx('espanol'); o.tx('40'); o.tx('15'); o.tx('ninguna'); o.bt('c|o:no'); o.tx('no sabe'); o.bt('c|o:si');

  // no quiere manejar dinero: el sistema de agentes no se acepta
  o.bt('c|h');
  assert.match(o.todo(o.bt('c|o:sistema')), /no quiere manejar dinero/);
  o.bt('c|o:referido'); o.tx('no quiere tocar dinero de nadie');

  // DD form generado
  o.bt('c|h'); o.tx('ninguno');
  const dd = o.todo(o.tx('Aprobar, Tier A, empezar con link de referido'));
  assert.match(dd, /DUE DILIGENCE FORM/);
  assert.match(dd, /TOTAL SCORE: 80 \/ 100 · TIER A/);
  assert.match(dd, /retiros lentos en Caliente/);
  o.foto();

  // Aprobacion de Stella -> traspaso automatico a Activacion
  o.bt('c|h');
  const traspaso = o.todo(o.foto());
  assert.match(traspaso, /pasa al escritorio de ACTIVACION/);
  assert.match(traspaso, /segunda llamada/);
  const a = o.act();
  assert.strictEqual(a.nombre, 'Picks Pro MX');
  assert.strictEqual(a.modelo, 'referido');
  assert.strictEqual(a.firmado, null);
  assert.strictEqual(o.of.motores.a.pasoActual(a).id, 'c0_segunda');

  // Sin firma no hay plazos vencidos
  assert.strictEqual(o.of.revisarPlazos().flatMap((x) => x.salidas).filter((s) => /VENCIDO/.test(s.texto)).length, 0);

  o.bt('a|h'); o.foto();
  assert.match(o.todo(o.bt('a|h')), /Faltan estos puntos/);
  for (let i = 0; i < 5; i += 1) o.bt(`a|k:${i}`);
  o.bt('a|h');
  const firma = o.todo(o.foto());
  assert.match(firma, /corren los plazos/);
  assert.ok(o.act().firmado);
  assert.strictEqual(o.of.motores.a.pasoActual(o.act()).id, 'c1_tracker');
  assert.match(o.todo(o.tx('/pipeline')), /Picks Pro MX/);
});

test('un boton viejo de otro escritorio va a su escritorio correcto', () => {
  const o = nueva();
  abrir(o);
  o.tx('/activacion');
  const out = o.bt('c|g');
  assert.ok(Array.isArray(out));
  assert.strictEqual(o.of._estado.usuarios['7'].escritorio, 'c');
});

test('comandos de activacion no aplican en calificacion', () => {
  const o = nueva();
  abrir(o);
  assert.match(o.todo(o.tx('/subagentes')), /escritorio de Activacion/);
});
