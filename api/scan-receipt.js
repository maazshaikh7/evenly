// Vercel serverless function: reads a receipt photo with Claude and returns line items.
// Your ANTHROPIC_API_KEY stays on the server. Only signed-in app users can call it.

const PROMPT = `Read this receipt and return ONLY a JSON object, no other text, in this shape:
{
  "merchant": string or null,
  "date": "YYYY-MM-DD" or null,
  "currency": ISO 4217 code like "GBP" or null,
  "category": one of "food","groceries","transport","travel","stay","bills","fun","shopping","health","gifts","other",
  "items": [{ "name": string, "price": number }],
  "tax": number or null,
  "tip": number or null,
  "total": number or null
}
Rules: "price" is the line total (quantity × unit price). Discounts are items with negative prices.
Put service charge or VAT in "tax" only if it is added on top of the item prices, not if it is already included.
Keep item names short and readable.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  const supaUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supaKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!process.env.ANTHROPIC_API_KEY) return res.status(501).json({ error: 'Receipt scanning is off: ANTHROPIC_API_KEY isn’t set on the server.' });

  // Check the caller is a signed-in app user so strangers can’t spend your API credit.
  const auth = req.headers.authorization || '';
  const who = await fetch(`${supaUrl}/auth/v1/user`, { headers: { Authorization: auth, apikey: supaKey } });
  if (!who.ok) return res.status(401).json({ error: 'Not signed in' });

  const { image, mediaType = 'image/jpeg' } = req.body || {};
  if (!image || typeof image !== 'string') return res.status(400).json({ error: 'No image received' });
  if (image.length > 6_000_000) return res.status(413).json({ error: 'Image too large' });

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
            { type: 'text', text: PROMPT },
          ],
        }],
      }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: data?.error?.message || 'The receipt reader failed' });

    const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    const parsed = JSON.parse(json);
    const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
    return res.status(200).json({
      merchant: parsed.merchant || null,
      date: parsed.date || null,
      currency: typeof parsed.currency === 'string' ? parsed.currency.toUpperCase() : null,
      category: parsed.category || null,
      items: (parsed.items || []).filter((i) => num(i.price) !== null).map((i) => ({ name: String(i.name || '').slice(0, 80), price: num(i.price) })),
      tax: num(parsed.tax),
      tip: num(parsed.tip),
      total: num(parsed.total),
    });
  } catch {
    return res.status(502).json({ error: 'Couldn’t read that receipt. Try a sharper, flatter photo.' });
  }
}
