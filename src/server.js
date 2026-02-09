const express = require('express');
const path = require('path');
const cors = require('cors');
const WebSocket = require('ws');
const apiRoutes = require('./routes/api');
const PriceMonitor = require('./services/priceMonitor');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api', apiRoutes);

// Create HTTP server
const server = app.listen(PORT, () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 Price Monitor Bot is running!`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
  console.log(`${'='.repeat(60)}\n`);
});

// WebSocket server for real-time updates
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('📱 New dashboard connection established');

  ws.on('message', (message) => {
    console.log('📨 Received:', message.toString());
  });

  ws.on('close', () => {
    console.log('📴 Dashboard connection closed');
  });
});

// Initialize Price Monitor
const priceMonitor = new PriceMonitor(wss);

// Make priceMonitor available globally
app.set('priceMonitor', priceMonitor);

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n⏳ Shutting down gracefully...');
  await priceMonitor.stop();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
