require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { query } = require('./config/db');
const { asyncHandler, manejarErrores } = require('./middlewares/errores');
const gemini = require('./services/gemini');

const app = express();
app.set('trust proxy', 1); // en Render la IP real del usuario llega en X-Forwarded-For
app.use(cors());          // permite que tu HTML (otro origen) llame a este servidor
app.use(express.json());  // permite leer el JSON que envía el frontend

// Rutas de prueba
app.get('/health', (req, res) => res.json({ ok: true }));
app.get('/health/db', asyncHandler(async (req, res) => {
  const [r] = await query(
    "SELECT COUNT(*)::int AS tablas FROM information_schema.tables WHERE table_schema = 'public'");
  res.json({ conectado: true, tablas: r.tablas });
}));
app.get('/health/ia', (req, res) => res.json({ gemini: gemini.disponible() }));

// Rutas reales
app.use('/auth', require('./routes/authRoutes'));
app.use('/jurado', require('./routes/juradoRoutes'));
app.use('/estudiante', require('./routes/estudianteRoutes'));

app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
app.use(manejarErrores);

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Servidor listo en http://localhost:${PORT}`);
  try {
    await query('SELECT 1');
    console.log('✔ Conectado a PostgreSQL');
  } catch (err) {
    console.error('✖ No se pudo conectar a PostgreSQL:', err.message);
  }
});
