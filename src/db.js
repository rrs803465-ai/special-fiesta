const path = require('path');
const fs = require('fs');
const { v4: uuid } = require('uuid');

const DB_PATH = path.join(__dirname, '..', 'zacier.db');

let SQL;
let db;

function initDb() {
  const initSqlJs = require('sql.js');
  return initSqlJs().then(SqlJs => {
    SQL = SqlJs;
    if (fs.existsSync(DB_PATH)) {
      const fileBuffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(fileBuffer);
    } else {
      db = new SQL.Database();
    }

    db.run(`PRAGMA foreign_keys = ON;`);

    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL,
        anon_name TEXT NOT NULL,
        verified INTEGER DEFAULT 0,
        assigned_teacher_id TEXT,
        onboarding_done INTEGER DEFAULT 0,
        onboarding_data TEXT,
        created_at INTEGER DEFAULT (strftime('%s','now'))
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        room TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s','now'))
      );

      CREATE TABLE IF NOT EXISTS dm_threads (
        id TEXT PRIMARY KEY,
        participant_a TEXT NOT NULL,
        participant_b TEXT NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s','now')),
        UNIQUE(participant_a, participant_b)
      );

      CREATE TABLE IF NOT EXISTS dm_messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s','now'))
      );

      CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room, created_at);
      CREATE INDEX IF NOT EXISTS idx_dm_messages_thread ON dm_messages(thread_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    `);

    persist();
    setInterval(persist, 10000);
    return db;
  });
}

function persist() {
  if (!db) return;
  try {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  } catch (e) {}
}

function run(sql, params = {}) {
  db.run(sql, params);
  persist();
}

function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function all(sql, params = []) {
  const results = [];
  const stmt = db.prepare(sql);
  stmt.bind(params);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

const queries = {
  createUser: (data) => run(
    `INSERT INTO users (id, email, password, role, anon_name, verified) VALUES (:id, :email, :password, :role, :anon_name, :verified)`,
    data
  ),

  getUserByEmail: (email) => get(`SELECT * FROM users WHERE email = ?`, [email]),
  getUserById: (id) => get(`SELECT * FROM users WHERE id = ?`, [id]),

  setVerified: (id) => run(`UPDATE users SET verified = 1 WHERE id = ?`, [id]),

  setOnboarding: (onboardingData, assignedTeacherId, id) => run(
    `UPDATE users SET onboarding_done = 1, onboarding_data = ?, assigned_teacher_id = ? WHERE id = ?`,
    [onboardingData, assignedTeacherId, id]
  ),

  getTeachers: () => all(`SELECT * FROM users WHERE role = 'teacher' AND verified = 1`),

  getRoomMessages: (room) => all(
    `SELECT m.*, u.anon_name FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.room = ? ORDER BY m.created_at ASC LIMIT 100`,
    [room]
  ),

  insertMessage: (data) => run(
    `INSERT INTO messages (id, room, sender_id, content) VALUES (:id, :room, :sender_id, :content)`,
    data
  ),

  getOrCreateThread: (a, b) => {
    const sorted = [a, b].sort();
    let thread = get(
      `SELECT * FROM dm_threads WHERE participant_a = ? AND participant_b = ?`,
      sorted
    );
    if (!thread) {
      const id = uuid();
      run(`INSERT INTO dm_threads (id, participant_a, participant_b) VALUES (?, ?, ?)`, [id, sorted[0], sorted[1]]);
      thread = get(`SELECT * FROM dm_threads WHERE id = ?`, [id]);
    }
    return thread;
  },

  getThreadMessages: (threadId) => all(
    `SELECT dm.*, u.anon_name FROM dm_messages dm JOIN users u ON dm.sender_id = u.id WHERE dm.thread_id = ? ORDER BY dm.created_at ASC LIMIT 200`,
    [threadId]
  ),

  insertDmMessage: (data) => run(
    `INSERT INTO dm_messages (id, thread_id, sender_id, content) VALUES (:id, :thread_id, :sender_id, :content)`,
    data
  ),

  getUserThreads: (userId) => all(
    `SELECT dt.*, ua.anon_name as name_a, ua.role as role_a, ub.anon_name as name_b, ub.role as role_b
     FROM dm_threads dt
     JOIN users ua ON dt.participant_a = ua.id
     JOIN users ub ON dt.participant_b = ub.id
     WHERE dt.participant_a = ? OR dt.participant_b = ?
     ORDER BY dt.created_at DESC`,
    [userId, userId]
  ),

  getAllVerifiedUsers: () => all(`SELECT id, anon_name, role FROM users WHERE verified = 1`)
};

module.exports = { initDb, queries, persist };
