const { sql, getPool } = require('../config/db');
const { auditar } = require('../utils/auditoria');

const ETIQUETAS = {
  innovacion: 'Innovación',
  viabilidad: 'Viabilidad técnica',
  sustentacion: 'Sustentación oral',
};

async function buscarProyecto(pool, cedula) {
  const r = await pool.request().input('c', sql.NVarChar, cedula).query(
    `SELECT TOP 1 p.id_proyecto, p.titulo, p.categoria, p.resumen_tecnico,
            p.pregunta_ia_1, p.pregunta_ia_2, p.pregunta_ia_3,
            u.stand, u.nomenclatura_salon
       FROM dbo.PROYECTO p
       LEFT JOIN dbo.UBICACION u ON u.id_ubicacion = p.id_ubicacion
      WHERE p.cedula_estudiante = @c
      ORDER BY p.id_proyecto`);
  const p = r.recordset[0];
  if (!p) return null;
  return {
    id_proyecto: p.id_proyecto,
    titulo: p.titulo,
    categoria: p.categoria,
    resumen: p.resumen_tecnico,
    stand: p.stand,
    salon: p.nomenclatura_salon,
    preguntasIA: [p.pregunta_ia_1, p.pregunta_ia_2, p.pregunta_ia_3].filter(Boolean),
  };
}

// GET /estudiante/proyecto  -> pantalla "Mi Proyecto"
async function miProyecto(req, res) {
  const pool = await getPool();
  const proyecto = await buscarProyecto(pool, req.usuario.cedula);
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

  const cedula = req.usuario.cedula;
  const pool = await getPool();

  // Ley 1581 de 2012 (Habeas Data): sin autorización previa no se guardan datos.
  const cons = await pool.request().input('c', sql.NVarChar, cedula)
    .query('SELECT TOP 1 1 AS ok FROM dbo.CONSENTIMIENTO_DATOS WHERE cedula_titular = @c');
  const yaAutorizo = cons.recordset.length > 0;
  if (!yaAutorizo && aceptaTratamientoDatos !== true) {
    return res.status(400).json({ error: 'Debes aceptar el tratamiento de datos personales para inscribirte' });
  }

  const titulo = tituloProyecto.trim().slice(0, 150);
  const cat = categoria.trim().slice(0, 80);
  const resumen = resumenTecnico || '';

  const tx = new sql.Transaction(pool);
  await tx.begin();
  let existia = false;
  try {
    if (!yaAutorizo) {
      await new sql.Request(tx)
        .input('c', sql.NVarChar, cedula)
        .input('ip', sql.NVarChar, String(req.ip || '').slice(0, 50))
        .input('f', sql.NVarChar, 'Tratamiento de datos personales para la feria tecnológica SIEF-IA (Ley 1581 de 2012)')
        .query(`INSERT INTO dbo.CONSENTIMIENTO_DATOS (cedula_titular, ip_registro, finalidad_aceptada)
                VALUES (@c, @ip, @f)`);
    }

    const ex = await new sql.Request(tx).input('c', sql.NVarChar, cedula)
      .query('SELECT TOP 1 id_proyecto FROM dbo.PROYECTO WHERE cedula_estudiante = @c ORDER BY id_proyecto');

    if (ex.recordset.length) {
      existia = true;
      await new sql.Request(tx)
        .input('id', sql.Int, ex.recordset[0].id_proyecto)
        .input('t', sql.NVarChar, titulo).input('cat', sql.NVarChar, cat).input('r', sql.NVarChar, resumen)
        .query(`UPDATE dbo.PROYECTO SET titulo = @t, categoria = @cat, resumen_tecnico = @r
                 WHERE id_proyecto = @id`);
    } else {
      // id_proyecto NO es IDENTITY en el documento: calculamos el siguiente número.
      // UPDLOCK + HOLDLOCK evitan que dos inscripciones simultáneas reciban el mismo número.
      const sig = await new sql.Request(tx).query(
        'SELECT ISNULL(MAX(id_proyecto), 0) + 1 AS id FROM dbo.PROYECTO WITH (UPDLOCK, HOLDLOCK)');
      await new sql.Request(tx)
        .input('id', sql.Int, sig.recordset[0].id)
        .input('c', sql.NVarChar, cedula)
        .input('t', sql.NVarChar, titulo).input('cat', sql.NVarChar, cat).input('r', sql.NVarChar, resumen)
        .query(`INSERT INTO dbo.PROYECTO (id_proyecto, cedula_estudiante, titulo, categoria, resumen_tecnico)
                VALUES (@id, @c, @t, @cat, @r)`);
    }
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }

  await auditar(cedula, 'Inscripción', existia ? 'Actualizó su proyecto' : 'Inscribió su proyecto');
  res.status(existia ? 200 : 201).json(await buscarProyecto(pool, cedula));
}

// GET /estudiante/calificaciones  -> pantalla "Calificaciones"
async function calificaciones(req, res) {
  const pool = await getPool();
  const proyecto = await buscarProyecto(pool, req.usuario.cedula);
  if (!proyecto) return res.status(404).json({ error: 'Aún no tienes un proyecto inscrito' });

  const r = await pool.request().input('p', sql.Int, proyecto.id_proyecto).query(
    `SELECT ev.id_evaluacion, ev.notas_rapidas, ev.feedback_ia, d.criterio_evaluado, d.puntaje
       FROM dbo.EVALUACION ev
       LEFT JOIN dbo.DETALLE_NOTA d ON d.id_evaluacion = ev.id_evaluacion
      WHERE ev.id_proyecto = @p
      ORDER BY ev.id_evaluacion`);

  // Agrupamos las filas por evaluación (cada evaluación trae varias filas de detalle)
  const evs = new Map();
  for (const f of r.recordset) {
    if (!evs.has(f.id_evaluacion)) {
      evs.set(f.id_evaluacion, { nota: f.notas_rapidas, feedback: f.feedback_ia, suma: 0, porCriterio: {} });
    }
    if (f.criterio_evaluado) {
      const e = evs.get(f.id_evaluacion);
      e.suma += Number(f.puntaje);
      e.porCriterio[f.criterio_evaluado] = Number(f.puntaje);
    }
  }
  const lista = [...evs.values()];
  if (!lista.length) return res.json({ evaluado: false, mensaje: 'Tu proyecto aún no ha sido evaluado' });

  const puntajeFinal = Math.round(lista.reduce((a, e) => a + (e.suma / 15) * 100, 0) / lista.length);
  const criterios = Object.entries(ETIQUETAS).map(([clave, etiqueta]) => {
    const valores = lista.map((e) => e.porCriterio[clave]).filter((v) => v !== undefined);
    const promedio = valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : 0;
    return { criterio: etiqueta, promedio: +promedio.toFixed(1), maximo: 5 };
  });

  res.json({
    evaluado: true,
    puntajeFinal, // sobre 100
    criterios,
    // Los jurados salen como "Jurado 1, 2, 3": el estudiante no ve quién es quién
    comentarios: lista.filter((e) => e.nota).map((e, i) => ({ jurado: `Jurado ${i + 1}`, nota: e.nota })),
    feedbackIA: lista.map((e) => e.feedback).filter(Boolean),
  });
}

module.exports = { miProyecto, inscribir, calificaciones };
