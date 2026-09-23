const express = require('express');
const { queries } = require('../db');
const { tutorResponse } = require('../groq');
const { v4: uuid } = require('uuid');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  next();
}

router.get('/room/:room', requireAuth, (req, res) => {
  const { room } = req.params;
  const allowed = ['teacher-lounge', 'student-commons'];
  if (!allowed.includes(room)) return res.status(403).json({ error: 'Invalid room' });

  const user = queries.getUserById.get(req.session.userId);
  if (room === 'teacher-lounge' && user.role !== 'teacher') return res.status(403).json({ error: 'Teachers only' });
  if (room === 'student-commons' && user.role !== 'student') return res.status(403).json({ error: 'Students only' });

  const messages = queries.getRoomMessages.all(room);
  res.json({ messages });
});

router.get('/dm/threads', requireAuth, (req, res) => {
  const threads = queries.getUserThreads.all(req.session.userId, req.session.userId);
  res.json({ threads });
});

router.get('/dm/:otherId', requireAuth, (req, res) => {
  const thread = queries.getOrCreateThread(req.session.userId, req.params.otherId);
  const messages = queries.getThreadMessages.all(thread.id);
  res.json({ thread, messages });
});

router.post('/tutor', requireAuth, async (req, res) => {
  const { history } = req.body;
  const user = queries.getUserById.get(req.session.userId);
  if (user.role !== 'student') return res.status(403).json({ error: 'Students only' });

  const onboarding = user.onboarding_data ? JSON.parse(user.onboarding_data) : {};

  try {
    const reply = await tutorResponse(onboarding, history || []);
    res.json({ reply });
  } catch (e) {
    res.status(500).json({ error: 'Tutor unavailable right now' });
  }
});

module.exports = router;
