require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { getPool } = require('./config/db');
const { asyncHandler, manejarErrores } = require('./middlewares/errores');

const app = express();
app.use(cors());          // permite que tu HTML (otro origen) llame a este servidor
app.use(express.json());  // permite leer el JSON que envía el frontend

// Rutas de prueba
app.get('/health', (req, res) => res.json({ ok: true }));
app.get('/health/db', asyncHandler(async (req, res) => {
  const pool = await getPool();
  const r = await pool.request().query('SELECT COUNT(*) AS tablas FROM INFORMATION_SCHEMA.TABLES');
  res.json({ conectado: 1, tablas: r.recordset[0].tablas });
}));

// Rutas reales
app.use('/auth', require('./routes/authRoutes'));
app.use('/jurado', require('./routes/juradoRoutes'));
app.use('/estudiante', require('./routes/estudianteRoutes'));

app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
app.use(manejarErrores);

app.listen(process.env.PORT || 3000, () =>
  console.log(`Servidor listo en http://localhost:${process.env.PORT || 3000}`));
