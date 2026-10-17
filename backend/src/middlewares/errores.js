// Express 4 no captura los errores de funciones async. Este "envoltorio" los
// atrapa y los manda al manejador de errores de abajo.
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function manejarErrores(err, req, res, next) {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
}

module.exports = { asyncHandler, manejarErrores };
