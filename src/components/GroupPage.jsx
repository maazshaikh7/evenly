import { useCallback, useEffect, useMemo, useState } from 'react';
import { addMember, joinGroup, loadGroup, logActivity, setMe, subscribeGroup } from '../lib/api.js';
import { netBalances } from '../lib/balances.js';
import { formatMoney } from '../lib/money.js';
import { go, groupLink } from '../lib/router.js';
import { toast } from '../lib/toast.js';
import { Avatar, Spinner, TopBar, balanceText } from './ui.jsx';
import ExpensesTab from './ExpensesTab.jsx';
import BalancesTab from './BalancesTab.jsx';
import StatsTab from './StatsTab.jsx';
import ActivityTab from './ActivityTab.jsx';
import ExpenseForm from './ExpenseForm.jsx';
import SettleForm from './SettleForm.jsx';
import Settings from './Settings.jsx';

const TABS = [
  { id: 'expenses', label: 'Expenses' },
  { id: 'balances', label: 'Balances' },
  { id: 'stats', label: 'Stats' },
  { id: 'activity', label: 'Activity' },
];

export async function shareGroup(group) {
  const url = groupLink(group.id);
  if (navigator.share) {
    try { await navigator.share({ title: group.name, text: `Join “${group.name}” on Evenly`, url }); return; } catch { /* cancelled */ }
  }
  try { await navigator.clipboard.writeText(url); toast('Link copied. Send it to your friends.'); }
  catch { window.prompt('Copy this link', url); }
}

export default function GroupPage({ groupId, sub, query }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('expenses');
  const [activityTick, setActivityTick] = useState(0);

  const reload = useCallback(async () => {
    try { setData(await loadGroup(groupId)); setActivityTick((t) => t + 1); }
    catch (e) { setError(e.message); }
  }, [groupId]);

  useEffect(() => {
    let off = () => {};
    (async () => {
      try {
        const ok = await joinGroup(groupId);
        if (!ok) { setError('notfound'); return; }
        await reload();
        off = subscribeGroup(groupId, reload);
      } catch (e) { setError(e.message); }
    })();
    return () => off();
  }, [groupId, reload]);

  const memberIds = useMemo(() => data?.members.map((m) => m.id) || [], [data]);
  const net = useMemo(() => (data ? netBalances(data.txs, memberIds) : {}), [data, memberIds]);

  if (error === 'notfound') {
    return <div className="center-screen pad"><div className="notice"><h2>Group not found</h2><p>This link doesn’t match any group. Ask your friend to send it again.</p><button className="btn" onClick={() => go('')}>Go to my groups</button></div></div>;
  }
  if (error) return <div className="center-screen pad"><div className="notice"><h2>Something went wrong</h2><p>{error}</p><button className="btn" onClick={() => location.reload()}>Try again</button></div></div>;
  if (!data) return <Spinner />;

  const { group, members, txs, me } = data;
  const ctx = { group, members, txs, me, net, reload };

  if (!me) return <WhoAmI group={group} members={members} onPicked={reload} />;

  const back = () => go(`g/${groupId}`);
  if (sub[0] === 'add') return <ExpenseForm {...ctx} onDone={back} />;
  if (sub[0] === 'tx') {
    const tx = txs.find((t) => t.id === sub[1]);
    if (!tx) return <Spinner />;
    return tx.kind === 'payment' ? <SettleForm {...ctx} tx={tx} onDone={back} /> : <ExpenseForm {...ctx} tx={tx} onDone={back} />;
  }
  if (sub[0] === 'settle') {
    return <SettleForm {...ctx} onDone={back}
      initial={{ from: query.get('from'), to: query.get('to'), amount: query.get('amount') }} />;
  }
  if (sub[0] === 'settings') return <Settings {...ctx} onDone={back} />;

  const myNet = net[me] || 0;
  const mine = balanceText(myNet, group.currency);
  const meMember = members.find((m) => m.id === me);

  return (
    <div className="page group-page">
      <TopBar
        left={<button className="icon-btn" onClick={() => go('')} aria-label="All groups">‹</button>}
        title={<span className="group-title"><span aria-hidden="true">{group.emoji}</span> {group.name}</span>}
        right={<>
          <button className="icon-btn" onClick={() => shareGroup(group)} aria-label="Share invite link">⤴</button>
          <button className="icon-btn" onClick={() => go(`g/${groupId}/settings`)} aria-label="Group settings">⚙</button>
        </>}
      />

      <section className={`hero ${mine.tone}`}>
        <Avatar member={meMember} size={44} />
        <div className="hero-text">
          <p className="hero-label">{myNet > 0.004 ? 'You’re owed' : myNet < -0.004 ? 'You owe' : 'You’re all square'}</p>
          <p className="hero-amount">{formatMoney(Math.abs(myNet), group.currency)}</p>
        </div>
        {myNet < -0.004 && (
          <button className="btn small" onClick={() => setTab('balances')}>Settle up</button>
        )}
      </section>

      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </nav>

      <div className="tab-body">
        {tab === 'expenses' && <ExpensesTab {...ctx} />}
        {tab === 'balances' && <BalancesTab {...ctx} />}
        {tab === 'stats' && <StatsTab {...ctx} />}
        {tab === 'activity' && <ActivityTab {...ctx} tick={activityTick} />}
      </div>

      <button className="fab" onClick={() => go(`g/${groupId}/add`)}>
        <span aria-hidden="true">＋</span> Add expense
      </button>
    </div>
  );
}

function WhoAmI({ group, members, onPicked }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const pick = async (id) => {
    setBusy(true);
    try { await setMe(group.id, id); await onPicked(); }
    catch (e) { toast(e.message, 'error'); setBusy(false); }
  };

  const addSelf = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const m = await addMember(group.id, name.trim());
      await logActivity(group.id, m.id, 'joined', 'joined the group');
      await pick(m.id);
    } catch (err) { toast(err.message, 'error'); setBusy(false); }
  };

  return (
    <div className="page">
      <div className="whoami">
        <div className="group-emoji big" aria-hidden="true">{group.emoji}</div>
        <h1>{group.name}</h1>
        <p className="muted">Which one is you? This is remembered on this phone.</p>
        <ul className="pick-list">
          {members.map((m) => (
            <li key={m.id}>
              <button className="person-btn" disabled={busy} onClick={() => pick(m.id)}>
                <Avatar member={m} /> <span>{m.name}</span>
              </button>
            </li>
          ))}
        </ul>
        <form className="field" onSubmit={addSelf}>
          <label htmlFor="newme">Not on the list?</label>
          <div className="row">
            <input id="newme" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={40} />
            <button className="btn primary" disabled={busy || !name.trim()}>Join</button>
          </div>
        </form>
      </div>
    </div>
  );
}
