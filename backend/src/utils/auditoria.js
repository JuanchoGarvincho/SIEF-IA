const { query } = require('../config/db');

// Escribe una fila en auditoria_acceso.
// Si falla, solo lo muestra en consola: la auditoría no debe tumbar la petición principal.
async function auditar(cedula, modulo, accion) {
  try {
    await query(
      `INSERT INTO auditoria_acceso (cedula_usuario, modulo_visitado, accion_realizada)
       VALUES ($1, $2, $3)`,
      [cedula, modulo.slice(0, 100), accion.slice(0, 100)]);
  } catch (e) {
    console.error('No se pudo registrar la auditoría:', e.message);
  }
}

module.exports = { auditar };
