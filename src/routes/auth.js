const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const { queries } = require('../db');
const { verifyTeacherAnswer } = require('../groq');

const router = express.Router();

const TEACHER_NAMES = [
  'Sage Hollow','River Crest','Ember Vale','Stone Bridge','Cedar Mist',
  'Birch Lane','Slate Peak','Fern Ridge','Moss Glen','Tide Watch',
  'Aspen Draw','Chalk Bluff','Dusk Plain','Iron Ford','Lark Hill',
  'Maple Run','North Fen','Oak Bend','Pine Court','Quill Shore'
];

const STUDENT_NAMES = [
  'Blue Jay','Cardinal','Finch','Sparrow','Wren','Falcon','Kestrel',
  'Martin','Oriole','Plover','Robin','Swift','Thrush','Vireo','Warbler',
  'Crossbill','Dunlin','Egret','Godwit','Harrier'
];

const TEACHER_QUESTIONS = [
  { q: "A student refuses to sit and disrupts class. What is your first de-escalation step?", topic: "de-escalation" },
  { q: "What does IEP stand for and who does it support?", topic: "IEP" },
  { q: "What is a formative assessment vs a summative assessment?", topic: "assessment" },
  { q: "Name two co-regulation strategies for an emotionally dysregulated student.", topic: "co-regulation" },
  { q: "What does PLC stand for in a school context?", topic: "PLC" },
  { q: "What does differentiated instruction look like in a mixed-ability classroom?", topic: "differentiation" },
  { q: "A parent is upset about their child's failing grade. How do you handle the conversation?", topic: "parent comms" },
  { q: "What is RTI and which students fall into Tier 2?", topic: "RTI" },
  { q: "What does a growth mindset classroom look like from a teacher's view?", topic: "growth mindset" },
  { q: "What is the difference between a 504 Plan and an IEP?", topic: "504 vs IEP" },
  { q: "Name one federal education law and one right it guarantees students.", topic: "education law" },
  { q: "A previously engaged student becomes withdrawn over two weeks. What steps do you take?", topic: "student welfare" },
  { q: "What is scaffolding in lesson planning? Give a brief example.", topic: "scaffolding" },
  { q: "What does PBIS stand for and what is its main goal?", topic: "PBIS" },
  { q: "Name two classroom accommodations for a student with ADHD.", topic: "ADHD" },
  { q: "What is wait time in questioning and why does research support it?", topic: "wait time" },
  { q: "A student discloses something that concerns you for their safety. What is your obligation?", topic: "mandatory reporting" },
  { q: "What is the purpose of a learning objective and how is it different from a classroom activity?", topic: "lesson planning" },
  { q: "Describe one strategy for building positive classroom culture in the first two weeks.", topic: "classroom culture" },
  { q: "What does the term 'equity' mean in educational practice, and how do you apply it?", topic: "equity" }
];

function pickQuestions(pool, count = 3) {
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function usedAnonName(role, existingNames) {
  const pool = role === 'teacher' ? TEACHER_NAMES : STUDENT_NAMES;
  const available = pool.filter(n => !existingNames.includes(n));
  if (available.length === 0) {
    const suffix = Math.floor(Math.random() * 900 + 100);
    return pool[Math.floor(Math.random() * pool.length)] + ' ' + suffix;
  }
  return available[Math.floor(Math.random() * available.length)];
}

router.post('/register', async (req, res) => {
  const { email, password, role } = req.body;
  if (!email || !password || !role) return res.status(400).json({ error: 'Missing fields' });
  if (!['teacher', 'student'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

  const existing = queries.getUserByEmail.get(email);
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const hashed = await bcrypt.hash(password, 10);
  const allUsers = queries.getAllVerifiedUsers.all();
  const usedNames = allUsers.map(u => u.anon_name);
  const anonName = usedAnonName(role, usedNames);
  const id = uuid();

  queries.createUser.run({ id, email, password: hashed, role, anon_name: anonName, verified: 0 });

  const questions = pickQuestions(TEACHER_QUESTIONS);
  res.json({ success: true, userId: id, questions, role });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Missing fields' });

  const user = queries.getUserByEmail.get(email);
  if (!user) return res.status(401).json({ error: 'No account found' });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: 'Incorrect password' });

  if (!user.verified) {
    const questions = pickQuestions(TEACHER_QUESTIONS);
    return res.json({ needsVerification: true, userId: user.id, questions, role: user.role });
  }

  req.session.userId = user.id;
  res.json({
    success: true,
    user: {
      id: user.id,
      role: user.role,
      anon_name: user.anon_name,
      onboarding_done: user.onboarding_done
    }
  });
});

router.post('/verify', async (req, res) => {
  const { userId, answers, questions } = req.body;
  if (!userId || !answers || !questions) return res.status(400).json({ error: 'Missing data' });

  const user = queries.getUserById.get(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (user.role === 'student') {
    const correct = answers.filter((a, i) => {
      const expected = questions[i]?.answer;
      return String(a).trim() === String(expected).trim();
    });
    if (correct.length < 2) return res.json({ passed: false });
    queries.setVerified.run(userId);
    req.session.userId = userId;
    return res.json({
      passed: true,
      user: { id: user.id, role: user.role, anon_name: user.anon_name, onboarding_done: user.onboarding_done }
    });
  }

  let passed = 0;
  for (let i = 0; i < questions.length; i++) {
    try {
      const ok = await verifyTeacherAnswer(questions[i].q, answers[i]);
      if (ok) passed++;
    } catch (e) {
      passed++;
    }
  }

  if (passed < 2) return res.json({ passed: false });

  queries.setVerified.run(userId);
  req.session.userId = userId;
  res.json({
    passed: true,
    user: { id: user.id, role: user.role, anon_name: user.anon_name, onboarding_done: user.onboarding_done }
  });
});

router.post('/onboarding', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  const { data } = req.body;

  const teachers = queries.getTeachers.all();
  let assigned = null;
  if (teachers.length > 0) {
    assigned = teachers[Math.floor(Math.random() * teachers.length)].id;
  }

  queries.setOnboarding.run(JSON.stringify(data), assigned, req.session.userId);
  const user = queries.getUserById.get(req.session.userId);
  res.json({ success: true, assignedTeacherId: assigned, user });
});

router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

router.get('/me', (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const user = queries.getUserById.get(req.session.userId);
  if (!user) return res.json({ user: null });
  res.json({
    user: {
      id: user.id,
      role: user.role,
      anon_name: user.anon_name,
      onboarding_done: user.onboarding_done,
      assigned_teacher_id: user.assigned_teacher_id,
      onboarding_data: user.onboarding_data ? JSON.parse(user.onboarding_data) : null
    }
  });
});

router.get('/student-questions', (req, res) => {
  const pool = [
    { q: "What is 7 × 8?", answer: "56" },
    { q: "What is 144 ÷ 12?", answer: "12" },
    { q: "What is 15 + 27?", answer: "42" },
    { q: "What is 9 × 9?", answer: "81" },
    { q: "What is 100 − 37?", answer: "63" },
    { q: "What is 6 × 7?", answer: "42" },
    { q: "What is 256 ÷ 16?", answer: "16" },
    { q: "What is 13 + 29?", answer: "42" },
    { q: "What is 8 × 11?", answer: "88" },
    { q: "What is 200 − 64?", answer: "136" },
    { q: "What is 5 × 12?", answer: "60" },
    { q: "What is 81 ÷ 9?", answer: "9" },
    { q: "What is 17 + 35?", answer: "52" },
    { q: "What is 4 × 13?", answer: "52" },
    { q: "What is 150 − 78?", answer: "72" }
  ];
  const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, 3);
  res.json({ questions: shuffled });
});

router.get('/users', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  const users = queries.getAllVerifiedUsers.all();
  const currentUser = queries.getUserById.get(req.session.userId);
  res.json({ users: users.filter(u => u.id !== req.session.userId), currentRole: currentUser?.role });
});

module.exports = router;
