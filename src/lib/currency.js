// Rates from the European Central Bank via frankfurter.app (free, no key).
export const CURRENCIES = [
  'GBP', 'EUR', 'USD', 'INR', 'AUD', 'CAD', 'CHF', 'JPY', 'CNY', 'HKD', 'SGD', 'NZD',
  'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'ISK', 'TRY', 'ILS', 'ZAR',
  'BRL', 'MXN', 'KRW', 'THB', 'MYR', 'IDR', 'PHP',
];

const cache = new Map();

export async function fetchRate(from, to, dateISO) {
  if (from === to) return 1;
  const today = new Date().toISOString().slice(0, 10);
  const when = dateISO && dateISO < today ? dateISO : 'latest';
  const key = `${from}-${to}-${when}`;
  if (cache.has(key)) return cache.get(key);
  const res = await fetch(`https://api.frankfurter.app/${when}?from=${from}&to=${to}`);
  if (!res.ok) throw new Error('Rate unavailable');
  const json = await res.json();
  const rate = json?.rates?.[to];
  if (!rate) throw new Error('Rate unavailable');
  cache.set(key, rate);
  return rate;
}
