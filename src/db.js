const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'zacier.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('teacher','student')),
    anon_name TEXT NOT NULL,
    verified INTEGER DEFAULT 0,
    assigned_teacher_id TEXT,
    onboarding_done INTEGER DEFAULT 0,
    onboarding_data TEXT,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    room TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS dm_threads (
    id TEXT PRIMARY KEY,
    participant_a TEXT NOT NULL,
    participant_b TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    UNIQUE(participant_a, participant_b)
  );

  CREATE TABLE IF NOT EXISTS dm_messages (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY(thread_id) REFERENCES dm_threads(id)
  );

  CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room, created_at);
  CREATE INDEX IF NOT EXISTS idx_dm_messages_thread ON dm_messages(thread_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
`);

const queries = {
  createUser: db.prepare(`
    INSERT INTO users (id, email, password, role, anon_name, verified)
    VALUES (@id, @email, @password, @role, @anon_name, @verified)
  `),

  getUserByEmail: db.prepare(`SELECT * FROM users WHERE email = ?`),
  getUserById: db.prepare(`SELECT * FROM users WHERE id = ?`),

  setVerified: db.prepare(`UPDATE users SET verified = 1 WHERE id = ?`),

  setOnboarding: db.prepare(`
    UPDATE users SET onboarding_done = 1, onboarding_data = ?, assigned_teacher_id = ?
    WHERE id = ?
  `),

  getTeachers: db.prepare(`SELECT * FROM users WHERE role = 'teacher' AND verified = 1`),

  getRoomMessages: db.prepare(`
    SELECT m.*, u.anon_name FROM messages m
    JOIN users u ON m.sender_id = u.id
    WHERE m.room = ?
    ORDER BY m.created_at ASC
    LIMIT 100
  `),

  insertMessage: db.prepare(`
    INSERT INTO messages (id, room, sender_id, content) VALUES (@id, @room, @sender_id, @content)
  `),

  getOrCreateThread: db.transaction((a, b) => {
    const sorted = [a, b].sort();
    let thread = db.prepare(`
      SELECT * FROM dm_threads WHERE participant_a = ? AND participant_b = ?
    `).get(sorted[0], sorted[1]);
    if (!thread) {
      const id = require('uuid').v4();
      db.prepare(`
        INSERT INTO dm_threads (id, participant_a, participant_b) VALUES (?, ?, ?)
      `).run(id, sorted[0], sorted[1]);
      thread = db.prepare(`SELECT * FROM dm_threads WHERE id = ?`).get(id);
    }
    return thread;
  }),

  getThreadMessages: db.prepare(`
    SELECT dm.*, u.anon_name FROM dm_messages dm
    JOIN users u ON dm.sender_id = u.id
    WHERE dm.thread_id = ?
    ORDER BY dm.created_at ASC
    LIMIT 200
  `),

  insertDmMessage: db.prepare(`
    INSERT INTO dm_messages (id, thread_id, sender_id, content)
    VALUES (@id, @thread_id, @sender_id, @content)
  `),

  getUserThreads: db.prepare(`
    SELECT dt.*, 
      ua.anon_name as name_a, ua.role as role_a,
      ub.anon_name as name_b, ub.role as role_b
    FROM dm_threads dt
    JOIN users ua ON dt.participant_a = ua.id
    JOIN users ub ON dt.participant_b = ub.id
    WHERE dt.participant_a = ? OR dt.participant_b = ?
    ORDER BY dt.created_at DESC
  `),

  getAllVerifiedUsers: db.prepare(`
    SELECT id, anon_name, role FROM users WHERE verified = 1
  `)
};

module.exports = { db, queries };
