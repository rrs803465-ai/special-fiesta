const fetch = require('node-fetch');

require('dotenv').config();

const keys = [
  process.env.GROQ_KEY_1,
  process.env.GROQ_KEY_2,
  process.env.GROQ_KEY_3,
  process.env.GROQ_KEY_4,
  process.env.GROQ_KEY_5,
  process.env.GROQ_KEY_6,
  process.env.GROQ_KEY_7,
  process.env.GROQ_KEY_8,
  process.env.GROQ_KEY_9,
  process.env.GROQ_KEY_10
].filter(Boolean);

let keyIndex = 0;

function nextKey() {
  const key = keys[keyIndex % keys.length];
  keyIndex = (keyIndex + 1) % keys.length;
  return key;
}

async function chat(messages, systemPrompt = '', maxTokens = 1024) {
  let lastError;
  for (let attempt = 0; attempt < keys.length; attempt++) {
    const key = nextKey();
    try {
      const body = {
        model: 'llama-3.3-70b-versatile',
        max_tokens: maxTokens,
        messages: systemPrompt
          ? [{ role: 'system', content: systemPrompt }, ...messages]
          : messages
      };

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (res.status === 429) {
        lastError = 'rate_limited';
        continue;
      }

      if (!res.ok) {
        lastError = `http_${res.status}`;
        continue;
      }

      const data = await res.json();
      return data.choices?.[0]?.message?.content?.trim() || '';
    } catch (e) {
      lastError = e.message;
    }
  }
  throw new Error(`All Groq keys failed. Last error: ${lastError}`);
}

async function verifyTeacherAnswer(question, answer) {
  const prompt = `You verify if someone is a real teacher based on their classroom knowledge.
Question: "${question}"
Answer: "${answer}"
Does this show genuine teaching knowledge? Accept reasonable paraphrases. Reply ONLY with YES or NO.`;

  const result = await chat([{ role: 'user', content: prompt }], '', 5);
  return result.toUpperCase().startsWith('YES');
}

async function tutorResponse(studentContext, conversationHistory) {
  const system = `You are an AI tutor inside Zacier, a learning platform. You are helping a student.
Student profile: ${JSON.stringify(studentContext)}
Be encouraging, clear, and concise. Use simple language. Ask follow-up questions to check understanding.
Never say you are an AI. Never say you are a language model. You are just their tutor.`;

  return await chat(conversationHistory, system, 512);
}

module.exports = { chat, verifyTeacherAnswer, tutorResponse };
