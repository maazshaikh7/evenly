import { useMemo } from 'react';
import { debtAges, simplifyDebts } from '../lib/balances.js';
import { formatMoney } from '../lib/money.js';
import { go } from '../lib/router.js';
import { Avatar, Empty } from './ui.jsx';

const ageTone = (days) => (days >= 30 ? 'old' : days >= 7 ? 'aging' : 'fresh');
const ageText = (days) => (days === 0 ? 'Owing since today' : days === 1 ? '1 day unpaid' : `${days} days unpaid`);

export default function BalancesTab({ group, members, txs, me, net }) {
  const plan = useMemo(() => simplifyDebts(net), [net]);
  const ages = useMemo(() => debtAges(txs), [txs]);
  const max = Math.max(1, ...Object.values(net).map(Math.abs));
  const byId = Object.fromEntries(members.map((m) => [m.id, m]));
  const label = (id) => (id === me ? 'You' : byId[id]?.name || 'Someone');
  const sorted = [...members].sort((a, b) => (net[b.id] || 0) - (net[a.id] || 0));

  return (
    <div>
      <section className="card">
        <h2 className="section-title">Who’s up, who’s down</h2>
        <ul className="seesaw">
          {sorted.map((m) => {
            const v = net[m.id] || 0;
            const pct = (Math.abs(v) / max) * 50;
            const age = v < -0.004 ? ages[m.id]?.debt : null;
            return (
              <li key={m.id} className={m.id === me ? 'me' : ''}>
                <div className="seesaw-who">
                  <Avatar member={m} size={28} />
                  <span>{m.id === me ? `${m.name} (you)` : m.name}</span>
                </div>
                <div className="seesaw-track" aria-hidden="true">
                  <span className={`seesaw-bar ${v >= 0 ? 'pos' : 'neg'}`}
                    style={v >= 0 ? { left: '50%', width: `${pct}%` } : { right: '50%', width: `${pct}%` }} />
                </div>
                <div className={`seesaw-amt ${v > 0.004 ? 'pos' : v < -0.004 ? 'neg' : 'muted'}`}>
                  {Math.abs(v) < 0.005 ? 'settled' : formatMoney(v, group.currency, { signed: true })}
                  {age && <span className={`age ${ageTone(age.days)}`}>{age.days}d</span>}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card">
        <h2 className="section-title">Fewest payments to settle up</h2>
        {plan.length === 0 ? (
          <Empty emoji="🤝" title="Everyone’s square">
            <p>No one owes anything right now.</p>
          </Empty>
        ) : (
          <ul className="plan">
            {plan.map((p) => {
              const age = ages[p.from]?.debt;
              const involved = p.from === me || p.to === me;
              return (
                <li key={`${p.from}-${p.to}`} className={involved ? 'involved' : ''}>
                  <div className="plan-people">
                    <Avatar member={byId[p.from]} size={32} />
                    <div>
                      <p><strong>{label(p.from)}</strong> {p.from === me ? 'pay' : 'pays'} <strong>{p.to === me ? 'you' : label(p.to)}</strong></p>
                      {age && <p className={`age-line ${ageTone(age.days)}`}>{ageText(age.days)}</p>}
                    </div>
                  </div>
                  <div className="plan-right">
                    <span className="money">{formatMoney(p.amount, group.currency)}</span>
                    <button className="btn small" onClick={() => go(`g/${group.id}/settle?from=${p.from}&to=${p.to}&amount=${p.amount.toFixed(2)}`)}>
                      Settle
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="hint">Debts are combined so the group needs as few transfers as possible. The day count starts from the oldest expense still unpaid.</p>
      </section>

      <button className="btn block" onClick={() => go(`g/${group.id}/settle`)}>Record a different payment</button>
    </div>
  );
}
