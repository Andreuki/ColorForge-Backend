require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const analysisRoutes = require('./routes/analysisRoutes');
const postRoutes = require('./routes/postRoutes');
const userRoutes = require('./routes/userRoutes');
const adminRoutes = require('./routes/adminRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const challengeRoutes = require('./routes/challengeRoutes');
const paintRoutes = require('./routes/paintRoutes');
const { startChallengeJob } = require('./jobs/challengeJob');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Connect to MongoDB
connectDB();
startChallengeJob();

const app = express();

// ─── Global middlewares ───────────────────────────────────────────────────────
app.use(express.json({ type: ['application/json', 'text/plain'] }));
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: 'http://localhost:4200' }));

app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return originalJson(body);
  };
  next();
});

// Disable ETags y cache para evitar 304 responses y problemas de actualización
app.set('etag', false);
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Serve uploaded images as static files: GET /uploads/:filename
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/uploads/challenges', express.static(path.join(__dirname, 'uploads/challenges')));

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/analyses', analysisRoutes);
app.use('/api/save-analysis', analysisRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/gallery', postRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/challenges', challengeRoutes);
app.use('/api/paints', paintRoutes);

// ─── Global error handler ────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Error interno del servidor'
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
