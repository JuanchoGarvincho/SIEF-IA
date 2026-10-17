const router = require('express').Router();
const { asyncHandler } = require('../middlewares/errores');
const { verificarToken, soloRol } = require('../middlewares/auth');
const c = require('../controllers/juradoController');

router.use(verificarToken, soloRol('jurado')); // todo lo de aquí exige sesión de jurado

router.get('/proyectos/asignados', asyncHandler(c.getAsignados)); // va ANTES de /:stand
router.get('/proyectos/:stand', asyncHandler(c.getPorStand));
router.post('/evaluaciones', asyncHandler(c.guardarEvaluacion));
router.get('/resultados', asyncHandler(c.getResultados));

module.exports = router;
