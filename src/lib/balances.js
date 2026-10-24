import { daysBetween, todayISO } from './money.js';

const EPS = 0.005;

/** Paid and owed maps for a transaction, converted to the group currency. */
export function baseMaps(tx) {
  const rate = Number(tx.fx_rate) || 1;
  const conv = (m) => Object.fromEntries(Object.entries(m || {}).map(([k, v]) => [k, Number(v) * rate]));
  return { paid: conv(tx.paid_by), owed: conv(tx.split) };
}

function deltas(tx) {
  const { paid, owed } = baseMaps(tx);
  const d = {};
  for (const [k, v] of Object.entries(paid)) d[k] = (d[k] || 0) + v;
  for (const [k, v] of Object.entries(owed)) d[k] = (d[k] || 0) - v;
  return d;
}

/** Positive = is owed money, negative = owes money. */
export function netBalances(txs, memberIds = []) {
  const net = Object.fromEntries(memberIds.map((id) => [id, 0]));
  for (const tx of txs) for (const [k, v] of Object.entries(deltas(tx))) net[k] = (net[k] || 0) + v;
  return net;
}

/** Fewest payments that settle everyone: greedy largest debtor → largest creditor. */
export function simplifyDebts(net) {
  const cred = [], debt = [];
  for (const [id, v] of Object.entries(net)) {
    const c = Math.round(v * 100);
    if (c > 0) cred.push({ id, c });
    else if (c < 0) debt.push({ id, c: -c });
  }
  cred.sort((a, b) => b.c - a.c);
  debt.sort((a, b) => b.c - a.c);
  const out = [];
  let i = 0, j = 0;
  while (i < debt.length && j < cred.length) {
    const x = Math.min(debt[i].c, cred[j].c);
    if (x > 0) out.push({ from: debt[i].id, to: cred[j].id, amount: x / 100 });
    debt[i].c -= x; cred[j].c -= x;
    if (!debt[i].c) i++;
    if (!cred[j].c) j++;
  }
  return out;
}

const byDate = (a, b) =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : String(a.created_at).localeCompare(String(b.created_at));

/**
 * How long each person's debt has gone unpaid.
 * Payments pay off the oldest debt first (first in, first out), so if you
 * owed for dinner 40 days ago and lunch 3 days ago and paid back the dinner,
 * the clock shows 3 days.
 * Returns { memberId: { debt: {since, days, amount} | null, credit: {...} | null } }
 */
export function debtAges(txs, today = todayISO()) {
  const state = {};
  const get = (id) => (state[id] ||= { debts: [], credits: [] });
  for (const tx of [...txs].sort(byDate)) {
    for (const [id, d] of Object.entries(deltas(tx))) {
      if (Math.abs(d) < EPS) continue;
      const s = get(id);
      const [consume, push] = d < 0 ? [s.credits, s.debts] : [s.debts, s.credits];
      let rest = Math.abs(d);
      while (rest > EPS && consume.length) {
        const head = consume[0];
        const x = Math.min(head.amt, rest);
        head.amt -= x; rest -= x;
        if (head.amt <= EPS) consume.shift();
      }
      if (rest > EPS) push.push({ amt: rest, date: tx.date });
    }
  }
  const summarize = (list) => {
    const amount = list.reduce((s, x) => s + x.amt, 0);
    return amount > EPS ? { since: list[0].date, days: daysBetween(list[0].date, today), amount } : null;
  };
  return Object.fromEntries(
    Object.entries(state).map(([id, s]) => [id, { debt: summarize(s.debts), credit: summarize(s.credits) }])
  );
}

/** How much a single transaction affects one person, in the group currency. */
export function myShare(tx, memberId) {
  const { paid, owed } = baseMaps(tx);
  return { paid: paid[memberId] || 0, owed: owed[memberId] || 0, net: (paid[memberId] || 0) - (owed[memberId] || 0) };
}

export function groupStats(txs) {
  const expenses = txs.filter((t) => t.kind === 'expense');
  const byCategory = {}, consumed = {}, paidBy = {}, byDay = {};
  let total = 0;
  for (const tx of expenses) {
    const { paid, owed } = baseMaps(tx);
    const amt = Number(tx.amount) * (Number(tx.fx_rate) || 1);
    total += amt;
    byCategory[tx.category] = (byCategory[tx.category] || 0) + amt;
    byDay[tx.date] = (byDay[tx.date] || 0) + amt;
    for (const [k, v] of Object.entries(owed)) consumed[k] = (consumed[k] || 0) + v;
    for (const [k, v] of Object.entries(paid)) paidBy[k] = (paidBy[k] || 0) + v;
  }
  return { total, count: expenses.length, byCategory, consumed, paidBy, byDay };
}
