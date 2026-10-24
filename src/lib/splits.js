import { allocate, toCents } from './money.js';

export const SPLIT_MODES = [
  { id: 'equal', label: 'Equal' },
  { id: 'exact', label: 'Amounts' },
  { id: 'percent', label: 'Percent' },
  { id: 'shares', label: 'Shares' },
  { id: 'itemized', label: 'Items' },
];

export const shareOf = (values, id) => {
  const v = values?.shares?.[id];
  return v === undefined ? 1 : Number(v) || 0;
};

export function itemizedTotalCents({ items = [], tax, tip }) {
  return items.reduce((s, it) => s + toCents(it.price), 0) + toCents(tax) + toCents(tip);
}

/**
 * Returns { ok, cents: {memberId: cents}, error }.
 * cents always sums to totalCents when ok.
 */
export function computeSplit(meta, totalCents, memberIds) {
  const { mode } = meta;
  const fail = (error) => ({ ok: false, cents: {}, error });
  if (totalCents <= 0 && mode !== 'itemized') return fail('Enter an amount.');

  if (mode === 'equal') {
    const ids = (meta.included || []).filter((id) => memberIds.includes(id));
    if (!ids.length) return fail('Pick at least one person to split with.');
    return { ok: true, cents: allocate(totalCents, Object.fromEntries(ids.map((id) => [id, 1]))) };
  }

  if (mode === 'exact') {
    const cents = {};
    memberIds.forEach((id) => { const c = toCents(meta.values?.exact?.[id]); if (c) cents[id] = c; });
    const sum = Object.values(cents).reduce((a, b) => a + b, 0);
    if (sum !== totalCents) {
      const diff = (totalCents - sum) / 100;
      return { ...fail(diff > 0 ? `${diff.toFixed(2)} still to assign.` : `${(-diff).toFixed(2)} over the total.`), cents };
    }
    return { ok: true, cents };
  }

  if (mode === 'percent') {
    const weights = {};
    memberIds.forEach((id) => { const p = parseFloat(meta.values?.percent?.[id]); if (p > 0) weights[id] = p; });
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 100) > 0.01) {
      return { ...fail(`Percentages add up to ${+sum.toFixed(2)}%, not 100%.`), cents: allocate(totalCents, weights) || {} };
    }
    return { ok: true, cents: allocate(totalCents, weights) };
  }

  if (mode === 'shares') {
    const weights = {};
    memberIds.forEach((id) => { const s = shareOf(meta.values, id); if (s > 0) weights[id] = s; });
    if (!Object.keys(weights).length) return fail('Give at least one person a share.');
    return { ok: true, cents: allocate(totalCents, weights) };
  }

  if (mode === 'itemized') {
    const items = meta.items || [];
    if (!items.length) return fail('Add at least one item.');
    const sub = {};
    for (const it of items) {
      const c = toCents(it.price);
      if (!c) continue;
      const people = (it.people || []).filter((id) => memberIds.includes(id));
      if (!people.length) return fail(`Choose who had “${it.name || 'an item'}”.`);
      const parts = allocate(c, Object.fromEntries(people.map((id) => [id, 1])));
      for (const [id, v] of Object.entries(parts)) sub[id] = (sub[id] || 0) + v;
    }
    const subtotal = Object.values(sub).reduce((a, b) => a + b, 0);
    if (subtotal <= 0) return fail('Item prices must add up to more than zero.');
    const extra = toCents(meta.tax) + toCents(meta.tip);
    const extraParts = extra ? allocate(extra, sub) || {} : {};
    const cents = { ...sub };
    for (const [id, v] of Object.entries(extraParts)) cents[id] = (cents[id] || 0) + v;
    return { ok: true, cents };
  }

  return fail('Unknown split type.');
}

export function computePayers({ payMode, payer, payValues }, totalCents, memberIds) {
  if (payMode !== 'multi') {
    if (!memberIds.includes(payer)) return { ok: false, cents: {}, error: 'Choose who paid.' };
    return { ok: true, cents: { [payer]: totalCents } };
  }
  const cents = {};
  memberIds.forEach((id) => { const c = toCents(payValues?.[id]); if (c) cents[id] = c; });
  const sum = Object.values(cents).reduce((a, b) => a + b, 0);
  if (sum !== totalCents) {
    const diff = (totalCents - sum) / 100;
    return { ok: false, cents, error: `Payments ${diff > 0 ? 'are short by' : 'exceed the total by'} ${Math.abs(diff).toFixed(2)}.` };
  }
  return { ok: true, cents };
}
