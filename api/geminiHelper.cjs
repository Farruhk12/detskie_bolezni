/**
 * Запрос к Gemini с повторами при 429/503 и запасной моделью.
 */
async function callGeminiGenerate({
  apiKey,
  model,
  fullPrompt,
  maxTokens = 700,
  temp = 0.2,
  fallbackModel = process.env.GEMINI_FALLBACK_MODEL || 'gemini-2.5-flash',
}) {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: fullPrompt }] }],
    generationConfig: { temperature: temp, maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: 0 } },
  });

  async function tryModel(m) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(apiKey)}`;
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 2000 * attempt));
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
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

  try {
    return await tryModel(model);
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    if (model === fallbackModel || !fallbackModel) throw e;
    if (!/429|503/.test(msg)) throw e;
    return await tryModel(fallbackModel);
  }
}

module.exports = { callGeminiGenerate };
