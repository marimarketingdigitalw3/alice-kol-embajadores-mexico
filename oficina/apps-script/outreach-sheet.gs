/**
 * Puente entre el bot de outreach y el sheet "Leads".
 *
 * Se pega en el sheet de outreach (Extensiones > Apps Script) y se publica como aplicacion web
 * ("Ejecutar como: yo", "Quien tiene acceso: cualquier persona"). Corre con la cuenta de Maria, asi
 * que no hay que compartir el sheet con nadie. Solo responde a quien manda la CLAVE correcta.
 *
 * Solo puede leer la pestana Leads y escribir tres columnas: Status (D), Next step (Y) y
 * Team Notes (AG). En Team Notes solo agrega al final; nunca borra lo que ya existe.
 */

var CLAVE = 'PEGA_AQUI_LA_CLAVE';
var PESTANA = 'Leads';
var FILA_INICIO = 5;
var COLUMNAS = 33; // A:AG

function doPost(e) {
  var p = JSON.parse(e.postData.contents || '{}');
  if (p.clave !== CLAVE) return json_({ ok: false, error: 'no autorizado' });
  var hoja = SpreadsheetApp.getActive().getSheetByName(PESTANA);
  if (p.accion === 'leer') {
    var n = hoja.getLastRow() - FILA_INICIO + 1;
    var filas = n > 0 ? hoja.getRange(FILA_INICIO, 1, n, COLUMNAS).getDisplayValues() : [];
    return json_({ ok: true, filas: filas });
  }
  if (p.accion === 'escribir') {
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var nums = hoja.getRange(FILA_INICIO, 1, Math.max(1, hoja.getLastRow() - FILA_INICIO + 1), 2).getDisplayValues();
      var filasNum = [];
      for (var i = 0; i < nums.length; i++) if (String(nums[i][0]).trim() === String(p.num)) filasNum.push(i);
      if (filasNum.length !== 1) return json_({ ok: false, error: filasNum.length ? 'el # ' + p.num + ' esta repetido' : 'no existe el # ' + p.num });
      var idx = filasNum[0];
      if (p.kol && String(nums[idx][1]).trim() !== String(p.kol).trim()) return json_({ ok: false, error: 'el # ' + p.num + ' ya no corresponde a ' + p.kol });
      var fila = FILA_INICIO + idx;
      if (p.status) hoja.getRange(fila, 4).setValue(p.status);
      if (p.next) hoja.getRange(fila, 25).setValue(p.next);
      if (p.nota) {
        var celda = hoja.getRange(fila, 33);
        var actual = String(celda.getValue() || '');
        celda.setValue(actual ? actual + '\n' + p.nota : p.nota);
      }
      SpreadsheetApp.flush();
      var hoy = hoja.getRange(fila, 1, 1, COLUMNAS).getDisplayValues()[0];
      return json_({ ok: true, fila: fila, status: hoy[3], next: hoy[24] });
    } finally {
      lock.releaseLock();
    }
  }
  return json_({ ok: false, error: 'accion desconocida' });
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
