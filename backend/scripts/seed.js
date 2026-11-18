// Da CORREO y CLAVE DE PRUEBA a los estudiantes y jurados que aún no tienen,
// para poder iniciar sesión. La BD original (SQL Server) no guardaba credenciales.
// Uso:  npm run seed
// - Correo: <cedula>@etitc.edu.co    Clave: 123456
// - No toca a quien ya tenga correo.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool, query } = require('../src/config/db');

async function main() {
  const hash = await bcrypt.hash('123456', 10);

  for (const [tabla, cedula] of [['estudiante', 'cedula_estudiante'], ['jurado', 'cedula_jurado']]) {
    const filas = await query(
      `UPDATE ${tabla} SET correo = ${cedula} || '@etitc.edu.co', clave_hash = $1
        WHERE correo IS NULL RETURNING nombre_completo, correo`,
      [hash]);
    console.log(`${tabla}: ${filas.length} con credenciales nuevas`);
    filas.forEach((f) => console.log(`  ${f.correo}  (${f.nombre_completo})`));
  }
  console.log('Clave de todos: 123456');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => pool.end());
