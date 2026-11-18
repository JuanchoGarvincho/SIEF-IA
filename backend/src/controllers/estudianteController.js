const { query, transaccion } = require('../config/db');
const { auditar } = require('../utils/auditoria');
const { CRITERIOS, claveDe } = require('../utils/criterios');
const gemini = require('../services/gemini');

async function buscarProyecto(idEstudiante) {
  const [p] = await query(
    `SELECT p.id_proyecto, p.titulo, p.categoria, p.resumen_tecnico,
            p.pregunta_ia_1, p.pregunta_ia_2, p.pregunta_ia_3,
            u.stand, u.nomenclatura_salon, m.nombre_materia
       FROM proyecto p
       LEFT JOIN ubicacion u ON u.id_ubicacion = p.id_ubicacion
       LEFT JOIN materia m ON m.id_materia = p.id_materia
      WHERE p.id_estudiante = $1
      ORDER BY p.id_proyecto
      LIMIT 1`,
    [idEstudiante]);
  if (!p) return null;
  return {
    id_proyecto: p.id_proyecto,
    titulo: p.titulo,
    categoria: p.categoria,
    materia: p.nombre_materia,
    resumen: p.resumen_tecnico,
    stand: p.stand,
    salon: p.nomenclatura_salon,
    preguntasIA: [p.pregunta_ia_1, p.pregunta_ia_2, p.pregunta_ia_3].filter(Boolean),
  };
}

// GET /estudiante/proyecto  -> pantalla "Mi Proyecto"
async function miProyecto(req, res) {
  const proyecto = await buscarProyecto(req.usuario.id);
  if (!proyecto) return res.status(404).json({ error: 'Aún no tienes un proyecto inscrito' });
  res.json(proyecto);
}

// POST /estudiante/inscripcion
// body: { tituloProyecto, categoria, resumenTecnico, aceptaTratamientoDatos }
async function inscribir(req, res) {
  const { tituloProyecto, categoria, resumenTecnico, aceptaTratamientoDatos } = req.body;
  if (!tituloProyecto?.trim() || !categoria?.trim()) {
    return res.status(400).json({ error: 'El título y la categoría son obligatorios' });
  }

  const { id, cedula } = req.usuario;

  // Ley 1581 de 2012 (Habeas Data): sin autorización previa no se guardan datos.
  const cons = await query('SELECT 1 FROM consentimiento_dato WHERE cedula_titular = $1 LIMIT 1', [cedula]);
  const yaAutorizo = cons.length > 0;
  if (!yaAutorizo && aceptaTratamientoDatos !== true) {
    return res.status(400).json({ error: 'Debes aceptar el tratamiento de datos personales para inscribirte' });
  }

  const titulo = tituloProyecto.trim().slice(0, 150);
  const cat = categoria.trim().slice(0, 80);
  const resumen = resumenTecnico || '';

  const { idProyecto, existia } = await transaccion(async (tx) => {
    if (!yaAutorizo) {
      await tx.query(
        `INSERT INTO consentimiento_dato (cedula_titular, ip_registro, finalidad_aceptada)
         VALUES ($1, $2, $3)`,
        [cedula, String(req.ip || '').slice(0, 50),
          'Tratamiento de datos personales para la feria tecnológica SIEF-IA (Ley 1581 de 2012)']);
    }

    const [ex] = await tx.query(
      'SELECT id_proyecto FROM proyecto WHERE id_estudiante = $1 ORDER BY id_proyecto LIMIT 1 FOR UPDATE', [id]);
    if (ex) {
      await tx.query(
        `UPDATE proyecto SET titulo = $1, categoria = $2, resumen_tecnico = $3, fecha_actualizacion = now()
          WHERE id_proyecto = $4`,
        [titulo, cat, resumen, ex.id_proyecto]);
      return { idProyecto: ex.id_proyecto, existia: true };
    }
    // Sin stand el jurado no ve el proyecto, así que se asigna uno libre (o se crea uno nuevo).
    // El bloqueo evita que dos inscripciones simultáneas tomen el mismo stand.
    await tx.query('LOCK TABLE ubicacion IN SHARE ROW EXCLUSIVE MODE');
    let [libre] = await tx.query(
      `SELECT u.id_ubicacion FROM ubicacion u
        WHERE u.stand IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM proyecto p WHERE p.id_ubicacion = u.id_ubicacion)
        ORDER BY u.stand LIMIT 1`);
    if (!libre) {
      [libre] = await tx.query(
        `INSERT INTO ubicacion (id_ubicacion, nomenclatura_salon, stand)
         SELECT n, 'Por asignar', 'Stand N' || lpad(n::text, 2, '0')
           FROM (SELECT COALESCE(MAX(id_ubicacion), 0) + 1 AS n FROM ubicacion) s
         RETURNING id_ubicacion`);
    }

    const [nuevo] = await tx.query(
      `INSERT INTO proyecto (id_estudiante, id_ubicacion, titulo, categoria, resumen_tecnico)
       VALUES ($1, $2, $3, $4, $5) RETURNING id_proyecto`,
      [id, libre.id_ubicacion, titulo, cat, resumen]);
    return { idProyecto: nuevo.id_proyecto, existia: false };
  });

  // Las preguntas de IA son un extra: si Gemini falla, la inscripción igual queda guardada.
  if (gemini.disponible() && resumen.trim()) {
    try {
      const [q1, q2, q3] = await gemini.generarPreguntas(titulo, resumen);
      await query(
        'UPDATE proyecto SET pregunta_ia_1 = $1, pregunta_ia_2 = $2, pregunta_ia_3 = $3 WHERE id_proyecto = $4',
        [q1 || null, q2 || null, q3 || null, idProyecto]);
    } catch (e) {
      console.error('No se pudieron generar las preguntas con Gemini:', e.message);
    }
  }

  await auditar(cedula, 'Inscripción', existia ? 'Actualizó su proyecto' : 'Inscribió su proyecto');
  res.status(existia ? 200 : 201).json(await buscarProyecto(id));
}

// GET /estudiante/calificaciones  -> pantalla "Calificaciones"
async function calificaciones(req, res) {
  const proyecto = await buscarProyecto(req.usuario.id);
  if (!proyecto) return res.status(404).json({ error: 'Aún no tienes un proyecto inscrito' });

  const filas = await query(
    `SELECT ev.id_evaluacion, ev.nota_rapida, ev.feedback_ia, d.criterio_evaluado, d.puntaje
       FROM evaluacion ev
       LEFT JOIN detalle_nota d ON d.id_evaluacion = ev.id_evaluacion
      WHERE ev.id_proyecto = $1
      ORDER BY ev.id_evaluacion`,
    [proyecto.id_proyecto]);

  // Agrupamos las filas por evaluación (cada evaluación trae varias filas de detalle)
  const evs = new Map();
  for (const f of filas) {
    if (!evs.has(f.id_evaluacion)) {
      evs.set(f.id_evaluacion, { nota: f.nota_rapida, feedback: f.feedback_ia, suma: 0, porCriterio: {} });
    }
    const clave = claveDe(f.criterio_evaluado);
    if (clave) {
      const e = evs.get(f.id_evaluacion);
      e.suma += Number(f.puntaje);
      e.porCriterio[clave] = Number(f.puntaje);
    }
  }
  const lista = [...evs.values()];
  if (!lista.length) return res.json({ evaluado: false, mensaje: 'Tu proyecto aún no ha sido evaluado' });

  const puntajeFinal = Math.round(lista.reduce((a, e) => a + (e.suma / 15) * 100, 0) / lista.length);
  const criterios = Object.entries(CRITERIOS).map(([clave, etiqueta]) => {
    const valores = lista.map((e) => e.porCriterio[clave]).filter((v) => v !== undefined);
    const promedio = valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : 0;
    return { criterio: etiqueta, promedio: +promedio.toFixed(1), maximo: 5 };
  });

  res.json({
    evaluado: true,
    evaluaciones: lista.length,
    puntajeFinal, // sobre 100
    criterios,
    // Los jurados salen como "Jurado 1, 2, 3": el estudiante no ve quién es quién
    comentarios: lista.filter((e) => e.nota).map((e, i) => ({ jurado: `Jurado ${i + 1}`, nota: e.nota })),
    feedbackIA: lista.map((e) => e.feedback).filter(Boolean),
  });
}

// POST /estudiante/diagnostico   body: { tituloProyecto, categoria, resumenTecnico }
// No se guarda: es una revisión previa para que el estudiante mejore su resumen antes de enviarlo.
async function diagnostico(req, res) {
  const { tituloProyecto = '', categoria = '', resumenTecnico = '' } = req.body;
  if (!tituloProyecto.trim() || resumenTecnico.trim().length < 20) {
    return res.status(400).json({ error: 'Escribe el título y un resumen técnico de al menos 20 caracteres' });
  }
  if (!gemini.disponible()) return res.status(503).json({ error: 'La IA no está configurada en el servidor' });
  try {
    res.json(await gemini.generarDiagnostico(
      tituloProyecto.trim().slice(0, 150), categoria.trim().slice(0, 80), resumenTecnico.slice(0, 4000)));
  } catch (e) {
    console.error('Diagnóstico con Gemini falló:', e.message);
    res.status(503).json({ error: 'La IA está ocupada en este momento. Intenta de nuevo en unos segundos.' });
  }
}

module.exports = { miProyecto, inscribir, calificaciones, diagnostico };
