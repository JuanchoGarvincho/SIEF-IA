const { sql, getPool } = require('../config/db');

// Escribe una fila en AUDITORIA_ACCESOS (tabla del documento).
// Si falla, solo lo muestra en consola: la auditoría no debe tumbar la petición principal.
async function auditar(cedula, modulo, accion) {
  try {
    const pool = await getPool();
    await pool.request()
      .input('c', sql.NVarChar, cedula)
      .input('m', sql.NVarChar, modulo)
      .input('a', sql.NVarChar, accion)
      .query(`INSERT INTO dbo.AUDITORIA_ACCESOS (cedula_usuario, modulo_visitado, accion_realizada)
              VALUES (@c, @m, @a)`);
  } catch (e) {
    console.error('No se pudo registrar la auditoría:', e.message);
  }
}

module.exports = { auditar };
