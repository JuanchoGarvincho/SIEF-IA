const { sql, getPool } = require('../config/db');
const { auditar } = require('../utils/auditoria');

// Los 3 criterios de la pantalla de evaluación. Se guardan como filas en DETALLE_NOTA.
const CRITERIOS = ['innovacion', 'viabilidad', 'sustentacion'];

// Decisión de diseño: el documento NO tiene tabla de asignación jurado-proyecto,
// así que todo jurado ve todos los proyectos que ya tienen stand asignado.
const CONSULTA_BASE = `
  SELECT p.id_proyecto, u.stand, p.titulo AS title,
         ISNULL(p.categoria, 'Sin categoria') AS category,
         e.nombre_completo AS student,
         p.pregunta_ia_1, p.pregunta_ia_2, p.pregunta_ia_3,
         ev.id_evaluacion, ev.notas_rapidas
  FROM dbo.PROYECTO p
  JOIN dbo.ESTUDIANTE e ON e.cedula_estudiante = p.cedula_estudiante
  JOIN dbo.UBICACION  u ON u.id_ubicacion = p.id_ubicacion
  LEFT JOIN dbo.EVALUACION ev ON ev.id_proyecto = p.id_proyecto AND ev.cedula_jurado = @jurado
  WHERE u.stand IS NOT NULL`;

// Convierte las filas de SQL al formato EXACTO que espera tu juradoService.js
async function armarProyectos(pool, filas) {
  const idsEv = filas.map((f) => f.id_evaluacion).filter((x) => x !== null);
  const detalle = {};
  if (idsEv.length) {
    // son enteros que vienen de la base de datos, no del usuario
    const d = await pool.request().query(
      `SELECT id_evaluacion, criterio_evaluado, puntaje
         FROM dbo.DETALLE_NOTA WHERE id_evaluacion IN (${idsEv.join(',')})`);
    d.recordset.forEach((x) => (detalle[x.id_evaluacion] ||= []).push(x));
  }

  return filas.map((f) => {
    const evaluado = f.id_evaluacion !== null;
    const filasNota = detalle[f.id_evaluacion] || [];
    const scores = {};
    let suma = 0;
    filasNota.forEach((x) => {
      suma += Number(x.puntaje);
      if (CRITERIOS.includes(x.criterio_evaluado)) scores[x.criterio_evaluado] = Number(x.puntaje);
    });
    return {
      stand: f.stand,
      title: f.title,
      category: f.category,
      student: f.student,
      status: evaluado ? 'completado' : 'pendiente',
      // Misma fórmula que ya usa tu frontend: suma / 15 * 100
      score: evaluado ? Math.round((suma / 15) * 100) : 0,
      note: f.notas_rapidas || '',
      scores: evaluado ? scores : null,
      updatedAt: null, // el documento no guarda fecha de evaluación
      aiQuestions: [f.pregunta_ia_1, f.pregunta_ia_2, f.pregunta_ia_3].filter(Boolean),
    };
  });
}

// GET /jurado/proyectos/asignados
async function getAsignados(req, res) {
  const pool = await getPool();
  const r = await pool.request().input('jurado', sql.NVarChar, req.usuario.cedula)
    .query(CONSULTA_BASE + ' ORDER BY u.stand');
  res.json(await armarProyectos(pool, r.recordset));
}

// GET /jurado/proyectos/:stand
async function getPorStand(req, res) {
  const pool = await getPool();
  const r = await pool.request()
    .input('jurado', sql.NVarChar, req.usuario.cedula)
    .input('stand', sql.NVarChar, req.params.stand)
    .query(CONSULTA_BASE + ' AND u.stand = @stand');
  const lista = await armarProyectos(pool, r.recordset);
  if (!lista.length) return res.status(404).json({ error: 'No existe un proyecto en ese stand' });
  res.json(lista[0]);
}

// POST /jurado/evaluaciones   body: { stand, scores: {innovacion, viabilidad, sustentacion}, note }
async function guardarEvaluacion(req, res) {
  const { stand, scores = {}, note = '' } = req.body;
  const validas = CRITERIOS.every((c) => Number.isInteger(scores[c]) && scores[c] >= 1 && scores[c] <= 5);
  if (!stand || !validas) {
    return res.status(400).json({ error: 'Cada criterio debe ser un número entero entre 1 y 5' });
  }

  const cedula = req.usuario.cedula;
  const pool = await getPool();

  const proy = await pool.request()
    .input('stand', sql.NVarChar, stand)
    .query(`SELECT p.id_proyecto FROM dbo.PROYECTO p
            JOIN dbo.UBICACION u ON u.id_ubicacion = p.id_ubicacion
            WHERE u.stand = @stand`);
  if (!proy.recordset.length) {
    return res.status(404).json({ error: 'No existe un proyecto en ese stand' });
  }
  const idProyecto = proy.recordset[0].id_proyecto;
  const nota = String(note).slice(0, 4000);

  // TRANSACCIÓN: se guardan la evaluación y sus 3 puntajes, o no se guarda nada.
  // Así nunca queda una evaluación "a medias".
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const existente = await new sql.Request(tx)
      .input('j', sql.NVarChar, cedula).input('p', sql.Int, idProyecto)
      .query('SELECT id_evaluacion FROM dbo.EVALUACION WHERE cedula_jurado = @j AND id_proyecto = @p');

    let idEv;
    if (existente.recordset.length) {
      idEv = existente.recordset[0].id_evaluacion;
      await new sql.Request(tx).input('id', sql.Int, idEv).input('n', sql.NVarChar, nota)
        .query('UPDATE dbo.EVALUACION SET notas_rapidas = @n WHERE id_evaluacion = @id');
    } else {
      const ins = await new sql.Request(tx)
        .input('j', sql.NVarChar, cedula).input('p', sql.Int, idProyecto).input('n', sql.NVarChar, nota)
        .query(`INSERT INTO dbo.EVALUACION (cedula_jurado, id_proyecto, notas_rapidas)
                OUTPUT INSERTED.id_evaluacion VALUES (@j, @p, @n)`);
      idEv = ins.recordset[0].id_evaluacion;
    }

    for (const criterio of CRITERIOS) {
      await new sql.Request(tx)
        .input('ev', sql.Int, idEv)
        .input('c', sql.NVarChar, criterio)
        .input('pt', sql.Decimal(3, 1), scores[criterio])
        .query(`IF EXISTS (SELECT 1 FROM dbo.DETALLE_NOTA WHERE id_evaluacion = @ev AND criterio_evaluado = @c)
                  UPDATE dbo.DETALLE_NOTA SET puntaje = @pt
                   WHERE id_evaluacion = @ev AND criterio_evaluado = @c
                ELSE
                  INSERT INTO dbo.DETALLE_NOTA (id_evaluacion, criterio_evaluado, puntaje)
                  VALUES (@ev, @c, @pt)`);
    }
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }

  await auditar(cedula, 'Evaluación', `Evaluó el stand ${stand}`);
  const score = Math.round(((scores.innovacion + scores.viabilidad + scores.sustentacion) / 15) * 100);
  res.status(201).json({ stand, status: 'completado', scores, note: nota, score });
}

// GET /jurado/resultados?sort=score_desc  -> solo lo que ESTE jurado ya calificó, de mayor a menor
async function getResultados(req, res) {
  const pool = await getPool();
  const r = await pool.request().input('jurado', sql.NVarChar, req.usuario.cedula)
    .query(CONSULTA_BASE + ' AND ev.id_evaluacion IS NOT NULL');
  const lista = await armarProyectos(pool, r.recordset);
  res.json(lista.sort((a, b) => b.score - a.score));
}

module.exports = { getAsignados, getPorStand, guardarEvaluacion, getResultados };
