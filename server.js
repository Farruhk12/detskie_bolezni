/**
 * Локальный сервер с ИИ-обработкой (Google Gemini)
 * Запуск: node server.js
 * Требуется: GEMINI_API_KEY в .env (ключ из Google AI Studio)
 *
 * Запуск: node server.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
function readEnvFile_(name) {
  try {
    let env = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    env = env.replace(/^\uFEFF/, '');
    const m = env.match(new RegExp('^' + name + '=(.+)$', 'm'));
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
  } catch { return ''; }
}
/** Сначала .env (чтобы смена ключа в файле работала), иначе переменные окружения — иначе старый GEMINI_API_KEY в Windows перекрывает .env */
const GEMINI_KEY = readEnvFile_('GEMINI_API_KEY') || process.env.GEMINI_API_KEY || '';
/** Модель Gemini API: на Free tier у Gemma 3 выше RPM, чем у Flash */
const GEMINI_MODEL = readEnvFile_('GEMINI_MODEL') || process.env.GEMINI_MODEL || 'gemma-3-27b-it';
const GEMINI_FALLBACK_MODEL = readEnvFile_('GEMINI_FALLBACK_MODEL') || process.env.GEMINI_FALLBACK_MODEL || 'gemini-2.5-flash';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
};

async function callGeminiOnce_(model, fullPrompt, maxTokens, temp) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(GEMINI_KEY)}`;
  const body = JSON.stringify({
    contents: [{ parts: [{ text: fullPrompt }] }],
    generationConfig: { temperature: temp, maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: 0 } },
  });
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2000 * attempt));
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    const text = await res.text();
    if (res.ok) {
      const j = JSON.parse(text);
      const part = j.candidates?.[0]?.content?.parts?.[0];
      return String(part?.text || '').trim();
    }
    lastErr = new Error('Gemini HTTP ' + res.status + ': ' + text.slice(0, 200));
    if (res.status !== 429 && res.status !== 503) throw lastErr;
  }
  throw lastErr;
}

async function callAI(systemPrompt, userPrompt, maxTokens = 700, temp = 0.2) {
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY не задан. Создайте .env с GEMINI_API_KEY=...');
  const fullPrompt = systemPrompt + '\n\n' + userPrompt;
  try {
    return await callGeminiOnce_(GEMINI_MODEL, fullPrompt, maxTokens, temp);
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    if (GEMINI_MODEL === GEMINI_FALLBACK_MODEL || !GEMINI_FALLBACK_MODEL) throw e;
    if (!/429|503/.test(msg)) throw e;
    console.warn('[Gemini] Повтор с моделью ' + GEMINI_FALLBACK_MODEL + ' (после 429/503 на ' + GEMINI_MODEL + ')');
    return await callGeminiOnce_(GEMINI_FALLBACK_MODEL, fullPrompt, maxTokens, temp);
  }
}

const server = http.createServer(async (req, res) => {
  const url = req.url === '/' ? '/index.html' : req.url;
  const [pathname, query] = url.split('?');

  if (req.method === 'POST' && pathname === '/api/chat') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const d = JSON.parse(body || '{}');
      const isCards = d.channel === 'cards';
      const sysPrompt = isCards
        ? 'Ты генерируешь учебные карточки. Отвечай ТОЛЬКО валидным JSON-массивом без markdown, без пояснений. Формат: [{"q":"Вопрос?","a":"Ответ."}]'
        : `Ты — помощник для студентов педиатрии ТГМУ. Отвечай на русском, медицински точно.

ВАЖНО: Давай сразу суть — без вступлений. Запрещено: «Привет!», «Давай разберёмся», «Итак», «Хороший вопрос» и т.п.
Формат: сразу по делу, 2–3 пунктами, без лишних слов.`;
      const userPrompt = isCards
        ? 'Тема: ' + (d.topicTitle||'') + '\nОписание: ' + (d.topicDesc||'').slice(0, 3500) + '\n\n' + (d.question||'')
        : 'Тема: ' + (d.topicTitle||'') + '\n\nКонтекст:\n' + (d.topicDesc||'') + '\n\n---\nВопрос: ' + (d.question||'');
      const answer = await callAI(sysPrompt, userPrompt, isCards ? 2500 : 700, 0.2);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ answer }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: String(e.message) }));
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/grade') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const d = JSON.parse(body || '{}');
      const answers = d.answers || [];
      const hasPerTopic = answers.some(a => a.topicTitle);
      const qtext = hasPerTopic
        ? answers.map((a,i)=>`Вопрос ${i+1} (тема: ${a.topicTitle||'—'}): ${a.question}\nОтвет студента: ${a.answer||'(не ответил)'}`).join('\n\n')
        : answers.map((a,i)=>`Вопрос ${i+1}: ${a.question}\nОтвет студента: ${a.answer||'(не ответил)'}`).join('\n\n');
      const topicCtx = hasPerTopic
        ? 'Вопросы из разных тем курса. Оцени каждый ответ по контексту своей темы.'
        : 'Тема: ' + (d.topicTitle||'') + '\n\nКонтекст:\n' + (d.topicDesc||'').slice(0,4000);
      const raw = await callAI(
        `Ты — строгий экзаменатор педиатрии. Оцени ответы как на реальном экзамене у будущих врачей. Будь максимально требовательным.

Критерии оценок:
- 5: Полный, точный ответ. Медицинская терминология, структура, все ключевые пункты. Без ошибок.
- 4: В целом верно, но есть неточности или незначительные пропуски.
- 3: Частичный ответ, пропущены важные аспекты, нет структуры.
- 2: Поверхностно, общие фразы, много ошибок или неверная трактовка.
- 1: Не ответил по существу, неверно, не по теме.

Не завышай оценки. Неполный ответ — максимум 3. «Думаю», «наверное», общие фразы без конкретики — 2 или ниже. Отсутствие ответа — 1.

Для каждого вопроса: оценка 1–5 и краткий, конкретный комментарий на русском (что упущено, что неверно).
Верни ТОЛЬКО JSON: [{"grade":N,"comment":"..."}]. Количество элементов = количеству вопросов.`,
        topicCtx + '\n\n' + qtext,
        1500, 0.2
      );
      let grades = [];
      const m = raw.match(/\[[\s\S]*\]/);
      if (m) { try { grades = JSON.parse(m[0]); } catch {} }
      const avg = grades.length ? +(grades.reduce((s,g)=>s+(Number(g.grade)||0),0)/grades.length).toFixed(1) : 0;
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: true, grades, avgGrade: avg }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: false, error: String(e.message) }));
    }
    return;
  }

  const filePath = path.join(__dirname, pathname.replace(/^\//, ''));
  const ext = path.extname(filePath);
  if (!ext || !MIME[ext]) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('Сервер: http://localhost:' + PORT);
  const src = readEnvFile_('GEMINI_API_KEY') ? 'из .env' : (process.env.GEMINI_API_KEY ? 'из переменной окружения' : '');
  if (GEMINI_KEY) {
    console.log('ИИ: OK — ключ ' + (src || 'задан') + ', модель ' + GEMINI_MODEL + ', запасная ' + GEMINI_FALLBACK_MODEL);
    console.log('   Проверка: последние 4 символа ключа = …' + GEMINI_KEY.slice(-4) + ' (сверьте с AI Studio)');
  } else {
    console.log('ИИ: НЕТ КЛЮЧА — создайте .env с GEMINI_API_KEY=...');
  }
});
