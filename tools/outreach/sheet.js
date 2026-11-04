'use strict';

/** Acceso al sheet de outreach a traves del Apps Script publicado como aplicacion web. */

function crearSheetScript({ url = process.env.OUTREACH_SHEET_URL, clave = process.env.OUTREACH_SHEET_CLAVE } = {}) {
  async function llamar(cuerpo) {
    if (!url || !clave) throw new Error('Falta conectar el sheet (OUTREACH_SHEET_URL y OUTREACH_SHEET_CLAVE).');
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ clave, ...cuerpo }), redirect: 'follow' });
    const txt = await r.text();
    let j;
    try { j = JSON.parse(txt); } catch { throw new Error(`El sheet respondio algo que no es JSON (HTTP ${r.status}). Revisa que el Apps Script este publicado con acceso "cualquier persona".`); }
    if (!j.ok) throw new Error(`Sheet: ${j.error}`);
    return j;
  }
  return {
    leer: async () => (await llamar({ accion: 'leer' })).filas,
    escribir: (cambio) => llamar({ accion: 'escribir', ...cambio }),
  };
}

/** Sheet en memoria con el mismo contrato (para pruebas). */
function crearSheetMemoria(filas) {
  const data = filas.map((f) => f.slice());
  return {
    data,
    leer: async () => data.map((f) => f.slice()),
    escribir: async ({ num, kol, status, next, nota }) => {
      const idx = data.map((f, i) => (String(f[0]) === String(num) ? i : -1)).filter((i) => i >= 0);
      if (idx.length !== 1) throw new Error(`Sheet: el # ${num} no existe o esta repetido`);
      const f = data[idx[0]];
      if (kol && f[1] !== kol) throw new Error(`Sheet: el # ${num} ya no corresponde a ${kol}`);
      if (status) f[3] = status;
      if (next) f[24] = next;
      if (nota) f[32] = f[32] ? `${f[32]}\n${nota}` : nota;
      return { ok: true };
    },
  };
}

module.exports = { crearSheetScript, crearSheetMemoria };
