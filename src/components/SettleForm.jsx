import { useState } from 'react';
import { deleteTx, logActivity, saveTx } from '../lib/api.js';
import { CURRENCIES, fetchRate } from '../lib/currency.js';
import { formatMoney, fromCents, toCents, todayISO } from '../lib/money.js';
import { toast } from '../lib/toast.js';
import { Avatar, TopBar } from './ui.jsx';

export default function SettleForm({ group, members, me, net, tx, initial = {}, onDone }) {
  const valid = (id) => members.some((m) => m.id === id);
  const [from, setFrom] = useState(tx ? Object.keys(tx.paid_by)[0] : valid(initial.from) ? initial.from : me);
  const [to, setTo] = useState(tx ? Object.keys(tx.split)[0] : valid(initial.to) ? initial.to : members.find((m) => m.id !== me)?.id);
  const [amount, setAmount] = useState(tx ? String(tx.amount) : initial.amount || '');
  const [currency, setCurrency] = useState(tx?.currency || group.currency);
  const [rate, setRate] = useState(tx ? String(Number(tx.fx_rate)) : '1');
  const [date, setDate] = useState(tx?.date || todayISO());
  const [notes, setNotes] = useState(tx?.notes || '');
  const [busy, setBusy] = useState(false);

  const byId = Object.fromEntries(members.map((m) => [m.id, m]));
  const label = (id) => (id === me ? 'You' : byId[id]?.name || 'Someone');
  const cents = toCents(amount);
  const rateNum = parseFloat(rate) || 0;
  const foreign = currency !== group.currency;
  const ok = from && to && from !== to && cents > 0 && rateNum > 0;
  const payLink = byId[to]?.pay_link;

  const changeCurrency = async (c) => {
    setCurrency(c);
    if (c === group.currency) { setRate('1'); return; }
    try { setRate(String(+(await fetchRate(c, group.currency, date)).toFixed(6))); } catch { setRate(''); }
  };

  const save = async () => {
    if (!ok) return;
    setBusy(true);
    const amt = fromCents(cents);
    try {
      await saveTx({
        ...(tx ? { id: tx.id } : { group_id: group.id, created_by: me }),
        kind: 'payment', description: 'Payment', category: 'payment',
        amount: amt, currency, fx_rate: foreign ? rateNum : 1, date,
        paid_by: { [from]: amt }, split: { [to]: amt }, split_meta: {}, notes: notes.trim(),
      });
      await logActivity(group.id, me, 'settled', `recorded ${byId[from]?.name} paying ${byId[to]?.name} ${formatMoney(amt, currency)}`);
      toast('Payment recorded');
      onDone();
    } catch (e) { toast(e.message, 'error'); setBusy(false); }
  };

  const remove = async () => {
    if (!window.confirm('Delete this payment? Balances will update for everyone.')) return;
    setBusy(true);
    try {
      await deleteTx(tx.id);
      await logActivity(group.id, me, 'deleted', `deleted a payment of ${formatMoney(tx.amount, tx.currency)}`);
      onDone();
    } catch (e) { toast(e.message, 'error'); setBusy(false); }
  };

  const PersonPick = ({ value, onChange, exclude, legend }) => (
    <fieldset className="field">
      <legend className="label">{legend}</legend>
      <div className="chip-row">
        {members.filter((m) => m.id !== exclude).map((m) => (
          <button type="button" key={m.id} className={`person-chip ${value === m.id ? 'on' : ''}`} onClick={() => onChange(m.id)} aria-pressed={value === m.id}>
            <Avatar member={m} size={24} />{label(m.id)}
          </button>
        ))}
      </div>
    </fieldset>
  );

  return (
    <div className="page form-page">
      <TopBar
        left={<button className="text-btn" onClick={onDone}>Cancel</button>}
        title={tx ? 'Edit payment' : 'Record payment'}
        right={<button className="text-btn strong" onClick={save} disabled={!ok || busy}>Save</button>}
      />
      <div className="form">
        <div className="settle-visual">
          <div><Avatar member={byId[from]} size={56} /><span>{label(from)}</span></div>
          <span className="settle-arrow" aria-hidden="true">→</span>
          <div><Avatar member={byId[to]} size={56} /><span>{label(to)}</span></div>
        </div>

        <div className="amount-row">
          <select className="cur-select" value={currency} onChange={(e) => changeCurrency(e.target.value)} aria-label="Currency">
            {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <input className="amount-input" inputMode="decimal" placeholder="0.00" value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))} aria-label="Amount" />
        </div>
        {foreign && (
          <div className="fx">
            <label htmlFor="srate">1 {currency} =</label>
            <input id="srate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
            <span>{group.currency}</span>
          </div>
        )}

        <PersonPick legend="Who paid" value={from} onChange={setFrom} exclude={to} />
        <PersonPick legend="Who received it" value={to} onChange={setTo} exclude={from} />

        {from && to && (
          <p className="hint">
            Before this, {label(from)} {(net[from] || 0) < 0 ? `owed ${formatMoney(-(net[from] || 0), group.currency)}` : 'didn’t owe anything'} overall.
          </p>
        )}

        {payLink && !tx && from === me && (
          <a className="btn block" href={payLink.startsWith('http') ? payLink : `https://${payLink}`} target="_blank" rel="noreferrer">
            Open {byId[to]?.name}’s payment link
          </a>
        )}

        <div className="field">
          <label htmlFor="sdate">Date</label>
          <input id="sdate" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="snotes">Notes</label>
          <textarea id="snotes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Bank transfer, cash, Revolut…" />
        </div>

        <button className="btn primary big block" onClick={save} disabled={!ok || busy}>{busy ? 'Saving…' : 'Record payment'}</button>
        {tx && <button className="btn danger block" onClick={remove} disabled={busy}>Delete payment</button>}
      </div>
    </div>
  );
}
