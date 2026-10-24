import { useMemo, useState } from 'react';
import { myShare } from '../lib/balances.js';
import { categoryOf } from '../lib/categories.js';
import { formatMoney } from '../lib/money.js';
import { go } from '../lib/router.js';
import { Empty } from './ui.jsx';
import { shareGroup } from './GroupPage.jsx';

const monthLabel = (iso) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
const dayLabel = (iso) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export default function ExpensesTab({ group, members, txs, me }) {
  const [q, setQ] = useState('');
  const name = (id) => (id === me ? 'You' : members.find((m) => m.id === id)?.name || 'Someone');

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return txs;
    return txs.filter((t) => `${t.description} ${t.notes} ${categoryOf(t.category).label}`.toLowerCase().includes(s));
  }, [txs, q]);

  const months = useMemo(() => {
    const out = [];
    for (const t of filtered) {
      const key = t.date.slice(0, 7);
      if (!out.length || out.at(-1).key !== key) out.push({ key, label: monthLabel(t.date), items: [] });
      out.at(-1).items.push(t);
    }
    return out;
  }, [filtered]);

  if (!txs.length) {
    const alone = members.length < 2;
    return (
      <Empty emoji="🧾" title={alone ? 'Invite your friends' : 'No expenses yet'}>
        <p>{alone ? 'Send the group link so friends can join from their own phones.' : 'Add the first shared cost and everyone’s balance updates instantly.'}</p>
        {alone
          ? <button className="btn primary" onClick={() => shareGroup(group)}>Share invite link</button>
          : <button className="btn primary" onClick={() => go(`g/${group.id}/add`)}>Add an expense</button>}
      </Empty>
    );
  }

  return (
    <div>
      {txs.length > 6 && (
        <input className="search" type="search" placeholder="Search expenses" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search expenses" />
      )}
      {months.map((m) => (
        <section key={m.key} className="month">
          <h2 className="month-label">{m.label}</h2>
          <ul className="tx-list">
            {m.items.map((t) => {
              const cat = categoryOf(t.category);
              const share = myShare(t, me);
              const payers = Object.keys(t.paid_by);
              const foreign = t.currency !== group.currency;
              let right;
              if (t.kind === 'payment') {
                right = <span className="tx-right muted">{formatMoney(t.amount, t.currency)}</span>;
              } else if (share.net > 0.004) {
                right = <span className="tx-right pos"><small>you lent</small>{formatMoney(share.net, group.currency)}</span>;
              } else if (share.net < -0.004) {
                right = <span className="tx-right neg"><small>you borrowed</small>{formatMoney(-share.net, group.currency)}</span>;
              } else {
                right = <span className="tx-right muted"><small>{share.owed ? 'you paid your share' : 'not involved'}</small></span>;
              }
              return (
                <li key={t.id}>
                  <button className={`tx ${t.kind}`} onClick={() => go(`g/${group.id}/tx/${t.id}`)}>
                    <span className="tx-date">{dayLabel(t.date)}</span>
                    <span className="tx-cat" aria-hidden="true">{cat.emoji}</span>
                    <span className="tx-main">
                      <strong>{t.kind === 'payment' ? `${name(payers[0])} paid ${Object.keys(t.split)[0] === me ? 'you' : name(Object.keys(t.split)[0])}` : t.description || cat.label}</strong>
                      <span className="muted">
                        {t.kind === 'payment'
                          ? 'Payment'
                          : `${payers.length > 1 ? `${payers.length} people` : name(payers[0])} paid ${formatMoney(t.amount, t.currency)}${foreign ? ` (${formatMoney(t.amount * t.fx_rate, group.currency)})` : ''}`}
                      </span>
                    </span>
                    {right}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {filtered.length === 0 && <p className="muted center">No expenses match “{q}”.</p>}
    </div>
  );
}
