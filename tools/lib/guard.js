'use strict';

/**
 * Guard de contenido prohibido. Es el ULTIMO chequeo mecanico antes de mandar,
 * no el unico: tu propio Claude Code deberia revisar el mensaje contra las
 * "reglas duras" del README (nunca prometer ingreso fijo, nunca inventar datos,
 * cerrar terminos en llamada, no escribir dos veces el mismo dia, respetar el
 * no) ANTES de llegar aca, porque esas no son todas mecanicas: dependen de
 * entender lo que dice el mensaje, no solo de buscar una palabra.
 *
 * Lo que SI se puede revisar mecanicamente:
 *   - terminos de guion.nunca_decir (comparacion por palabra completa)
 *   - aperturas_prohibidas (regex sobre la primera frase)
 *   - largo maximo por canal
 */

function primeraFrase(texto) {
  const m = String(texto || '').match(/^[^.!?]*[.!?]?/);
  return (m ? m[0] : texto || '').trim();
}

function revisarNuncaDecir(texto, lista) {
  const t = String(texto || '').toLowerCase();
  const hallazgos = [];
  for (const termino of lista || []) {
    const limpio = String(termino).toLowerCase().trim();
    if (!limpio) continue;
    if (limpio.includes(' ')) {
      if (t.includes(limpio)) hallazgos.push(termino);
      continue;
    }
    const esc = limpio.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(^|[^\\w.])${esc}([^\\w]|$)`, 'i').test(t)) hallazgos.push(termino);
  }
  return hallazgos;
}

function revisarAperturas(texto, patrones) {
  const frase = primeraFrase(texto);
  const hallazgos = [];
  for (const p of patrones || []) {
    try {
      if (new RegExp(p, 'i').test(frase)) hallazgos.push(p);
    } catch { /* patron invalido en config, se ignora */ }
  }
  return hallazgos;
}

/**
 * @param {string} texto
 * @param {string} canal x|instagram|telegram|email
 * @param {object} config campana.json ya cargado
 * @returns {{ok: boolean, motivos: string[]}}
 */
function revisar(texto, canal, config) {
  const g = config.guion || {};
  const motivos = [];

  const nuncaDecir = revisarNuncaDecir(texto, g.nunca_decir);
  if (nuncaDecir.length) motivos.push(`nombra termino(s) prohibido(s): ${nuncaDecir.join(', ')}`);

  const aperturas = revisarAperturas(texto, g.aperturas_prohibidas);
  if (aperturas.length) motivos.push('la primera frase abre con un patron prohibido (disculpa, duda, negativo)');

  const max = (g.max_chars || {})[canal];
  if (Number.isFinite(max) && String(texto || '').length > max) {
    motivos.push(`${String(texto).length} caracteres, mas que el maximo de ${max} para ${canal}`);
  }

  if (String(texto || '').includes('—') || String(texto || '').includes('–')) {
    motivos.push('usa raya larga (— o –). Coma, punto o dos puntos en su lugar.');
  }

  return { ok: motivos.length === 0, motivos };
}

module.exports = { revisar, primeraFrase, revisarNuncaDecir, revisarAperturas };
