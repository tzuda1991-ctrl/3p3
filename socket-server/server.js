import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import mysql from 'mysql2/promise';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = Number(process.env.PORT) || 3002;
const AVIATOR_TOKEN = process.env.AVIATOR_TOKEN || '';

let pool = null;
async function getDbPool() {
  if (pool) return pool;
  if (!process.env.MYSQL_HOST || !process.env.MYSQL_DATABASE) return null;
  pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
  });
  return pool;
}

function verifyToken(req, res, next) {
  if (!AVIATOR_TOKEN) return next();
  const token = req.headers.token || req.body?.token;
  if (token !== AVIATOR_TOKEN) {
    return res.status(401).json({ status: false, message: 'Unauthorized token' });
  }
  return next();
}

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'teenpatti-socket-server',
    mysqlConfigured: Boolean(process.env.MYSQL_HOST && process.env.MYSQL_DATABASE),
  });
});

app.get('/', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'teenpatti-socket-server',
    namespaces: ['/aviator', '/dragon_tiger', '/ander_bahar', '/rummy', '/seven_up_down', '/teenpatti'],
  });
});

app.post('/api/userById', verifyToken, async (req, res) => {
  const userId = req.body?.user_id || req.body?.id || '0';
  try {
    const db = await getDbPool();
    if (db) {
      const [rows] = await db.query('SELECT id, name, wallet FROM tbl_users WHERE id = ? LIMIT 1', [userId]);
      if (Array.isArray(rows) && rows.length > 0) {
        return res.json({ status: true, data: rows[0] });
      }
    }
  } catch (err) {
    console.warn('MySQL userById fallback:', err.message);
  }
  return res.json({ status: true, data: { id: userId, wallet: '0' } });
});

app.post('/api/addBet', verifyToken, async (req, res) => {
  const { user_id, amount, game_id } = req.body || {};
  return res.json({
    status: true,
    message: 'Bet accepted',
    data: { user_id: user_id || null, amount: amount || 0, game_id: game_id || null },
  });
});

app.post('/api/redeem', verifyToken, async (req, res) => {
  const { user_id, amount, game_id } = req.body || {};
  return res.json({
    status: true,
    message: 'Redeem processed',
    data: { user_id: user_id || null, amount: amount || 0, game_id: game_id || null },
  });
});

const server = http.createServer(app);
const io = new Server(server, {
  allowEIO3: true,
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const namespaces = [
  '/aviator',
  '/dragon_tiger',
  '/ander_bahar',
  '/rummy',
  '/seven_up_down',
  '/teenpatti',
];

for (const ns of namespaces) {
  const nsp = io.of(ns);
  nsp.on('connection', (socket) => {
    console.log(`[${ns}] connected: ${socket.id}`);

    socket.on('ander_bahar_timer', (payload) => {
      nsp.emit('ander_bahar_timer', payload);
    });

    socket.on('dragon_tiger_timer', (payload) => {
      nsp.emit('dragon_tiger_timer', payload);
    });

    socket.on('Game', (payload) => {
      nsp.emit('Game', payload);
    });

    socket.on('disconnect', (reason) => {
      console.log(`[${ns}] disconnected: ${socket.id} (${reason})`);
    });
  });
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Teen Patti Socket.IO server listening on http://0.0.0.0:${PORT}`);
});
