const jwt = require('jsonwebtoken');

// Revisa que la petición traiga el header:  Authorization: Bearer <token>
function verificarToken(req, res, next) {
  const [tipo, token] = (req.headers.authorization || '').split(' ');
  if (tipo !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Falta el token de sesión' });
  }
  try {
    req.usuario = jwt.verify(token, process.env.JWT_SECRET); // { cedula, rol }
    next();
  } catch {
    res.status(401).json({ error: 'Sesión inválida o vencida' });
  }
}

// Deja pasar solo a un rol (estudiante o jurado)
const soloRol = (rol) => (req, res, next) =>
  req.usuario.rol === rol ? next() : res.status(403).json({ error: 'No tienes permiso' });

module.exports = { verificarToken, soloRol };
