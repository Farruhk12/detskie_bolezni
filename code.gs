/***** КОНФИГУРАЦИЯ ЛИСТОВ *****/
const Л_ТЕМЫ    = 'База';               // A: Название, B: Описание, C: Ссылка, D: Курс, E: Факультет
const Л_КОММЕНТ = 'Комментарии';        // Дата | ID темы | Имя | Текст | Статус
const Л_РЕАКЦИИ = 'Реакции';           // ID темы | Лайки
const Л_ЛАЙКИ   = 'Лайки_устройства';  // ID темы | Токен | Дата
const Л_ВОП_ИИ  = 'Вопросы_ИИ';       // Дата | ID темы | Название темы | Вопрос | Ответ
const Л_КАРТОЧКИ= 'Генерация_карточек';// Дата | ID темы | Название темы | Запрос | Ответ
const Л_ЭКЗАМЕН = 'Экзаменационные_вопросы'; // Дата | ID темы | Название темы | Вопрос
const Л_РЕЗ_ЭКЗАМЕН = 'Результаты_экзамена'; // Дата | Уникальный ID | Курс | Факультет | Вопрос1 | Ответ1 | Оценка1 | ... | Средняя оценка

/***** GET *****/
function doGet(e) {
  const p = (e && e.parameter) || {};
  const action = p.action || 'topics';
  try {
    if (action === 'topics')        return out_({ topics: getTopics_(p) });
    if (action === 'comments')      return out_({ comments: getComments_(p.topicId) });
    if (action === 'reactions')     return out_({ reactions: getReactions_(p.topicId) });
    if (action === 'qa')            return out_({ qa: getQA_(p.topicId) });
    if (action === 'examQuestions') return out_({ questions: getExamQuestions_(p.topicId) });
    if (action === 'examQuestionsAll') return out_({ questions: getExamQuestionsAll_(p) });
    return out_({ error: 'Неизвестное действие' });
  } catch(err) { return out_({ error: String(err) }); }
}

/***** POST *****/
function doPost(e) {
  try {
    let d = {};
    if (e.postData && /json/i.test(e.postData.type || '')) {
      d = JSON.parse(e.postData.contents || '{}');
    } else if (e.parameter && Object.keys(e.parameter).length) {
      d = e.parameter;
    } else if (e.postData && e.postData.contents) {
      d = parseFormBody_(e.postData.contents);
    } else {
      d = {};
    }
    const a = String(d.action || '').trim();
    if (a === 'addComment')        return out_(addComment_(d));
    if (a === 'addQA')             return out_(addQA_(d));
    if (a === 'like')              return out_(likeTopic_(d.topicId, d.token));
    if (a === 'saveExamQuestions') return out_(saveExamQuestions_(d));
    if (a === 'addTopic')          return out_(addTopic_(d));
    if (a === 'updateTopic')       return out_(updateTopic_(d));
    if (a === 'aiChat')            return out_(aiChat_(d));
    if (a === 'aiGrade')           return out_(aiGrade_(d));
    if (a === 'saveExamResult')    return out_(saveExamResult_(d));
    return out_({ error: 'Неизвестное действие' });
  } catch(err) { return out_({ error: String(err) }); }
}

/***** ПАРОЛЬ АДМИНИСТРАТОРА *****/
// Задать: Проект → Свойства скрипта → Добавить свойство ADMIN_PASSWORD
function adminOk_(pwd) {
  const p = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  return !!(p && String(pwd) === String(p));
}

/***** ТЕМЫ *****/
// Структура листа "База": A=Название, B=Описание, C=Ссылка Общий, D=Курс, E=Факультет, F=Ссылка Патогенез
function getTopics_(params) {
  params = params || {};
  const sh = SpreadsheetApp.getActive().getSheetByName(Л_ТЕМЫ);
  if (!sh) throw new Error('Нет листа "' + Л_ТЕМЫ + '"');
  const last = sh.getLastRow();
  if (last < 2) return [];
  const numCols = Math.max(6, sh.getLastColumn());
  const vals = sh.getRange(2, 1, last - 1, numCols).getDisplayValues();
  const fc = String(params.course  || '').trim();
  const ff = String(params.faculty || '').trim();
  return vals
    .map((r, i) => ({
      id:          String(i + 2),
      title:       String(r[0] || '').trim(),
      description: String(r[1] || ''),
      link:        String(r[2] || '').trim(),
      linkPathogen: String(r[5] || '').trim(),
      course:      String(r[3] || '').trim(),
      faculty:     String(r[4] || '').trim(),
    }))
    .filter(t => t.title)
    .filter(t => !fc || !t.course  || t.course  === fc)
    .filter(t => !ff || !t.faculty || t.faculty === ff)
    .map(t => ({
      ...t,
      embed: makeEmbed_(t.link),
      embedPathogen: makeEmbed_(t.linkPathogen)
    }));
}

function addTopic_(d) {
  if (!adminOk_(d.adminPassword)) return { ok: false, error: 'Неверный пароль' };
  if (!d.title) return { ok: false, error: 'Название обязательно' };
  const sh = ensureSheet_(Л_ТЕМЫ, ['Название', 'Описание', 'Ссылка Общий', 'Курс', 'Факультет', 'Ссылка Патогенез']);
  ensureTopicColumns_(sh);
  sh.appendRow([String(d.title).trim(), String(d.description||''), String(d.videoLink||'').trim(), String(d.course||''), String(d.faculty||''), String(d.videoLinkPathogen||'').trim()]);
  return { ok: true, topicId: String(sh.getLastRow()) };
}

function ensureTopicColumns_(sh) {
  if (sh.getLastColumn() < 6) sh.getRange(1, 6).setValue('Ссылка Патогенез');
}

function updateTopic_(d) {
  if (!adminOk_(d.adminPassword)) return { ok: false, error: 'Неверный пароль' };
  const row = parseInt(d.topicId, 10);
  if (isNaN(row) || row < 2) return { ok: false, error: 'Некорректный ID' };
  const sh = SpreadsheetApp.getActive().getSheetByName(Л_ТЕМЫ);
  if (!sh) return { ok: false, error: 'Лист не найден' };
  ensureTopicColumns_(sh);
  sh.getRange(row, 1, 1, 6).setValues([[
    String(d.title||'').trim(), String(d.description||''),
    String(d.videoLink||'').trim(), String(d.course||''), String(d.faculty||''),
    String(d.videoLinkPathogen||'').trim()
  ]]);
  return { ok: true };
}

function makeEmbed_(url) {
  if (!url) return { type: 'link', src: '' };
  const u = url.trim();
  let m;
  m = u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{6,})/);
  if (m) return { type: 'youtube', src: 'https://www.youtube.com/embed/' + m[1] + '?rel=0' };
  m = u.match(/vimeo\.com\/(\d+)/);
  if (m) return { type: 'vimeo', src: 'https://player.vimeo.com/video/' + m[1] };
  m = u.match(/drive\.google\.com\/file\/d\/([^/]+)/) || u.match(/open\?id=([^&]+)/);
  if (m) return { type: 'drive', src: 'https://drive.google.com/file/d/' + m[1] + '/preview' };
  if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(u)) return { type: 'video', src: u };
  return { type: 'link', src: u };
}

/***** КОММЕНТАРИИ *****/
function getComments_(topicId) {
  if (!topicId) return [];
  const sh = ensureSheet_(Л_КОММЕНТ, ['Дата', 'ID темы', 'Имя', 'Комментарий', 'Статус']);
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 5).getValues()
    .filter(r => String(r[1]) === String(topicId) && !/скрыт/i.test(String(r[4])))
    .map(r => ({ ts: r[0], name: r[2], text: r[3] }));
}

function addComment_(d) {
  if (!d.topicId || !d.text) return { ok: false, error: 'Нет данных' };
  const sh = ensureSheet_(Л_КОММЕНТ, ['Дата', 'ID темы', 'Имя', 'Комментарий', 'Статус']);
  sh.appendRow([new Date(), String(d.topicId), String(d.name || 'Студент').slice(0, 40), String(d.text).slice(0, 2000), 'одобрен']);
  return { ok: true };
}

/***** ЛАЙКИ *****/
function getReactions_(topicId) {
  const sh = ensureSheet_(Л_РЕАКЦИИ, ['ID темы', 'Лайки']);
  const last = sh.getLastRow();
  if (last < 2) return { likes: 0 };
  const row = sh.getRange(2, 1, last - 1, 2).getValues().find(r => String(r[0]) === String(topicId));
  return { likes: row ? Number(row[1]) || 0 : 0 };
}

function likeTopic_(topicId, token) {
  if (!topicId || !token) return { ok: false, error: 'Нет данных' };
  const tsh = ensureSheet_(Л_ЛАЙКИ, ['ID темы', 'Токен', 'Дата']);
  const tLast = tsh.getLastRow();
  if (tLast >= 2 && tsh.getRange(2, 1, tLast - 1, 2).getValues()
      .find(r => String(r[0]) === String(topicId) && String(r[1]) === String(token))) {
    return { ok: false, already: true, likes: getReactions_(topicId).likes };
  }
  const rsh = ensureSheet_(Л_РЕАКЦИИ, ['ID темы', 'Лайки']);
  const rLast = rsh.getLastRow();
  let likes = 1;
  if (rLast >= 2) {
    const rows = rsh.getRange(2, 1, rLast - 1, 2).getValues();
    const idx = rows.findIndex(r => String(r[0]) === String(topicId));
    if (idx >= 0) { likes = (Number(rows[idx][1]) || 0) + 1; rsh.getRange(idx + 2, 2).setValue(likes); }
    else { rsh.appendRow([topicId, 1]); }
  } else { rsh.appendRow([topicId, 1]); }
  tsh.appendRow([topicId, token, new Date()]);
  return { ok: true, likes };
}

/***** ВОПРОСЫ ИИ *****/
function getQA_(topicId) {
  if (!topicId) return [];
  const sh = ensureSheet_(Л_ВОП_ИИ, ['Дата', 'ID темы', 'Название темы', 'Вопрос', 'Ответ']);
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 5).getValues()
    .filter(r => String(r[1]) === String(topicId))
    .reverse()
    .map(r => ({ ts: r[0], q: r[3], a: r[4] }));
}

function addQA_(d) {
  if (!d.topicId || !d.question) return { ok: false, error: 'topicId и question обязательны' };
  const title = getTopicTitle_(d.topicId);
  const sh = ensureSheet_(Л_ВОП_ИИ, ['Дата', 'ID темы', 'Название темы', 'Вопрос', 'Ответ']);
  sh.appendRow([new Date(), String(d.topicId), title, String(d.question).slice(0, 2000), String(d.answer || '').slice(0, 5000)]);
  return { ok: true };
}

function getTopicTitle_(topicId) {
  try {
    const sh = SpreadsheetApp.getActive().getSheetByName(Л_ТЕМЫ);
    if (!sh) return '';
    const row = parseInt(topicId, 10);
    if (isNaN(row) || row < 2) return '';
    return String(sh.getRange(row, 1).getDisplayValue() || '').trim();
  } catch { return ''; }
}

/***** ЭКЗАМЕНАЦИОННЫЕ ВОПРОСЫ *****/
function getExamQuestions_(topicId) {
  if (!topicId) return [];
  const sh = ensureSheet_(Л_ЭКЗАМЕН, ['Дата', 'ID темы', 'Название темы', 'Вопрос']);
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 4).getValues()
    .filter(r => String(r[1]) === String(topicId))
    .map(r => String(r[3]).trim())
    .filter(q => q.length > 0)
    .map(q => ({ q }));
}

function getExamQuestionsAll_(params) {
  const topics = getTopics_(params);
  if (!topics.length) return [];
  const sh = SpreadsheetApp.getActive().getSheetByName(Л_ЭКЗАМЕН);
  if (!sh) return [];
  const last = sh.getLastRow();
  if (last < 2) return [];
  const topicIds = new Set(topics.map(t => String(t.id)));
  const rows = sh.getRange(2, 1, last - 1, 4).getValues();
  const topicMap = {};
  topics.forEach(t => { topicMap[String(t.id)] = { id: t.id, title: t.title, desc: (t.description||'').replace(/<[^>]+>/g,'').slice(0,4000) }; });
  return rows
    .filter(r => topicIds.has(String(r[1])))
    .map(r => {
      const q = String(r[3]||'').trim();
      if (!q) return null;
      const tid = String(r[1]);
      const t = topicMap[tid];
      return { q, topicId: tid, topicTitle: t ? t.title : '', topicDesc: t ? t.desc : '' };
    })
    .filter(x => x);
}

function saveExamQuestions_(d) {
  if (!adminOk_(d.adminPassword)) return { ok: false, error: 'Неверный пароль' };
  if (!d.topicId) return { ok: false, error: 'topicId обязателен' };
  let qs = [];
  try { qs = Array.isArray(d.questions) ? d.questions : JSON.parse(String(d.questions || '[]')); }
  catch { return { ok: false, error: 'Некорректный JSON' }; }

  const sh = ensureSheet_(Л_ЭКЗАМЕН, ['Дата', 'ID темы', 'Название темы', 'Вопрос']);
  // Удаляем старые вопросы темы (снизу вверх чтобы не сбивать индексы)
  const last = sh.getLastRow();
  if (last >= 2) {
    const rows = sh.getRange(2, 1, last - 1, 2).getValues();
    for (let i = rows.length - 1; i >= 0; i--) {
      if (String(rows[i][1]) === String(d.topicId)) sh.deleteRow(i + 2);
    }
  }
  const now = new Date();
  const title = String(d.topicTitle || '');
  let saved = 0;
  qs.forEach(q => {
    const text = String(typeof q === 'string' ? q : (q.q || q.question || '')).trim();
    if (text) { sh.appendRow([now, String(d.topicId), title, text]); saved++; }
  });
  return { ok: true, saved };
}

/***** ИИ (Gemini) — работает без Node.js сервера *****/
// Задать ключ: Проект → Свойства скрипта → GEMINI_API_KEY
function callGemini_(systemPrompt, userPrompt, maxTokens, temp) {
  const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) throw new Error('GEMINI_API_KEY не задан. Добавьте в Свойства скрипта.');
  const fullPrompt = systemPrompt + '\n\n' + userPrompt;
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + encodeURIComponent(key);
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      contents: [{ parts: [{ text: fullPrompt }] }],
      generationConfig: { temperature: temp || 0.2, maxOutputTokens: maxTokens || 700 }
    }),
    muteHttpExceptions: true
  });
  const text = res.getContentText();
  if (res.getResponseCode() !== 200) throw new Error('Gemini: ' + text.slice(0, 200));
  const j = JSON.parse(text);
  const part = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts && j.candidates[0].content.parts[0];
  return String(part ? part.text : '').trim();
}

function aiChat_(d) {
  try {
    const sys = 'Ты — помощник для студентов педиатрии ТГМУ. Отвечай на русском, медицински точно.\n\nВАЖНО: Давай сразу суть — без вступлений. Запрещено: «Привет!», «Давай разберёмся», «Итак», «Хороший вопрос» и т.п.\nФормат: сразу по делу, 2–3 пунктами, без лишних слов.';
    const user = 'Тема: ' + (d.topicTitle || '') + '\n\nКонтекст:\n' + (d.topicDesc || '') + '\n\n---\nВопрос: ' + (d.question || '');
    const maxTok = d.channel === 'cards' ? 2000 : 700;
    const answer = callGemini_(sys, user, maxTok, 0.2);
    return { answer: answer };
  } catch (e) {
    return { error: String(e.message) };
  }
}

function aiGrade_(d) {
  try {
    const answers = d.answers || [];
    const hasPerTopic = answers.some(function(a) { return a.topicTitle; });
    const qtext = hasPerTopic
      ? answers.map(function(a, i) { return 'Вопрос ' + (i+1) + ' (тема: ' + (a.topicTitle || '—') + '): ' + a.question + '\nОтвет студента: ' + (a.answer || '(не ответил)'); }).join('\n\n')
      : answers.map(function(a, i) { return 'Вопрос ' + (i+1) + ': ' + a.question + '\nОтвет студента: ' + (a.answer || '(не ответил)'); }).join('\n\n');
    const topicCtx = hasPerTopic
      ? 'Вопросы из разных тем курса. Оцени каждый ответ по контексту своей темы.'
      : 'Тема: ' + (d.topicTitle || '') + '\n\nКонтекст:\n' + (String(d.topicDesc || '').slice(0, 4000));
    const sys = 'Ты — строгий экзаменатор педиатрии. Оцени ответы как на реальном экзамене у будущих врачей. Будь максимально требовательным.\n\nКритерии оценок:\n- 5: Полный, точный ответ. Медицинская терминология, структура, все ключевые пункты. Без ошибок.\n- 4: В целом верно, но есть неточности или незначительные пропуски.\n- 3: Частичный ответ, пропущены важные аспекты, нет структуры.\n- 2: Поверхностно, общие фразы, много ошибок или неверная трактовка.\n- 1: Не ответил по существу, неверно, не по теме.\n\nНе завывай оценки. Неполный ответ — максимум 3. «Думаю», «наверное», общие фразы без конкретики — 2 или ниже. Отсутствие ответа — 1.\n\nДля каждого вопроса: оценка 1–5 и краткий, конкретный комментарий на русском (что упущено, что неверно).\nВерни ТОЛЬКО JSON: [{"grade":N,"comment":"..."}]. Количество элементов = количеству вопросов.';
    const raw = callGemini_(sys, topicCtx + '\n\n' + qtext, 1500, 0.2);
    var grades = [];
    var m = raw.match(/\[[\s\S]*\]/);
    if (m) { try { grades = JSON.parse(m[0]); } catch (e2) {} }
    var avg = grades.length ? parseFloat((grades.reduce(function(s, g) { return s + (Number(g.grade) || 0); }, 0) / grades.length).toFixed(1)) : 0;
    return { ok: true, grades: grades, avgGrade: avg };
  } catch (e) {
    return { ok: false, error: String(e.message) };
  }
}

function parseFormBody_(str) {
  const out = {};
  if (!str) return out;
  const dec = s => { try { return decodeURIComponent(String(s || '').replace(/\+/g, ' ')); } catch { return String(s || ''); } };
  str.split('&').forEach(pair => {
    const idx = pair.indexOf('=');
    const k = dec(idx >= 0 ? pair.slice(0, idx) : pair);
    const v = dec(idx >= 0 ? pair.slice(idx + 1) : '');
    if (k) out[k] = v;
  });
  return out;
}

/***** РЕЗУЛЬТАТЫ ЭКЗАМЕНА *****/
// Структура листа "Результаты_экзамена":
// Дата | Уникальный ID | Курс | Факультет | Вопрос1 | Ответ1 | Оценка1 | Вопрос2 | Ответ2 | Оценка2 | ... | Средняя оценка
function saveExamResult_(d) {
  if (!d.studentId) return { ok: false, error: 'studentId обязателен' };
  const answers = d.answers || [];
  const grades  = d.grades  || [];
  if (!answers.length) return { ok: false, error: 'answers пусты' };

  // Формируем заголовки динамически под максимальное кол-во вопросов (обычно 4)
  const maxQ = answers.length;
  const headers = ['Дата', 'Уникальный ID', 'Курс', 'Факультет'];
  for (let i = 1; i <= maxQ; i++) {
    headers.push('Вопрос' + i, 'Ответ' + i, 'Оценка' + i, 'Комментарий' + i);
  }
  headers.push('Средняя оценка');

  const sh = ensureSheet_(Л_РЕЗ_ЭКЗАМЕН, headers);

  // Если лист уже существовал — убедимся что заголовков хватает
  const curCols = sh.getLastColumn();
  if (curCols < headers.length) {
    sh.getRange(1, curCols + 1, 1, headers.length - curCols)
      .setValues([headers.slice(curCols)]);
  }

  const row = [
    new Date(),
    String(d.studentId),
    String(d.course   || ''),
    String(d.faculty  || '')
  ];
  answers.forEach(function(a, i) {
    const g = grades[i] || {};
    row.push(
      String(a.question || '').slice(0, 2000),
      String(a.answer   || '').slice(0, 2000),
      Number(g.grade)  || 0,
      String(g.comment || '').slice(0, 1000)
    );
  });
  row.push(Number(d.avgGrade) || 0);

  sh.appendRow(row);
  return { ok: true };
}

/***** ВСПОМОГАТЕЛЬНЫЕ *****/
function ensureSheet_(name, headers) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function out_(obj) {
  const o = ContentService.createTextOutput(JSON.stringify(obj));
  o.setMimeType(ContentService.MimeType.JSON);
  return o;
}
