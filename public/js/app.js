let socket = null;
let currentUser = null;
let currentPanel = null;
let currentDmOtherId = null;
let currentDmThreadId = null;
let tutorHistory = [];
let gateQuestions = [];
let gateIndex = 0;
let gateAnswers = [];
let pendingUserId = null;
let pendingRole = null;
let selectedRole = null;
let isRegisterMode = false;
let onboardData = { grade: null, struggles: [], style: null, performance: null };
let allUsers = [];
let typingTimers = {};

function api(path, opts = {}) {
  return fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  }).then(r => r.json());
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
  });
  const el = document.getElementById(id);
  if (el) {
    requestAnimationFrame(() => { el.classList.add('active'); });
  }
}

async function runIntro() {
  const seen = sessionStorage.getItem('zacier_intro');
  if (seen) { showScreen('auth-screen'); return; }
  sessionStorage.setItem('zacier_intro', '1');

  showScreen('intro-screen');
  await delay(400);
  document.getElementById('il-1').classList.add('visible');
  await delay(800);
  document.getElementById('il-2').classList.add('visible');
  await delay(700);
  document.getElementById('il-brand').classList.add('visible');
  await delay(1400);
  document.getElementById('intro-screen').classList.remove('active');
  await delay(200);
  showScreen('auth-screen');
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function toggleAuth() {
  isRegisterMode = !isRegisterMode;
  selectedRole = null;

  document.getElementById('auth-heading').textContent = isRegisterMode ? 'Create account' : 'Welcome back';
  document.getElementById('auth-sub').textContent = isRegisterMode
    ? 'Choose your role to get started.'
    : 'Sign in to continue.';
  document.getElementById('auth-submit-btn').textContent = isRegisterMode ? 'Create account' : 'Sign in';
  document.getElementById('auth-toggle').innerHTML = isRegisterMode
    ? 'Have an account? <a onclick="toggleAuth()">Sign in</a>'
    : 'No account? <a onclick="toggleAuth()">Create one</a>';
  document.getElementById('role-picker').style.display = isRegisterMode ? 'block' : 'none';
  document.getElementById('role-teacher').classList.remove('selected');
  document.getElementById('role-student').classList.remove('selected');
  clearBanners();
}

function selectRole(role) {
  selectedRole = role;
  document.getElementById('role-teacher').classList.toggle('selected', role === 'teacher');
  document.getElementById('role-student').classList.toggle('selected', role === 'student');
}

function showError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.add('show');
  el.classList.remove('success');
  el.classList.add('error');
}

function showSuccess(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.add('show');
  el.classList.remove('error');
  el.classList.add('success');
}

function clearBanners() {
  document.querySelectorAll('.msg-banner').forEach(b => b.classList.remove('show'));
}

document.getElementById('auth-submit-btn').addEventListener('click', handleAuth);
document.getElementById('auth-email').addEventListener('keydown', e => { if (e.key === 'Enter') handleAuth(); });
document.getElementById('auth-password').addEventListener('keydown', e => { if (e.key === 'Enter') handleAuth(); });

async function handleAuth() {
  clearBanners();
  const email = document.getElementById('auth-email').value.trim().toLowerCase();
  const pass = document.getElementById('auth-password').value;

  if (!email || !pass) { showError('auth-error', 'Email and password are required.'); return; }
  if (!email.includes('@')) { showError('auth-error', 'Enter a valid email.'); return; }
  if (pass.length < 6) { showError('auth-error', 'Password must be at least 6 characters.'); return; }

  const btn = document.getElementById('auth-submit-btn');
  btn.disabled = true;
  btn.textContent = 'Please wait...';

  if (isRegisterMode) {
    if (!selectedRole) {
      showError('auth-error', 'Select a role — Teacher or Student.');
      btn.disabled = false;
      btn.textContent = 'Create account';
      return;
    }

    if (selectedRole === 'student') {
      const { questions } = await api('/api/auth/student-questions');
      const res = await api('/api/auth/register', { method: 'POST', body: { email, password: pass, role: selectedRole } });
      if (res.error) { showError('auth-error', res.error); btn.disabled = false; btn.textContent = 'Create account'; return; }
      pendingUserId = res.userId;
      pendingRole = 'student';
      gateQuestions = questions;
      gateIndex = 0;
      gateAnswers = [];
      loadGateQuestion(true);
      showScreen('gate-screen');
    } else {
      const res = await api('/api/auth/register', { method: 'POST', body: { email, password: pass, role: selectedRole } });
      if (res.error) { showError('auth-error', res.error); btn.disabled = false; btn.textContent = 'Create account'; return; }
      pendingUserId = res.userId;
      pendingRole = 'teacher';
      gateQuestions = res.questions;
      gateIndex = 0;
      gateAnswers = [];
      loadGateQuestion(false);
      showScreen('gate-screen');
    }
  } else {
    const res = await api('/api/auth/login', { method: 'POST', body: { email, password: pass } });
    if (res.error) { showError('auth-error', res.error); btn.disabled = false; btn.textContent = 'Sign in'; return; }
    if (res.needsVerification) {
      pendingUserId = res.userId;
      pendingRole = res.role;
      if (res.role === 'student') {
        const sq = await api('/api/auth/student-questions');
        gateQuestions = sq.questions;
        loadGateQuestion(true);
      } else {
        gateQuestions = res.questions;
        loadGateQuestion(false);
      }
      gateIndex = 0;
      gateAnswers = [];
      showScreen('gate-screen');
      return;
    }
    currentUser = res.user;
    enterApp();
  }

  btn.disabled = false;
  btn.textContent = isRegisterMode ? 'Create account' : 'Sign in';
}

function loadGateQuestion(isStudent) {
  const q = gateQuestions[gateIndex];
  document.getElementById('gq-num').textContent = gateIndex + 1;
  document.getElementById('gq-text').textContent = isStudent ? q.q : q.q;
  document.getElementById('gate-input').value = '';
  document.getElementById('gate-error').classList.remove('show');
  document.getElementById('gate-thinking').classList.remove('show');
  document.getElementById('gate-sub').textContent = pendingRole === 'student'
    ? 'Answer 3 arithmetic questions to verify.'
    : 'Answer 3 questions to verify you\'re an educator.';

  for (let i = 0; i < 3; i++) {
    const dot = document.getElementById('gdot-' + i);
    dot.classList.remove('done', 'active');
    if (i < gateIndex) dot.classList.add('done');
    else if (i === gateIndex) dot.classList.add('active');
  }

  setTimeout(() => { document.getElementById('gate-input').focus(); }, 100);
}

document.getElementById('gate-input').addEventListener('keydown', e => { if (e.key === 'Enter') submitGate(); });

async function submitGate() {
  const answer = document.getElementById('gate-input').value.trim();
  if (!answer) { showError('gate-error', 'Type an answer first.'); return; }

  document.getElementById('gate-btn').disabled = true;
  document.getElementById('gate-thinking').classList.add('show');
  document.getElementById('gate-error').classList.remove('show');

  gateAnswers.push(answer);

  const isLast = gateIndex === 2;

  if (!isLast) {
    document.getElementById('gdot-' + gateIndex).classList.remove('active');
    document.getElementById('gdot-' + gateIndex).classList.add('done');
    gateIndex++;
    loadGateQuestion(pendingRole === 'student');
    document.getElementById('gate-thinking').classList.remove('show');
    document.getElementById('gate-btn').disabled = false;
    return;
  }

  document.getElementById('gdot-2').classList.remove('active');
  document.getElementById('gdot-2').classList.add('done');

  const res = await api('/api/auth/verify', {
    method: 'POST',
    body: { userId: pendingUserId, answers: gateAnswers, questions: gateQuestions }
  });

  document.getElementById('gate-thinking').classList.remove('show');
  document.getElementById('gate-btn').disabled = false;

  if (!res.passed) {
    showError('gate-error', 'Verification failed. Please try again.');
    gateIndex = 0;
    gateAnswers = [];
    if (pendingRole === 'student') {
      const sq = await api('/api/auth/student-questions');
      gateQuestions = sq.questions;
      loadGateQuestion(true);
    }
    for (let i = 0; i < 3; i++) {
      const d = document.getElementById('gdot-' + i);
      d.classList.remove('done');
      if (i === 0) d.classList.add('active');
    }
    return;
  }

  currentUser = res.user;

  if (currentUser.role === 'student' && !currentUser.onboarding_done) {
    showScreen('onboard-screen');
  } else {
    enterApp();
  }
}

function pickOption(key, el, val) {
  const parent = el.parentElement;
  parent.querySelectorAll('.option-chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  onboardData[key] = val;
}

function toggleMulti(key, el, val) {
  el.classList.toggle('selected');
  if (el.classList.contains('selected')) {
    onboardData[key].push(val);
  } else {
    onboardData[key] = onboardData[key].filter(v => v !== val);
  }
}

let onboardStep = 1;

function nextOnboard(step) {
  if (step === 1 && !onboardData.grade) { return; }
  if (step === 2 && onboardData.struggles.length === 0) { return; }
  if (step === 3 && !onboardData.style) { return; }

  document.getElementById('os-' + step).classList.remove('active');
  onboardStep = step + 1;
  document.getElementById('os-' + onboardStep).classList.add('active');
}

async function submitOnboard() {
  if (!onboardData.performance) {
    showError('onboard-error', 'Select your performance level.');
    return;
  }

  const res = await api('/api/auth/onboarding', {
    method: 'POST',
    body: { data: onboardData }
  });

  if (res.success) {
    currentUser = { ...currentUser, onboarding_done: 1, assigned_teacher_id: res.assignedTeacherId };
    enterApp();
  }
}

function enterApp() {
  initSocket();
  setupSidebar();
  loadUsers();

  if (currentUser.role === 'teacher') {
    openPanel('lounge');
  } else {
    openPanel('commons');
  }

  showScreen('app-screen');
}

function setupSidebar() {
  document.getElementById('sb-user').textContent = currentUser.anon_name;
  const badge = document.getElementById('sb-badge');
  badge.textContent = currentUser.role;
  badge.className = 'sidebar-role-badge badge-' + currentUser.role;
  document.getElementById('online-count').textContent = '—';
  document.getElementById('online-count-2').textContent = '—';

  if (currentUser.role === 'teacher') {
    document.getElementById('nav-lounge').style.display = 'flex';
  } else {
    document.getElementById('nav-commons').style.display = 'flex';
    document.getElementById('nav-tutor').style.display = 'flex';
    if (currentUser.assigned_teacher_id) {
      document.getElementById('nav-myteacher').style.display = 'flex';
    }
  }
}

async function loadUsers() {
  const { users } = await api('/api/auth/users');
  allUsers = users || [];
  renderDmList();
}

function filterDmUsers() {
  renderDmList(document.getElementById('dm-search').value.trim().toLowerCase());
}

function renderDmList(filter = '') {
  const container = document.getElementById('dm-user-list');
  container.querySelectorAll('.dm-user-item').forEach(e => e.remove());
  document.getElementById('empty-dms').style.display = 'none';

  const filtered = filter ? allUsers.filter(u => u.anon_name.toLowerCase().includes(filter)) : allUsers;

  if (filtered.length === 0) {
    document.getElementById('empty-dms').style.display = 'flex';
    return;
  }

  filtered.forEach(u => {
    const item = document.createElement('div');
    item.className = 'dm-user-item';
    item.onclick = () => openDmWith(u.id, u.anon_name, u.role);
    item.innerHTML = `
      <div class="dm-avatar">${u.anon_name.charAt(0)}</div>
      <div>
        <div class="dm-name">${u.anon_name}</div>
        <div class="dm-role">${u.role}</div>
      </div>
    `;
    container.appendChild(item);
  });
}

function openPanel(name) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const panel = document.getElementById('panel-' + name);
  if (panel) panel.classList.add('active');

  const navEl = document.getElementById('nav-' + name);
  if (navEl) navEl.classList.add('active');

  currentPanel = name;

  if (name === 'lounge') {
    socket && socket.emit('join_room', { room: 'teacher-lounge' });
    loadRoomHistory('teacher-lounge', 'lounge');
  } else if (name === 'commons') {
    socket && socket.emit('join_room', { room: 'student-commons' });
    loadRoomHistory('student-commons', 'commons');
  } else if (name === 'dms') {
    loadUsers();
  }
}

async function openMyTeacher() {
  if (!currentUser.assigned_teacher_id) return;
  const teacher = allUsers.find(u => u.id === currentUser.assigned_teacher_id);
  if (teacher) {
    openDmWith(teacher.id, teacher.anon_name, 'teacher');
  } else {
    const { users } = await api('/api/auth/users');
    allUsers = users || [];
    const t = allUsers.find(u => u.id === currentUser.assigned_teacher_id);
    if (t) openDmWith(t.id, t.anon_name, 'teacher');
  }
}

async function loadRoomHistory(room, panelId) {
  const { messages } = await api('/api/chat/room/' + room);
  const container = document.getElementById('msgs-' + panelId);
  container.querySelectorAll('.msg-group, .msg-day-divider').forEach(e => e.remove());

  const empty = document.getElementById('empty-' + panelId);
  if (!messages || messages.length === 0) { empty.style.display = 'flex'; return; }
  empty.style.display = 'none';

  messages.forEach(m => appendRoomMessage(m, panelId, false));
  scrollBottom('msgs-' + panelId);
}

function appendRoomMessage(m, panelId, animate = true) {
  const container = document.getElementById('msgs-' + panelId);
  document.getElementById('empty-' + panelId).style.display = 'none';

  const isMe = m.sender_id === currentUser.id;
  const group = document.createElement('div');
  group.className = 'msg-group';
  if (!animate) group.style.animation = 'none';

  const meta = document.createElement('div');
  meta.className = 'msg-meta' + (isMe ? ' me' : '');
  meta.innerHTML = `<span class="msg-sender">${isMe ? 'You' : m.anon_name}</span><span class="msg-time">${fmtTime(m.created_at)}</span>`;

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble ' + (isMe ? 'me' : 'them');
  bubble.textContent = m.content;

  group.appendChild(meta);
  group.appendChild(bubble);
  container.appendChild(group);
}

async function openDmWith(otherId, otherName, otherRole) {
  currentDmOtherId = otherId;
  document.getElementById('dm-thread-name').textContent = otherName;
  document.getElementById('dm-thread-role').textContent = otherRole;

  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-dm-thread').classList.add('active');
  currentPanel = 'dm-thread';

  const { thread, messages } = await api('/api/chat/dm/' + otherId);
  currentDmThreadId = thread.id;

  socket && socket.emit('join_dm', { otherId });

  const container = document.getElementById('msgs-dm');
  container.querySelectorAll('.msg-group').forEach(e => e.remove());
  document.getElementById('empty-dm').style.display = messages.length === 0 ? 'flex' : 'none';

  messages.forEach(m => appendDmMessage(m, false));
  scrollBottom('msgs-dm');
}

function appendDmMessage(m, animate = true) {
  const container = document.getElementById('msgs-dm');
  document.getElementById('empty-dm').style.display = 'none';

  const isMe = m.sender_id === currentUser.id;
  const group = document.createElement('div');
  group.className = 'msg-group';
  if (!animate) group.style.animation = 'none';

  const meta = document.createElement('div');
  meta.className = 'msg-meta' + (isMe ? ' me' : '');
  meta.innerHTML = `<span class="msg-sender">${isMe ? 'You' : m.anon_name}</span><span class="msg-time">${fmtTime(m.created_at)}</span>`;

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble ' + (isMe ? 'me' : 'them');
  bubble.textContent = m.content;

  group.appendChild(meta);
  group.appendChild(bubble);
  container.appendChild(group);
}

function sendRoom(room, panelId) {
  const input = document.getElementById('input-' + panelId);
  const content = input.value.trim();
  if (!content || !socket) return;
  socket.emit('room_message', { room, content });
  input.value = '';
  input.style.height = 'auto';
}

function sendDm() {
  const input = document.getElementById('input-dm');
  const content = input.value.trim();
  if (!content || !socket || !currentDmOtherId) return;
  socket.emit('dm_message', { otherId: currentDmOtherId, content });
  input.value = '';
  input.style.height = 'auto';
}

async function sendTutor() {
  const input = document.getElementById('input-tutor');
  const content = input.value.trim();
  if (!content) return;

  const container = document.getElementById('msgs-tutor');
  document.getElementById('empty-tutor').style.display = 'none';
  input.value = '';
  input.style.height = 'auto';

  tutorHistory.push({ role: 'user', content });
  appendTutorMessage('You', content, 'me');
  scrollBottom('msgs-tutor');

  const typingBar = document.getElementById('typing-tutor');
  typingBar.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div> Tutor is thinking...';

  const { reply, error } = await api('/api/chat/tutor', { method: 'POST', body: { history: tutorHistory } });
  typingBar.innerHTML = '';

  if (error) { appendTutorMessage('Tutor', 'Unavailable right now. Try again.', 'tutor'); return; }

  tutorHistory.push({ role: 'assistant', content: reply });
  appendTutorMessage('Tutor', reply, 'tutor');
  scrollBottom('msgs-tutor');
}

function appendTutorMessage(name, content, type) {
  const container = document.getElementById('msgs-tutor');
  const group = document.createElement('div');
  group.className = 'msg-group';

  const isMe = type === 'me';
  const meta = document.createElement('div');
  meta.className = 'msg-meta' + (isMe ? ' me' : '');
  meta.innerHTML = `<span class="msg-sender">${name}</span><span class="msg-time">${fmtTime(Math.floor(Date.now()/1000))}</span>`;

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble ' + type;
  bubble.textContent = content;

  group.appendChild(meta);
  group.appendChild(bubble);
  container.appendChild(group);
}

function initSocket() {
  socket = io({ withCredentials: true });

  socket.on('connect', () => {
    if (currentPanel === 'lounge') socket.emit('join_room', { room: 'teacher-lounge' });
    if (currentPanel === 'commons') socket.emit('join_room', { room: 'student-commons' });
  });

  socket.on('online_count', ({ count }) => {
    document.getElementById('online-count').textContent = count + ' online';
    document.getElementById('online-count-2').textContent = count + ' online';
  });

  socket.on('room_message', (msg) => {
    const panelId = msg.room === 'teacher-lounge' ? 'lounge' : 'commons';
    appendRoomMessage(msg, panelId, true);
    scrollBottom('msgs-' + panelId);
    clearTyping(panelId);
  });

  socket.on('dm_message', (msg) => {
    if (currentPanel === 'dm-thread' && msg.thread_id === currentDmThreadId) {
      appendDmMessage(msg, true);
      scrollBottom('msgs-dm');
      clearTyping('dm');
    }
  });

  socket.on('dm_notification', ({ from }) => {
    const badge = document.getElementById('dm-badge');
    badge.style.display = 'flex';
    const current = parseInt(badge.textContent) || 0;
    badge.textContent = current + 1;
  });

  socket.on('typing', ({ anon_name, room }) => {
    const panelId = room === 'teacher-lounge' ? 'lounge' : 'commons';
    showTyping(panelId, anon_name + ' is typing');
  });

  socket.on('typing_dm', ({ anon_name }) => {
    showTyping('dm', anon_name + ' is typing');
  });
}

function showTyping(panelId, text) {
  const bar = document.getElementById('typing-' + panelId);
  if (!bar) return;
  bar.innerHTML = `<div class="typing-dots"><span></span><span></span><span></span></div> ${text}...`;
  clearTimeout(typingTimers[panelId]);
  typingTimers[panelId] = setTimeout(() => clearTyping(panelId), 2500);
}

function clearTyping(panelId) {
  const bar = document.getElementById('typing-' + panelId);
  if (bar) bar.innerHTML = '';
}

function setupTypingEmit(inputId, event) {
  document.getElementById(inputId)?.addEventListener('input', () => {
    socket && socket.emit(event.type, event.payload);
  });
}

document.querySelectorAll('.chat-textarea').forEach(ta => {
  ta.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const id = ta.id;
      if (id === 'input-lounge') sendRoom('teacher-lounge', 'lounge');
      else if (id === 'input-commons') sendRoom('student-commons', 'commons');
      else if (id === 'input-dm') sendDm();
      else if (id === 'input-tutor') sendTutor();
    }
  });
  ta.addEventListener('input', () => {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
    const id = ta.id;
    if (!socket) return;
    if (id === 'input-lounge') socket.emit('typing', { room: 'teacher-lounge' });
    if (id === 'input-commons') socket.emit('typing', { room: 'student-commons' });
    if (id === 'input-dm' && currentDmOtherId) socket.emit('typing_dm', { otherId: currentDmOtherId });
  });
});

function scrollBottom(containerId) {
  const el = document.getElementById(containerId);
  if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
}

function fmtTime(ts) {
  const d = ts > 1e10 ? new Date(ts) : new Date(ts * 1000);
  const h = d.getHours(), m = d.getMinutes();
  return (h % 12 || 12) + ':' + String(m).padStart(2, '0') + ' ' + (h >= 12 ? 'PM' : 'AM');
}

async function doLogout() {
  await api('/api/auth/logout', { method: 'POST' });
  socket && socket.disconnect();
  socket = null;
  currentUser = null;
  currentPanel = null;
  tutorHistory = [];
  allUsers = [];
  isRegisterMode = false;
  selectedRole = null;
  onboardStep = 1;
  onboardData = { grade: null, struggles: [], style: null, performance: null };
  document.getElementById('auth-email').value = '';
  document.getElementById('auth-password').value = '';
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  clearBanners();
  if (isRegisterMode) toggleAuth();
  showScreen('auth-screen');
}

async function init() {
  const { user } = await api('/api/auth/me');
  if (user) {
    currentUser = user;
    enterApp();
  } else {
    runIntro();
  }
}

init();
