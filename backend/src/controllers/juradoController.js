const { query, transaccion } = require('../config/db');
const { auditar } = require('../utils/auditoria');
const { CRITERIOS, CLAVES, claveDe } = require('../utils/criterios');
const gemini = require('../services/gemini');

// Decisión de diseño: la BD NO tiene tabla de asignación jurado-proyecto,
// así que todo jurado ve todos los proyectos que ya tienen stand asignado.
// $1 siempre es el id_jurado de la sesión.
const CONSULTA_BASE = `
  SELECT p.id_proyecto, u.stand, p.titulo AS title,
         COALESCE(p.categoria, m.nombre_materia, 'Sin categoria') AS category,
         COALESCE(e.nombre_completo, 'Sin estudiante') AS student,
         p.pregunta_ia_1, p.pregunta_ia_2, p.pregunta_ia_3,
         ev.id_evaluacion, ev.nota_rapida, ev.feedback_ia, ev.fecha_actualizacion
  FROM proyecto p
  JOIN ubicacion u ON u.id_ubicacion = p.id_ubicacion
  LEFT JOIN estudiante e ON e.id_estudiante = p.id_estudiante
  LEFT JOIN materia m ON m.id_materia = p.id_materia
  LEFT JOIN evaluacion ev ON ev.id_proyecto = p.id_proyecto AND ev.id_jurado = $1
  WHERE u.stand IS NOT NULL`;

// Convierte las filas de SQL al formato EXACTO que espera tu juradoService.js
async function armarProyectos(filas) {
  const idsEv = filas.map((f) => f.id_evaluacion).filter((x) => x !== null);
  const detalle = {};
  if (idsEv.length) {
    const d = await query(
      'SELECT id_evaluacion, criterio_evaluado, puntaje FROM detalle_nota WHERE id_evaluacion = ANY($1)', [idsEv]);
    d.forEach((x) => (detalle[x.id_evaluacion] ||= []).push(x));
  }

  return filas.map((f) => {
    const evaluado = f.id_evaluacion !== null;
    const scores = {};
    let suma = 0;
    (detalle[f.id_evaluacion] || []).forEach((x) => {
      suma += Number(x.puntaje);
      const clave = claveDe(x.criterio_evaluado);
      if (clave) scores[clave] = Number(x.puntaje);
    });
    return {
      stand: f.stand,
      title: f.title,
      category: f.category,
      student: f.student,
      status: evaluado ? 'completado' : 'pendiente',
      // Misma fórmula que ya usa tu frontend: suma / 15 * 100
      score: evaluado ? Math.round((suma / 15) * 100) : 0,
      note: f.nota_rapida || '',
      feedbackIA: f.feedback_ia || '',
      scores: evaluado ? scores : null,
      updatedAt: evaluado ? f.fecha_actualizacion : null,
      aiQuestions: [f.pregunta_ia_1, f.pregunta_ia_2, f.pregunta_ia_3].filter(Boolean),
    };
  });
}

// GET /jurado/proyectos/asignados
async function getAsignados(req, res) {
  const filas = await query(CONSULTA_BASE + ' ORDER BY u.stand', [req.usuario.id]);
  res.json(await armarProyectos(filas));
}

// GET /jurado/proyectos/:stand
async function getPorStand(req, res) {
  const filas = await query(CONSULTA_BASE + ' AND u.stand = $2', [req.usuario.id, req.params.stand]);
  const lista = await armarProyectos(filas);
  if (!lista.length) return res.status(404).json({ error: 'No existe un proyecto en ese stand' });
  res.json(lista[0]);
}

// POST /jurado/evaluaciones   body: { stand, scores: {innovacion, viabilidad, sustentacion}, note }
async function guardarEvaluacion(req, res) {
  const { stand, scores = {}, note = '' } = req.body;
  const validas = CLAVES.every((c) => Number.isInteger(scores[c]) && scores[c] >= 1 && scores[c] <= 5);
  if (!stand || !validas) {
    return res.status(400).json({ error: 'Cada criterio debe ser un número entero entre 1 y 5' });
  }

  const { id: idJurado, cedula } = req.usuario;
  const [proy] = await query(
    `SELECT p.id_proyecto, p.titulo, p.resumen_tecnico FROM proyecto p
       JOIN ubicacion u ON u.id_ubicacion = p.id_ubicacion
      WHERE u.stand = $1`,
    [stand]);
  if (!proy) return res.status(404).json({ error: 'No existe un proyecto en ese stand' });
  const nota = String(note).slice(0, 4000);

  // TRANSACCIÓN: se guardan la evaluación y sus 3 puntajes, o no se guarda nada.
  const idEv = await transaccion(async (tx) => {
    const [ev] = await tx.query(
      `INSERT INTO evaluacion (id_jurado, id_proyecto, nota_rapida) VALUES ($1, $2, $3)
       ON CONFLICT (id_jurado, id_proyecto) DO UPDATE SET nota_rapida = EXCLUDED.nota_rapida
       RETURNING id_evaluacion`,
      [idJurado, proy.id_proyecto, nota]);

    for (const clave of CLAVES) {
      await tx.query(
        `INSERT INTO detalle_nota (id_evaluacion, criterio_evaluado, puntaje) VALUES ($1, $2, $3)
         ON CONFLICT (id_evaluacion, criterio_evaluado)
         DO UPDATE SET puntaje = EXCLUDED.puntaje, fecha_actualizacion = now()`,
        [ev.id_evaluacion, CRITERIOS[clave], scores[clave]]);
    }
    return ev.id_evaluacion;
  });

  // Retroalimentación de IA para el estudiante (opcional: si falla, la nota ya quedó guardada)
  let feedbackIA = '';
  if (gemini.disponible()) {
    try {
      feedbackIA = await gemini.generarFeedback(proy.titulo, proy.resumen_tecnico, scores, nota);
      await query('UPDATE evaluacion SET feedback_ia = $1 WHERE id_evaluacion = $2', [feedbackIA, idEv]);
    } catch (e) {
      console.error('No se pudo generar el feedback con Gemini:', e.message);
    }
  }

  await auditar(cedula, 'Evaluación', `Evaluó el stand ${stand}`);
  const score = Math.round(((scores.innovacion + scores.viabilidad + scores.sustentacion) / 15) * 100);
  res.status(201).json({ stand, status: 'completado', scores, note: nota, score, feedbackIA });
}

// GET /jurado/resultados?sort=score_desc  -> solo lo que ESTE jurado ya calificó, de mayor a menor
async function getResultados(req, res) {
  const filas = await query(CONSULTA_BASE + ' AND ev.id_evaluacion IS NOT NULL', [req.usuario.id]);
  const lista = await armarProyectos(filas);
  res.json(lista.sort((a, b) => b.score - a.score));
}

module.exports = { getAsignados, getPorStand, guardarEvaluacion, getResultados };
