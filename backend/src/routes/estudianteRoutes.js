const router = require('express').Router();
const { asyncHandler } = require('../middlewares/errores');
const { verificarToken, soloRol } = require('../middlewares/auth');
const c = require('../controllers/estudianteController');

router.use(verificarToken, soloRol('estudiante'));

router.get('/proyecto', asyncHandler(c.miProyecto));
router.post('/inscripcion', asyncHandler(c.inscribir));
router.get('/calificaciones', asyncHandler(c.calificaciones));

module.exports = router;
