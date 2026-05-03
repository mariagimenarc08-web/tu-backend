require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const conectarDB = require('./config/db');

const app = express();
conectarDB();

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// Rate limiting global
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Demasiadas peticiones, intenta mas tarde' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use(globalLimiter);

// Rate limiting para auth (mas estricto)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos, intenta en 15 minutos' },
  standardHeaders: true,
  legacyHeaders: false
});

// Middlewares
app.use(cors({
  origin: [
    "https://tu-frontend-one.vercel.app",
    "http://localhost:5174"
  ],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Sanitizacion contra inyeccion
const { sanitizeInput } = require('./middleware/sanitize');
app.use(sanitizeInput);

// Servir archivos estaticos (comprobantes de pago)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
	
// Rutas API
app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/solicitudes', require('./routes/solicitudes'));
app.use('/api/clases', require('./routes/clases'));
app.use('/api/calendario', require('./routes/calendario'));
app.use('/api/pagos', require('./routes/pagos'));
app.use('/api/admin', require('./routes/admin'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Error handler global
app.use((err, req, res, next) => {
  console.error('Error:', err.message);

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Archivo demasiado grande. Maximo 5MB' });
    }
    return res.status(400).json({ error: err.message });
  }

  res.status(err.status || 500).json({
    error: err.message || 'Error interno del servidor'
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
