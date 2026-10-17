// Carga DATOS DE PRUEBA sobre la base del documento (SIEF_IA, 12 tablas).
// Uso:  npm run seed
// - No borra nada de lo que ya insertó tu equipo.
// - Los usuarios de prueba usan cédulas "DEMO-..." para no chocar con las reales.
// - Si ya existen (DEMO-E1), no hace nada.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sql, getPool } = require('../src/config/db');

async function main() {
  const pool = await getPool();

  const ya = await pool.request().query(`SELECT 1 AS x FROM dbo.ESTUDIANTE WHERE cedula_estudiante = 'DEMO-E1'`);
  if (ya.recordset.length) {
    console.log('Los datos de prueba ya existen. No se hizo nada.');
    return;
  }

  // Las tablas del documento usan ids INT sin IDENTITY: hay que calcular el siguiente.
  async function siguienteId(tabla, col) {
    const r = await pool.request().query(`SELECT ISNULL(MAX(${col}), 0) + 1 AS id FROM dbo.${tabla}`);
    return r.recordset[0].id;
  }

  // Busca por nombre; si no existe, lo crea. Así reutiliza lo que tu equipo ya cargó.
  async function idPorNombre(tabla, colId, colNombre, nombre, extra = {}) {
    const r = await pool.request().input('n', sql.NVarChar, nombre)
      .query(`SELECT ${colId} AS id FROM dbo.${tabla} WHERE ${colNombre} = @n`);
    if (r.recordset[0]) return r.recordset[0].id;

    const id = await siguienteId(tabla, colId);
    const req = pool.request().input('id', sql.Int, id).input('n', sql.NVarChar, nombre);
    let cols = `${colId}, ${colNombre}`;
    let vals = '@id, @n';
    for (const [k, v] of Object.entries(extra)) {
      req.input(k, sql.Int, v);
      cols += `, ${k}`;
      vals += `, @${k}`;
    }
    await req.query(`INSERT INTO dbo.${tabla} (${cols}) VALUES (${vals})`);
    return id;
  }

  async function idUbicacion(stand, salon) {
    const r = await pool.request().input('s', sql.NVarChar, stand)
      .query('SELECT id_ubicacion AS id FROM dbo.UBICACION WHERE stand = @s');
    if (r.recordset[0]) return r.recordset[0].id;
    const id = await siguienteId('UBICACION', 'id_ubicacion');
    await pool.request().input('id', sql.Int, id).input('sa', sql.NVarChar, salon).input('s', sql.NVarChar, stand)
      .query('INSERT INTO dbo.UBICACION (id_ubicacion, nomenclatura_salon, stand) VALUES (@id, @sa, @s)');
    return id;
  }

  const hash = await bcrypt.hash('123456', 10); // clave de prueba para TODOS los usuarios demo

  // Catálogos
  const facultad = await idPorNombre('FACULTAD', 'id_facultad', 'nombre_facultad', 'Ingeniería de Sistemas');
  const programa = await idPorNombre('PROGRAMA_ACADEMICO', 'id_programa', 'nombre_programa',
    'Ingeniería de Sistemas', { id_facultad: facultad });
  const rolEst = await idPorNombre('ROL_USUARIO', 'id_rol', 'nombre_rol', 'Estudiante');
  const rolJur = await idPorNombre('ROL_USUARIO', 'id_rol', 'nombre_rol', 'Jurado');
  const matProg = await idPorNombre('MATERIA', 'id_materia', 'nombre_materia', 'Programación 3');
  const matIA   = await idPorNombre('MATERIA', 'id_materia', 'nombre_materia', 'Inteligencia Artificial');
  const matBD   = await idPorNombre('MATERIA', 'id_materia', 'nombre_materia', 'Bases de Datos II');

  const ubB22 = await idUbicacion('B22', 'Pabellón Norte');
  const ubA15 = await idUbicacion('A15', 'Pabellón Norte');
  const ubC08 = await idUbicacion('C08', 'Pabellón Sur');
  const ubD11 = await idUbicacion('D11', 'Pabellón Sur');

  // Estudiantes y jurados (con correo y clave para poder iniciar sesión)
  async function estudiante(cedula, nombre, correo) {
    await pool.request()
      .input('c', sql.NVarChar, cedula).input('p', sql.Int, programa).input('r', sql.Int, rolEst)
      .input('n', sql.NVarChar, nombre).input('co', sql.NVarChar, correo).input('h', sql.NVarChar, hash)
      .query(`INSERT INTO dbo.ESTUDIANTE (cedula_estudiante, id_programa, id_rol, nombre_completo, correo, clave_hash)
              VALUES (@c, @p, @r, @n, @co, @h)`);
  }
  async function jurado(cedula, nombre, correo, especialidad) {
    await pool.request()
      .input('c', sql.NVarChar, cedula).input('f', sql.Int, facultad).input('r', sql.Int, rolJur)
      .input('n', sql.NVarChar, nombre).input('e', sql.NVarChar, especialidad)
      .input('co', sql.NVarChar, correo).input('h', sql.NVarChar, hash)
      .query(`INSERT INTO dbo.JURADO (cedula_jurado, id_facultad, id_rol, nombre_completo, especialidad, correo, clave_hash)
              VALUES (@c, @f, @r, @n, @e, @co, @h)`);
  }

  await estudiante('DEMO-E1', 'Mateo Silva Calderón', 'mateo@itc.edu.co');
  await estudiante('DEMO-E2', 'Laura Medina', 'laura@itc.edu.co');
  await estudiante('DEMO-E3', 'Felipe Ochoa', 'felipe@itc.edu.co');
  await estudiante('DEMO-E4', 'Sara Villegas', 'sara@itc.edu.co');
  await jurado('DEMO-J1', 'Jurado Uno', 'jurado1@itc.edu.co', 'Sistemas embebidos');
  await jurado('DEMO-J2', 'Jurado Dos', 'jurado2@itc.edu.co', 'Inteligencia artificial');

  // Proyectos (los mismos 4 de tu mockData.js)
  async function proyecto(cedula, materia, ubicacion, titulo, categoria, resumen, preguntas) {
    const id = await siguienteId('PROYECTO', 'id_proyecto');
    await pool.request()
      .input('id', sql.Int, id).input('c', sql.NVarChar, cedula).input('m', sql.Int, materia)
      .input('u', sql.Int, ubicacion).input('t', sql.NVarChar, titulo).input('cat', sql.NVarChar, categoria)
      .input('r', sql.NVarChar, resumen)
      .input('q1', sql.NVarChar, preguntas[0]).input('q2', sql.NVarChar, preguntas[1]).input('q3', sql.NVarChar, preguntas[2])
      .query(`INSERT INTO dbo.PROYECTO
                (id_proyecto, cedula_estudiante, id_materia, id_ubicacion, titulo, categoria, resumen_tecnico,
                 pregunta_ia_1, pregunta_ia_2, pregunta_ia_3)
              VALUES (@id, @c, @m, @u, @t, @cat, @r, @q1, @q2, @q3)`);
    return id;
  }

  await proyecto('DEMO-E1', matIA, ubB22, 'AgroSense IoT', 'IoT y Agricultura',
    'AgroSense IoT integra sensores de humedad, temperatura y conectividad inalámbrica para optimizar el riego agrícola en tiempo real.', [
      'Como maneja el sistema la latencia en la transmision de datos desde los sensores IoT al servidor central?',
      'Que protocolo de comunicacion utiliza (MQTT, HTTP, CoAP) y por que eligio ese sobre los demas?',
      'Como se validan los datos del sensor para evitar lecturas erroneas o valores atipicos?']);
  await proyecto('DEMO-E2', matIA, ubA15, 'EduBot Assistant', 'IA y Educacion',
    'Asistente conversacional para apoyar el aprendizaje.', [
      'Como mide la mejora en aprendizaje de los estudiantes?',
      'Que estrategia se usa para evitar sesgos en respuestas de IA?',
      'Como maneja privacidad de datos de menores de edad?']);
  const grid = await proyecto('DEMO-E3', matProg, ubC08, 'SmartGrid Monitor', 'Energia Sostenible',
    'Monitoreo de consumo energético en redes eléctricas.', [
      'Que indicadores usa para detectar ineficiencias energeticas?',
      'Como reacciona el sistema ante picos de consumo inesperados?',
      'Que tan escalable es la arquitectura para redes grandes?']);
  await proyecto('DEMO-E4', matBD, ubD11, 'BioScan Lab', 'Biotecnologia',
    'Análisis de muestras biológicas asistido por software.', [
      'Como valida la precision diagnostica en muestras reales?',
      'Que protocolos de bioseguridad se aplican?',
      'Como documentan trazabilidad de resultados?']);

  // SmartGrid ya viene evaluado por los dos jurados (como en tu mockData)
  async function evaluacion(cedulaJurado, idProyecto, i, v, s, nota) {
    const ev = await pool.request()
      .input('j', sql.NVarChar, cedulaJurado).input('p', sql.Int, idProyecto).input('n', sql.NVarChar, nota)
      .query(`INSERT INTO dbo.EVALUACION (cedula_jurado, id_proyecto, notas_rapidas)
              OUTPUT INSERTED.id_evaluacion VALUES (@j, @p, @n)`);
    const idEv = ev.recordset[0].id_evaluacion;
    for (const [criterio, puntaje] of [['innovacion', i], ['viabilidad', v], ['sustentacion', s]]) {
      await pool.request()
        .input('e', sql.Int, idEv).input('c', sql.NVarChar, criterio).input('p', sql.Decimal(3, 1), puntaje)
        .query('INSERT INTO dbo.DETALLE_NOTA (id_evaluacion, criterio_evaluado, puntaje) VALUES (@e, @c, @p)');
    }
  }
  await evaluacion('DEMO-J1', grid, 5, 4, 5, 'Excelente integración y buena escalabilidad.');
  await evaluacion('DEMO-J2', grid, 4, 5, 4, 'Solución sólida; reforzar cifras de validación.');

  console.log('Datos de prueba cargados. Clave de todos los usuarios demo: 123456');
  console.log('Estudiante: mateo@itc.edu.co   |   Jurado: jurado1@itc.edu.co');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => process.exit());
