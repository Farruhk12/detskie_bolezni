const { callGeminiGenerate } = require('./geminiHelper.cjs');

/** Vercel Serverless — ИИ чат и карточки */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY не задан в Vercel' });
  const model = process.env.GEMINI_MODEL || 'gemma-3-27b-it';

  try {
    const d = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const isCards = d.channel === 'cards';
    const sysPrompt = isCards
      ? 'Ты генерируешь учебные карточки. Отвечай ТОЛЬКО валидным JSON-массивом без markdown, без пояснений. Формат: [{"q":"Вопрос?","a":"Ответ."}]'
      : `Ты — помощник для студентов педиатрии ТГМУ. Отвечай на русском, медицински точно.

ВАЖНО: Давай сразу суть — без вступлений. Запрещено: «Привет!», «Давай разберёмся», «Итак», «Хороший вопрос» и т.п.
Формат: сразу по делу, 2–3 пунктами, без лишних слов.`;
    const userPrompt = isCards
      ? 'Тема: ' + (d.topicTitle||'') + '\nОписание: ' + (d.topicDesc||'').slice(0, 3500) + '\n\n' + (d.question||'')
      : 'Тема: ' + (d.topicTitle||'') + '\n\nКонтекст:\n' + (d.topicDesc||'') + '\n\n---\nВопрос: ' + (d.question||'');
    const fullPrompt = sysPrompt + '\n\n' + userPrompt;
    const maxTokens = isCards ? 2500 : 700;

    const answer = await callGeminiGenerate({
      apiKey: key,
      model,
      fullPrompt,
      maxTokens,
      temp: 0.2,
    });
    res.status(200).json({ answer });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
};
