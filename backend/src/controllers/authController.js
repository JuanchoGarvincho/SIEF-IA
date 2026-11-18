const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const { auditar } = require('../utils/auditoria');

// El <select> del login envía "estudiantes" o "jurado".
// Son DOS tablas distintas, así que según el rol se busca en una u otra.
const ROLES = new Map([
  ['estudiantes', { tabla: 'estudiante', id: 'id_estudiante', cedula: 'cedula_estudiante', rol: 'estudiante' }],
  ['jurado', { tabla: 'jurado', id: 'id_jurado', cedula: 'cedula_jurado', rol: 'jurado' }],
]);

async function login(req, res) {
  const { correo, clave, rol } = req.body;
  const cfg = ROLES.get(rol);
  if (!correo || !clave || !cfg) {
    return res.status(400).json({ error: 'Datos incompletos' });
  }

  // cfg.tabla y las columnas salen de la lista de arriba (no del usuario), por eso es seguro armarlos así
  const [u] = await query(
    `SELECT ${cfg.id} AS id, ${cfg.cedula} AS cedula, nombre_completo, correo, clave_hash, id_estado
       FROM ${cfg.tabla} WHERE correo = $1`,
    [correo.trim().toLowerCase()]);

  // id_estado 1 = Activo (tabla estado)
  const ok = u && u.id_estado === 1 && u.clave_hash && (await bcrypt.compare(clave, u.clave_hash));
  if (!ok) return res.status(401).json({ error: 'Correo o contraseña incorrectos' });

  const token = jwt.sign({ id: u.id, cedula: u.cedula, rol: cfg.rol }, process.env.JWT_SECRET, { expiresIn: '8h' });
  await auditar(u.cedula, 'Login', 'Inicio de sesión');
  res.json({
    token,
    usuario: { cedula: u.cedula, nombre: u.nombre_completo, correo: u.correo, rol: cfg.rol },
  });
}

module.exports = { login };
