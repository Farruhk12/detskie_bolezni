/** Vercel Serverless — прокси сохранения результатов экзамена в GAS */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const gasUrl = process.env.GAS_API;
  if (!gasUrl) return res.status(200).json({ ok: false, error: 'GAS_API не задан в Vercel' });

  try {
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    const r = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      redirect: 'follow'
    });
    const text = await r.text();
    res.status(200).json(JSON.parse(text));
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e.message) });
  }
}
