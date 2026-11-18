// Copia la base local de SQL Server (SIEF_IA) a PostgreSQL (Render).
// Uso:  npm run migrar
// Necesita en .env:  DATABASE_URL (Postgres destino) y MSSQL_SERVER / MSSQL_DATABASE (origen).
// 1) Crea las tablas con sql/postgres_schema.sql
// 2) Vacía las tablas destino y copia todas las filas
// 3) Ajusta los contadores de los IDs para que los nuevos INSERT no choquen
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sql = require('mssql/msnodesqlv8');
const { pool } = require('../src/config/db');

// En orden de dependencias (primero las tablas a las que otras apuntan)
const TABLAS = [
  'Estado', 'Facultad', 'ProgramaAcademico', 'RolUsuario', 'Materia', 'Ubicacion',
  'Estudiante', 'Jurado', 'Proyecto', 'Evaluacion', 'DetalleNota',
  'ConsentimientoDato', 'AuditoriaAcceso',
];

// IdPrograma -> id_programa, PreguntaIa1 -> pregunta_ia_1
const snake = (s) => s.replace(/([a-z])([A-Z0-9])/g, '$1_$2').toLowerCase();

async function main() {
  const origen = await sql.connect({
    connectionString:
      `Driver={ODBC Driver 18 for SQL Server};Server=${process.env.MSSQL_SERVER || 'localhost'};` +
      `Database=${process.env.MSSQL_DATABASE || 'SIEF_IA'};Trusted_Connection=yes;TrustServerCertificate=yes;`,
  });

  console.log('Creando tablas en Postgres...');
  await pool.query(fs.readFileSync(path.join(__dirname, '../sql/postgres_schema.sql'), 'utf8'));

  const destinos = TABLAS.map(snake);
  await pool.query(`TRUNCATE ${destinos.join(', ')} RESTART IDENTITY CASCADE`);

  for (const tabla of TABLAS) {
    const filas = (await origen.request().query(`SELECT * FROM dbo.${tabla}`)).recordset;
    const destino = snake(tabla);
    for (const fila of filas) {
      const cols = Object.keys(fila);
      await pool.query(
        `INSERT INTO ${destino} (${cols.map(snake).join(', ')}) OVERRIDING SYSTEM VALUE
         VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`,
        cols.map((c) => fila[c]));
    }

    // Si la tabla tiene id autoincremental, el contador sigue desde el máximo copiado
    const pk = `id_${destino.replace(/_(acceso|dato|academico|usuario|nota)$/, '')}`;
    const seq = (await pool.query('SELECT pg_get_serial_sequence($1, $2) AS s', [destino, pk])).rows[0]?.s;
    if (seq) await pool.query(`SELECT setval($1, COALESCE((SELECT MAX(${pk}) FROM ${destino}), 0) + 1, false)`, [seq]);

    console.log(`  ${destino}: ${filas.length} filas`);
  }

  await origen.close();
  console.log('Migración terminada.');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => pool.end());
