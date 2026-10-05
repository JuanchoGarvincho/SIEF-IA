const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sql, getPool } = require('../config/db');
const { auditar } = require('../utils/auditoria');

// El <select> del login envía "estudiantes" o "jurado".
// En el documento son DOS tablas distintas, así que según el rol se busca en una u otra.
const ROLES = new Map([
  ['estudiantes', { tabla: 'ESTUDIANTE', id: 'cedula_estudiante', rol: 'estudiante' }],
  ['jurado', { tabla: 'JURADO', id: 'cedula_jurado', rol: 'jurado' }],
]);

async function login(req, res) {
  const { correo, clave, rol } = req.body;
  const cfg = ROLES.get(rol);
  if (!correo || !clave || !cfg) {
    return res.status(400).json({ error: 'Datos incompletos' });
  }

  const pool = await getPool();
  // cfg.tabla y cfg.id salen de la lista de arriba (no del usuario), por eso es seguro armarlos así
  const r = await pool.request()
    .input('correo', sql.NVarChar, correo.trim().toLowerCase())
    .query(`SELECT ${cfg.id} AS cedula, nombre_completo, correo, clave_hash, activo
              FROM dbo.${cfg.tabla} WHERE correo = @correo`);

  const u = r.recordset[0];
  const ok = u && u.activo !== false && u.clave_hash && (await bcrypt.compare(clave, u.clave_hash));
  if (!ok) return res.status(401).json({ error: 'Correo o contraseña incorrectos' });

  const token = jwt.sign({ cedula: u.cedula, rol: cfg.rol }, process.env.JWT_SECRET, { expiresIn: '8h' });
  await auditar(u.cedula, 'Login', 'Inicio de sesión');
  res.json({
    token,
    usuario: { cedula: u.cedula, nombre: u.nombre_completo, correo: u.correo, rol: cfg.rol },
  });
}

module.exports = { login };
