import { useMemo } from 'react';
import { groupStats } from '../lib/balances.js';
import { categoryOf } from '../lib/categories.js';
import { formatMoney } from '../lib/money.js';
import { Avatar, Empty } from './ui.jsx';

function Bars({ rows, currency }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="hbars">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="hbar-head">
            <span className="hbar-label">{r.icon}{r.label}</span>
            <span className="money">{formatMoney(r.value, currency)}</span>
          </div>
          <div className="hbar-track"><span style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

export default function StatsTab({ group, members, txs, me }) {
  const s = useMemo(() => groupStats(txs), [txs]);

  const timeline = useMemo(() => {
    const days = Object.keys(s.byDay).sort();
    if (!days.length) return [];
    const span = (new Date(days.at(-1)) - new Date(days[0])) / 86400000;
    const monthly = span > 45;
    const buckets = {};
    for (const d of days) {
      const k = monthly ? d.slice(0, 7) : d;
      buckets[k] = (buckets[k] || 0) + s.byDay[d];
    }
    return Object.entries(buckets).slice(-14).map(([k, v]) => ({
      key: k,
      value: v,
      label: monthly
        ? new Date(`${k}-15T12:00:00`).toLocaleDateString(undefined, { month: 'short' })
        : new Date(`${k}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
    }));
  }, [s]);

  if (!s.count) return <Empty emoji="📊" title="No spending yet"><p>Charts appear after the first expense.</p></Empty>;

  const tmax = Math.max(...timeline.map((t) => t.value));
  const catRows = Object.entries(s.byCategory).sort((a, b) => b[1] - a[1])
    .map(([id, v]) => { const c = categoryOf(id); return { key: id, label: c.label, icon: <span aria-hidden="true" className="hbar-icon">{c.emoji}</span>, value: v }; });
  const personRows = members.map((m) => ({
    key: m.id, label: m.id === me ? `${m.name} (you)` : m.name, icon: <Avatar member={m} size={22} />, value: s.consumed[m.id] || 0,
  })).filter((r) => r.value > 0).sort((a, b) => b.value - a.value);

  return (
    <div>
      <section className="stat-grid">
        <div className="stat"><span className="muted">Group total</span><strong>{formatMoney(s.total, group.currency)}</strong></div>
        <div className="stat"><span className="muted">Your share</span><strong>{formatMoney(s.consumed[me] || 0, group.currency)}</strong></div>
        <div className="stat"><span className="muted">You paid</span><strong>{formatMoney(s.paidBy[me] || 0, group.currency)}</strong></div>
        <div className="stat"><span className="muted">Expenses</span><strong>{s.count}</strong></div>
      </section>

      {timeline.length > 1 && (
        <section className="card">
          <h2 className="section-title">Spending over time</h2>
          <div className="vbars" role="img" aria-label="Spending over time">
            {timeline.map((t) => (
              <div key={t.key} className="vbar" title={`${t.label}: ${formatMoney(t.value, group.currency)}`}>
                <span style={{ height: `${Math.max(3, (t.value / tmax) * 100)}%` }} />
                <small>{t.label}</small>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <h2 className="section-title">By category</h2>
        <Bars rows={catRows} currency={group.currency} />
      </section>

      <section className="card">
        <h2 className="section-title">Each person’s share of spending</h2>
        <Bars rows={personRows} currency={group.currency} />
      </section>
    </div>
  );
}
