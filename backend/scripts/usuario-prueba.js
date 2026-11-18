// Crea (o actualiza) un usuario de prueba que puede entrar como ESTUDIANTE y como JURADO
// con el mismo correo y clave.
// Uso:  npm run usuario-prueba -- <correo> <clave> ["Nombre completo"]
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool, query } = require('../src/config/db');

async function main() {
  const [correoArg, clave, nombre = 'Usuario de Prueba'] = process.argv.slice(2);
  if (!correoArg || !clave) throw new Error('Uso: npm run usuario-prueba -- <correo> <clave> ["Nombre"]');
  const correo = correoArg.trim().toLowerCase(); // el login compara en minúsculas
  const hash = await bcrypt.hash(clave, 10);

  // id_programa 102 = Ingeniería de Sistemas, id_facultad 1 = Ingeniería de Sistemas, roles 1/2
  await query(
    `INSERT INTO estudiante (cedula_estudiante, id_programa, id_rol, nombre_completo, correo, clave_hash)
     VALUES ('PRUEBA-EST', 102, 1, $1, $2, $3)
     ON CONFLICT (cedula_estudiante) DO UPDATE
       SET nombre_completo = EXCLUDED.nombre_completo, correo = EXCLUDED.correo,
           clave_hash = EXCLUDED.clave_hash, id_estado = 1`,
    [nombre, correo, hash]);
  await query(
    `INSERT INTO jurado (cedula_jurado, id_facultad, id_rol, nombre_completo, especialidad, correo, clave_hash)
     VALUES ('PRUEBA-JUR', 1, 2, $1, 'Pruebas', $2, $3)
     ON CONFLICT (cedula_jurado) DO UPDATE
       SET nombre_completo = EXCLUDED.nombre_completo, correo = EXCLUDED.correo,
           clave_hash = EXCLUDED.clave_hash, id_estado = 1`,
    [nombre, correo, hash]);

  console.log(`Listo: ${correo} puede entrar como estudiante y como jurado.`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => pool.end());
