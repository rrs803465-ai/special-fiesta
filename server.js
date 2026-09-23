require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const ConnectSQLite = require('connect-sqlite3')(session);
const path = require('path');
const { initDb } = require('./src/db');

const app = express();
const server = http.createServer(app);

const sessionMiddleware = session({
  store: new ConnectSQLite({ db: 'sessions.db', dir: '.' }),
  secret: process.env.SESSION_SECRET || 'zacier_dev_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000, httpOnly: true, sameSite: 'lax' }
});

const io = new Server(server, { cors: { origin: false } });

app.use(sessionMiddleware);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
io.engine.use(sessionMiddleware);

initDb().then(() => {
  const authRoutes = require('./src/routes/auth');
  const chatRoutes = require('./src/routes/chat');
  const { initSocket } = require('./src/socket');

  app.use('/api/auth', authRoutes);
  app.use('/api/chat', chatRoutes);
  app.get('/health', (_, res) => res.json({ status: 'ok' }));
  app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

  initSocket(io);

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => console.log(`Zacier on ${PORT}`));
}).catch(err => {
  console.error('DB init failed:', err);
  process.exit(1);
});
