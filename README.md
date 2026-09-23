# Zacier

Anonymous chat and learning platform for teachers and students.

## Deploy to Railway

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Select this repo
4. Go to **Variables** tab and add all env vars from `.env`:

```
PORT=3000
SESSION_SECRET=your_random_secret_here
GROQ_KEY_1=gsk_...
GROQ_KEY_2=gsk_...
... (all 10 keys)
```

5. Railway will auto-detect Node and run `npm start`
6. Done. Your app is live.

## Local dev

```bash
npm install
cp .env.example .env   # fill in your keys
npm run dev
```

Open http://localhost:3000

## Features

- Teacher accounts: verified via AI-evaluated classroom knowledge questions
- Student accounts: verified via arithmetic questions
- Student onboarding: grade, struggles, learning style, performance
- Auto teacher assignment for students
- Teacher Lounge: anonymous group chat, teachers only
- Student Commons: anonymous group chat, students only
- AI Tutor: Groq-powered personal tutor per student
- Private DMs: any user to any user
- Real-time with Socket.io
- 10-key Groq rotation with auto-failover
- Persistent SQLite storage (survives restarts on Railway volume)
