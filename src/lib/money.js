export const toCents = (v) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

export const fromCents = (c) => Math.round(c) / 100;

/** Split totalCents across ids in proportion to weights, so the parts add up exactly. */
export function allocate(totalCents, weights) {
  if (totalCents < 0) {
    const pos = allocate(-totalCents, weights);
    return pos && Object.fromEntries(Object.entries(pos).map(([k, v]) => [k, -v]));
  }
  const ids = Object.keys(weights).filter((id) => weights[id] > 0);
  const sum = ids.reduce((s, id) => s + weights[id], 0);
  if (!ids.length || sum <= 0) return null;
  const parts = ids.map((id) => {
    const exact = (totalCents * weights[id]) / sum;
    return { id, exact, cents: Math.floor(exact) };
  });
  let rest = totalCents - parts.reduce((s, p) => s + p.cents, 0);
  [...parts]
    .sort((a, b) => b.exact - b.cents - (a.exact - a.cents))
    .forEach((p) => { if (rest > 0) { p.cents += 1; rest -= 1; } });
  return Object.fromEntries(parts.map((p) => [p.id, p.cents]));
}

export function formatMoney(amount, currency = 'GBP', opts = {}) {
  const n = Number(amount) || 0;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      signDisplay: opts.signed ? 'exceptZero' : 'auto',
      maximumFractionDigits: 2,
      minimumFractionDigits: opts.compact && Number.isInteger(n) ? 0 : 2,
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function daysBetween(fromISO, toISO) {
  const [a, b] = [fromISO, toISO].map((s) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  });
  return Math.max(0, Math.round((b - a) / 86400000));
}

export const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
