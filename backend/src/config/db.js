const { Pool } = require('pg');

// DATABASE_URL es la "External Database URL" (desde tu PC) o la "Internal Database URL"
// (desde un Web Service de Render) que aparece en el panel de la base de datos.
const url = process.env.DATABASE_URL;
const esLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url || '');

// Un solo pool de conexiones que se reutiliza en todas las peticiones.
// Render exige SSL para conexiones externas.
const pool = new Pool({
  connectionString: url,
  ssl: esLocal ? false : { rejectUnauthorized: false },
  max: 5,
});

// Consulta con parámetros $1, $2... (evita inyección SQL). Devuelve las filas.
async function query(texto, params = []) {
  const r = await pool.query(texto, params);
  return r.rows;
}

// Ejecuta fn(cliente) dentro de una transacción: o se guarda todo o nada.
async function transaccion(fn) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await fn({ query: async (t, p = []) => (await cliente.query(t, p)).rows });
    await cliente.query('COMMIT');
    return resultado;
  } catch (e) {
    await cliente.query('ROLLBACK');
    throw e;
  } finally {
    cliente.release();
  }
}

module.exports = { pool, query, transaccion };
