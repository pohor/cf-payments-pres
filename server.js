const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from Vite build
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const db = new Database(path.join(__dirname, 'comments.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS threads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slide_id TEXT NOT NULL,
    selected_text TEXT NOT NULL,
    pin_x REAL NOT NULL,
    pin_y REAL NOT NULL,
    resolved INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id INTEGER NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    author TEXT DEFAULT '',
    body TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Get all open threads with their replies
app.get('/api/threads', (req, res) => {
  const threads = db.prepare('SELECT * FROM threads WHERE resolved = 0 ORDER BY created_at ASC').all();
  const getReplies = db.prepare('SELECT * FROM replies WHERE thread_id = ? ORDER BY created_at ASC');
  const result = threads.map(t => ({ ...t, replies: getReplies.all(t.id) }));
  res.json(result);
});

// Create thread with first reply
app.post('/api/threads', (req, res) => {
  const { slide_id, selected_text, pin_x, pin_y, body, author } = req.body;
  if (!body || pin_x == null || pin_y == null) return res.status(400).json({ error: 'Missing fields' });

  const t = db.prepare(
    'INSERT INTO threads (slide_id, selected_text, pin_x, pin_y) VALUES (?, ?, ?, ?)'
  ).run(slide_id, selected_text || '', pin_x, pin_y);

  db.prepare(
    'INSERT INTO replies (thread_id, author, body) VALUES (?, ?, ?)'
  ).run(t.lastInsertRowid, author || '', body);

  const thread = db.prepare('SELECT * FROM threads WHERE id = ?').get(t.lastInsertRowid);
  const replies = db.prepare('SELECT * FROM replies WHERE thread_id = ?').all(t.lastInsertRowid);
  res.json({ ...thread, replies });
});

// Add reply to thread
app.post('/api/threads/:id/replies', (req, res) => {
  const { author, body } = req.body;
  if (!body) return res.status(400).json({ error: 'Missing body' });
  db.prepare('INSERT INTO replies (thread_id, author, body) VALUES (?, ?, ?)').run(req.params.id, author || '', body);
  const replies = db.prepare('SELECT * FROM replies WHERE thread_id = ? ORDER BY created_at ASC').all(req.params.id);
  res.json(replies);
});

// Resolve thread
app.patch('/api/threads/:id/resolve', (req, res) => {
  db.prepare('UPDATE threads SET resolved = 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Edit reply
app.patch('/api/replies/:id', (req, res) => {
  const { body } = req.body;
  if (!body) return res.status(400).json({ error: 'Missing body' });
  db.prepare('UPDATE replies SET body = ? WHERE id = ?').run(body, req.params.id);
  res.json({ ok: true });
});

// Delete reply
app.delete('/api/replies/:id', (req, res) => {
  const reply = db.prepare('SELECT * FROM replies WHERE id = ?').get(req.params.id);
  if (!reply) return res.status(404).json({ error: 'Not found' });
  // If it's the only reply, delete the whole thread
  const count = db.prepare('SELECT COUNT(*) as c FROM replies WHERE thread_id = ?').get(reply.thread_id);
  if (count.c <= 1) {
    db.prepare('DELETE FROM replies WHERE thread_id = ?').run(reply.thread_id);
    db.prepare('DELETE FROM threads WHERE id = ?').run(reply.thread_id);
  } else {
    db.prepare('DELETE FROM replies WHERE id = ?').run(req.params.id);
  }
  res.json({ ok: true });
});

// Delete thread
app.delete('/api/threads/:id', (req, res) => {
  db.prepare('DELETE FROM replies WHERE thread_id = ?').run(req.params.id);
  db.prepare('DELETE FROM threads WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Comments API running on http://localhost:${PORT}`));
