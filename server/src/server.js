require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectDB } = require('./config/db');
const notesRouter = require('./routes/notes');
const syncRouter = require('./routes/sync');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Request logging for sync inspection
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (req.originalUrl.startsWith('/api/sync')) {
      console.log(`[HTTP] ${req.method} ${req.originalUrl} - ${res.statusCode} (${Date.now() - start}ms)`);
    }
  });
  next();
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'NoteSync Backend',
    timestamp: Date.now(),
  });
});

// API Routes
app.use('/api/notes', notesRouter);
app.use('/api/sync', syncRouter);

// Serve static React frontend in production / single-service deployment
const path = require('path');
const fs = require('fs');
const clientDistPath = path.resolve(__dirname, '../../client/dist');

if (fs.existsSync(clientDistPath)) {
  console.log(`[Server] Serving static client from: ${clientDistPath}`);
  app.use(express.static(clientDistPath));

  // Catch-all route to serve SPA index.html for any frontend route
  app.get('*', (req, res, next) => {
    if (req.originalUrl.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// Start server
const startServer = async () => {
  try {
    app.listen(PORT, () => {
      console.log(`\n======================================================`);
      console.log(`  🚀 NoteSync Server is LIVE!`);
      console.log(`  🌐 App URL:    http://localhost:${PORT}`);
      console.log(`  🩺 API Health: http://localhost:${PORT}/api/health`);
      console.log(`======================================================\n`);
    });

    await connectDB();
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;
