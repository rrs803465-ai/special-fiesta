const { v4: uuid } = require('uuid');
const { queries } = require('./db');

const onlineUsers = new Map();

function initSocket(io) {
  io.use((socket, next) => {
    const session = socket.request.session;
    if (!session?.userId) return next(new Error('Unauthorized'));
    socket.userId = session.userId;
    next();
  });

  io.on('connection', (socket) => {
    const user = queries.getUserById.get(socket.userId);
    if (!user) return socket.disconnect();

    onlineUsers.set(socket.userId, {
      id: user.id,
      anon_name: user.anon_name,
      role: user.role,
      socketId: socket.id
    });

    io.emit('online_count', { count: onlineUsers.size });

    socket.on('join_room', ({ room }) => {
      const allowed = ['teacher-lounge', 'student-commons'];
      if (!allowed.includes(room)) return;
      if (room === 'teacher-lounge' && user.role !== 'teacher') return;
      if (room === 'student-commons' && user.role !== 'student') return;

      socket.rooms.forEach(r => { if (r !== socket.id) socket.leave(r); });
      socket.join(room);
    });

    socket.on('room_message', ({ room, content }) => {
      if (!content?.trim()) return;
      const allowed = ['teacher-lounge', 'student-commons'];
      if (!allowed.includes(room)) return;
      if (room === 'teacher-lounge' && user.role !== 'teacher') return;
      if (room === 'student-commons' && user.role !== 'student') return;

      const msg = {
        id: uuid(),
        room,
        sender_id: user.id,
        content: content.trim().slice(0, 2000)
      };

      queries.insertMessage.run(msg);

      io.to(room).emit('room_message', {
        id: msg.id,
        room,
        sender_id: user.id,
        anon_name: user.anon_name,
        content: msg.content,
        created_at: Math.floor(Date.now() / 1000)
      });
    });

    socket.on('join_dm', ({ otherId }) => {
      const thread = queries.getOrCreateThread(socket.userId, otherId);
      socket.join('dm:' + thread.id);
      socket.emit('dm_thread', { threadId: thread.id });
    });

    socket.on('dm_message', ({ otherId, content }) => {
      if (!content?.trim()) return;
      const thread = queries.getOrCreateThread(socket.userId, otherId);
      const msg = {
        id: uuid(),
        thread_id: thread.id,
        sender_id: user.id,
        content: content.trim().slice(0, 2000)
      };

      queries.insertDmMessage.run(msg);

      const payload = {
        id: msg.id,
        thread_id: thread.id,
        sender_id: user.id,
        anon_name: user.anon_name,
        content: msg.content,
        created_at: Math.floor(Date.now() / 1000)
      };

      io.to('dm:' + thread.id).emit('dm_message', payload);

      const otherUser = onlineUsers.get(otherId);
      if (otherUser) {
        io.to(otherUser.socketId).emit('dm_notification', {
          threadId: thread.id,
          from: user.anon_name
        });
      }
    });

    socket.on('typing', ({ room }) => {
      socket.to(room).emit('typing', { anon_name: user.anon_name, room });
    });

    socket.on('typing_dm', ({ otherId }) => {
      const other = onlineUsers.get(otherId);
      if (other) {
        io.to(other.socketId).emit('typing_dm', { anon_name: user.anon_name });
      }
    });

    socket.on('disconnect', () => {
      onlineUsers.delete(socket.userId);
      io.emit('online_count', { count: onlineUsers.size });
    });
  });
}

module.exports = { initSocket };
