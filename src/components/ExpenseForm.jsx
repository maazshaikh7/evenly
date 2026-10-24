import { useEffect, useMemo, useRef, useState } from 'react';
import { addMember, deleteTx, logActivity, saveTx } from '../lib/api.js';
import { CATEGORIES } from '../lib/categories.js';
import { CURRENCIES, fetchRate } from '../lib/currency.js';
import { formatMoney, fromCents, toCents, todayISO, uid } from '../lib/money.js';
import { SPLIT_MODES, computePayers, computeSplit, itemizedTotalCents, shareOf } from '../lib/splits.js';
import { accessToken } from '../lib/supabase.js';
import { toast } from '../lib/toast.js';
import { Avatar, Segmented, TopBar } from './ui.jsx';

const centsMapToAmounts = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, fromCents(v)]));

async function imageToBase64(file, maxSide = 1600) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
}

export default function ExpenseForm({ group, members, me, tx, onDone }) {
  const meta = tx?.split_meta || {};
  const [people, setPeople] = useState(members);
  useEffect(() => {
    // Keep people added inline, and pick up members others add while the form is open.
    setPeople((p) => [...members, ...p.filter((x) => !members.some((m) => m.id === x.id))]);
  }, [members]);
  const ids = people.map((m) => m.id);

  const [description, setDescription] = useState(tx?.description || '');
  const [amount, setAmount] = useState(tx ? String(tx.amount) : '');
  const [currency, setCurrency] = useState(tx?.currency || group.currency);
  const [rate, setRate] = useState(tx ? String(Number(tx.fx_rate)) : '1');
  const [rateState, setRateState] = useState(tx ? 'saved' : 'idle');
  const [date, setDate] = useState(tx?.date || todayISO());
  const [category, setCategory] = useState(tx?.category || 'food');
  const [notes, setNotes] = useState(tx?.notes || '');
  const [payMode, setPayMode] = useState(meta.payMode || 'single');
  const [payer, setPayer] = useState(meta.payer || Object.keys(tx?.paid_by || {})[0] || me);
  const [payValues, setPayValues] = useState(meta.payValues || {});
  const [mode, setMode] = useState(meta.mode || 'equal');
  const [included, setIncluded] = useState(meta.included || members.map((m) => m.id));
  const [values, setValues] = useState(meta.values || { exact: {}, percent: {}, shares: {} });
  const [items, setItems] = useState(meta.items || []);
  const [tax, setTax] = useState(meta.tax || '');
  const [tip, setTip] = useState(meta.tip || '');
  const [newPerson, setNewPerson] = useState('');
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const fileRef = useRef(null);

  const foreign = currency !== group.currency;

  // Exchange rate: fetched for the expense date; the user can always type their own.
  const rateReq = useRef(0);
  const loadRate = (cur, d) => {
    const n = ++rateReq.current;
    if (cur === group.currency) { setRate('1'); setRateState('idle'); return; }
    setRateState('loading');
    fetchRate(cur, group.currency, d)
      .then((r) => { if (n === rateReq.current) { setRate(String(+r.toFixed(6))); setRateState('auto'); } })
      .catch(() => { if (n === rateReq.current) setRateState('error'); });
  };
  const changeCurrency = (cur) => { setCurrency(cur); loadRate(cur, date); };
  const changeDate = (d) => { setDate(d); if (!['manual', 'saved'].includes(rateState)) loadRate(currency, d); };

  const splitMeta = { mode, included, values, items, tax, tip };
  const totalCents = mode === 'itemized' ? itemizedTotalCents(splitMeta) : toCents(amount);
  const split = useMemo(() => computeSplit(splitMeta, totalCents, ids), [JSON.stringify(splitMeta), totalCents, ids.join()]); // eslint-disable-line
  const pay = computePayers({ payMode, payer, payValues }, totalCents, ids);
  const rateNum = parseFloat(String(rate).replace(',', '.'));
  const errors = [
    totalCents <= 0 && 'Enter an amount above zero.',
    !split.ok && split.error,
    !pay.ok && pay.error,
    foreign && !(rateNum > 0) && 'Enter the exchange rate.',
  ].filter(Boolean);

  const setVal = (kind, id, v) => setValues((s) => ({ ...s, [kind]: { ...(s[kind] || {}), [id]: v } }));
  const toggleIncluded = (id) => setIncluded((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));

  const addPerson = async () => {
    const n = newPerson.trim();
    if (!n) return;
    try {
      const m = await addMember(group.id, n);
      await logActivity(group.id, me, 'member_added', `added ${n} to the group`);
      setPeople((p) => [...p, m]);
      setIncluded((xs) => [...xs, m.id]);
      setNewPerson('');
    } catch (e) { toast(e.message, 'error'); }
  };

  const evenPercents = () => {
    const who = ids.filter((id) => included.includes(id));
    const each = +(100 / who.length).toFixed(2);
    const map = Object.fromEntries(ids.map((id) => [id, '']));
    who.forEach((id, i) => { map[id] = String(i === who.length - 1 ? +(100 - each * (who.length - 1)).toFixed(2) : each); });
    setValues((s) => ({ ...s, percent: map }));
  };

  const fillRemaining = (id) => {
    const others = ids.filter((x) => x !== id).reduce((s, x) => s + toCents(values.exact?.[x]), 0);
    setVal('exact', id, String(fromCents(Math.max(0, totalCents - others))));
  };

  const updateItem = (id, patch) => setItems((xs) => xs.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const addItem = () => setItems((xs) => [...xs, { id: uid(), name: '', price: '', people: [...included] }]);

  const scanReceipt = async (file) => {
    if (!file) return;
    setScanning(true);
    try {
      const image = await imageToBase64(file);
      const token = await accessToken();
      const res = await fetch('/api/scan-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ image, mediaType: 'image/jpeg' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Receipt scanning isn’t set up on this server.');
      const everyone = [...included];
      if (data.merchant && !description) setDescription(data.merchant);
      const scanDate = data.date && /^\d{4}-\d{2}-\d{2}$/.test(data.date) && data.date <= todayISO() ? data.date : date;
      setDate(scanDate);
      const scanCur = data.currency && CURRENCIES.includes(data.currency) ? data.currency : currency;
      setCurrency(scanCur);
      loadRate(scanCur, scanDate);
      if (data.category && CATEGORIES.some((c) => c.id === data.category)) setCategory(data.category);
      const scanned = (data.items || []).map((it) => ({ id: uid(), name: it.name || '', price: String(it.price ?? ''), people: everyone }));
      if (scanned.length) {
        setItems(scanned);
        setTax(data.tax ? String(data.tax) : '');
        setTip(data.tip ? String(data.tip) : '');
        setMode('itemized');
        toast(`Found ${scanned.length} items. Tap names to say who had what.`);
      } else if (data.total) {
        setAmount(String(data.total));
        toast('Read the total. Items weren’t clear enough to list.');
      }
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setScanning(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const save = async () => {
    if (errors.length) { setShowErrors(true); return; }
    setBusy(true);
    const cat = CATEGORIES.find((c) => c.id === category);
    const row = {
      ...(tx ? { id: tx.id } : { group_id: group.id, created_by: me }),
      kind: 'expense',
      description: description.trim() || cat.label,
      category,
      amount: fromCents(totalCents),
      currency,
      fx_rate: foreign ? rateNum : 1,
      date,
      paid_by: centsMapToAmounts(pay.cents),
      split: centsMapToAmounts(split.cents),
      split_meta: { mode, included, values, items, tax, tip, payMode, payer, payValues },
      notes: notes.trim(),
    };
    try {
      await saveTx(row);
      await logActivity(group.id, me, tx ? 'edited' : 'added',
        `${tx ? 'edited' : 'added'} “${row.description}” (${formatMoney(row.amount, currency)})`);
      toast(tx ? 'Expense updated' : 'Expense added');
      onDone();
    } catch (e) { toast(e.message, 'error'); setBusy(false); }
  };

  const remove = async () => {
    if (!window.confirm(`Delete “${tx.description}”? Balances will update for everyone.`)) return;
    setBusy(true);
    try {
      await deleteTx(tx.id);
      await logActivity(group.id, me, 'deleted', `deleted “${tx.description}” (${formatMoney(tx.amount, tx.currency)})`);
      toast('Expense deleted');
      onDone();
    } catch (e) { toast(e.message, 'error'); setBusy(false); }
  };

  const perPerson = (id) => (split.cents[id] ? formatMoney(fromCents(split.cents[id]), currency) : null);

  return (
    <div className="page form-page">
      <TopBar
        left={<button className="text-btn" onClick={onDone}>Cancel</button>}
        title={tx ? 'Edit expense' : 'Add expense'}
        right={<button className="text-btn strong" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>}
      />

      <div className="form">
        <button type="button" className="scan-btn" onClick={() => fileRef.current?.click()} disabled={scanning}>
          <span aria-hidden="true">📷</span>
          <span>{scanning ? 'Reading receipt…' : 'Scan a receipt'}<small>Fills in items and prices for you</small></span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => scanReceipt(e.target.files?.[0])} />

        <div className="amount-row">
          <select className="cur-select" value={currency} aria-label="Currency"
            onChange={(e) => changeCurrency(e.target.value)}>
            {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          {mode === 'itemized' ? (
            <div className="amount-input readonly" aria-live="polite">{fromCents(totalCents).toFixed(2)}</div>
          ) : (
            <input className="amount-input" inputMode="decimal" placeholder="0.00" value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))} aria-label="Amount" autoFocus={!tx} />
          )}
        </div>
        {mode === 'itemized' && <p className="hint center">Total is worked out from the items below.</p>}

        {foreign && (
          <div className="fx">
            <label htmlFor="rate">1 {currency} =</label>
            <input id="rate" inputMode="decimal" value={rate} onChange={(e) => { setRate(e.target.value); setRateState('manual'); }} />
            <span>{group.currency}</span>
            <span className="muted fx-note">
              {rateState === 'loading' ? 'getting rate…'
                : rateState === 'error' ? 'couldn’t fetch, type it in'
                : rateNum > 0 ? `= ${formatMoney(fromCents(totalCents) * rateNum, group.currency)}` : ''}
            </span>
            {(rateState === 'manual' || rateState === 'saved') && (
              <button type="button" className="text-btn small" onClick={() => loadRate(currency, date)}>Fetch rate</button>
            )}
          </div>
        )}

        <div className="field">
          <label htmlFor="desc">What was it for?</label>
          <input id="desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Dinner at Rosa’s" maxLength={120} />
        </div>

        <div className="field">
          <span className="label">Category</span>
          <div className="cat-grid">
            {CATEGORIES.map((c) => (
              <button type="button" key={c.id} className={`cat ${category === c.id ? 'on' : ''}`} onClick={() => setCategory(c.id)} aria-pressed={category === c.id}>
                <span aria-hidden="true">{c.emoji}</span>{c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="date">Date</label>
          <input id="date" type="date" value={date} max={todayISO()} onChange={(e) => changeDate(e.target.value)} />
        </div>

        {/* Paid by */}
        <section className="block">
          <div className="block-head">
            <h2>Paid by</h2>
            <button type="button" className="text-btn small" onClick={() => setPayMode(payMode === 'single' ? 'multi' : 'single')}>
              {payMode === 'single' ? 'Several people paid' : 'One person paid'}
            </button>
          </div>
          {payMode === 'single' ? (
            <div className="chip-row">
              {people.map((m) => (
                <button type="button" key={m.id} className={`person-chip ${payer === m.id ? 'on' : ''}`} onClick={() => setPayer(m.id)} aria-pressed={payer === m.id}>
                  <Avatar member={m} size={24} />{m.id === me ? 'You' : m.name}
                </button>
              ))}
            </div>
          ) : (
            <ul className="split-list">
              {people.map((m) => (
                <li key={m.id}>
                  <Avatar member={m} size={30} /><span className="who">{m.id === me ? 'You' : m.name}</span>
                  <input className="num" inputMode="decimal" placeholder="0.00" value={payValues[m.id] || ''} aria-label={`${m.name} paid`}
                    onChange={(e) => setPayValues({ ...payValues, [m.id]: e.target.value })} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Split */}
        <section className="block">
          <div className="block-head"><h2>Split</h2></div>
          <Segmented options={SPLIT_MODES} value={mode} onChange={setMode} label="How to split" />

          {mode === 'equal' && (
            <>
              <div className="quick-row">
                <button type="button" className="text-btn small" onClick={() => setIncluded(ids)}>Everyone</button>
                <button type="button" className="text-btn small" onClick={() => setIncluded([])}>No one</button>
                <span className="muted">{included.filter((x) => ids.includes(x)).length} of {ids.length} sharing</span>
              </div>
              <ul className="split-list">
                {people.map((m) => {
                  const on = included.includes(m.id);
                  return (
                    <li key={m.id} className={on ? '' : 'off'}>
                      <label className="check">
                        <input type="checkbox" checked={on} onChange={() => toggleIncluded(m.id)} />
                        <Avatar member={m} size={30} /><span className="who">{m.id === me ? 'You' : m.name}</span>
                      </label>
                      <span className="share">{on ? perPerson(m.id) || '—' : 'left out'}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {mode === 'exact' && (
            <ul className="split-list">
              {people.map((m) => (
                <li key={m.id}>
                  <Avatar member={m} size={30} /><span className="who">{m.id === me ? 'You' : m.name}</span>
                  <button type="button" className="text-btn small" onClick={() => fillRemaining(m.id)} title="Give this person whatever is left">Rest</button>
                  <input className="num" inputMode="decimal" placeholder="0.00" value={values.exact?.[m.id] || ''} aria-label={`${m.name}’s amount`}
                    onChange={(e) => setVal('exact', m.id, e.target.value)} />
                </li>
              ))}
            </ul>
          )}

          {mode === 'percent' && (
            <>
              <div className="quick-row"><button type="button" className="text-btn small" onClick={evenPercents}>Spread evenly</button></div>
              <ul className="split-list">
                {people.map((m) => (
                  <li key={m.id}>
                    <Avatar member={m} size={30} /><span className="who">{m.id === me ? 'You' : m.name}</span>
                    <span className="share">{perPerson(m.id)}</span>
                    <span className="num-wrap">
                      <input className="num short" inputMode="decimal" placeholder="0" value={values.percent?.[m.id] || ''} aria-label={`${m.name}’s percent`}
                        onChange={(e) => setVal('percent', m.id, e.target.value)} />%
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {mode === 'shares' && (
            <>
              <p className="hint">Someone with 2 shares pays twice as much as someone with 1. Set 0 to leave a person out.</p>
              <ul className="split-list">
                {people.map((m) => {
                  const s = shareOf(values, m.id);
                  return (
                    <li key={m.id} className={s ? '' : 'off'}>
                      <Avatar member={m} size={30} /><span className="who">{m.id === me ? 'You' : m.name}</span>
                      <span className="share">{perPerson(m.id)}</span>
                      <span className="stepper">
                        <button type="button" onClick={() => setVal('shares', m.id, Math.max(0, s - 1))} aria-label={`Fewer shares for ${m.name}`}>−</button>
                        <span>{s}</span>
                        <button type="button" onClick={() => setVal('shares', m.id, s + 1)} aria-label={`More shares for ${m.name}`}>+</button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {mode === 'itemized' && (
            <>
              <ul className="items">
                {items.map((it) => (
                  <li key={it.id} className="item">
                    <div className="item-top">
                      <input value={it.name} placeholder="Item" onChange={(e) => updateItem(it.id, { name: e.target.value })} aria-label="Item name" />
                      <input className="num" inputMode="decimal" placeholder="0.00" value={it.price} onChange={(e) => updateItem(it.id, { price: e.target.value })} aria-label="Item price" />
                      <button type="button" className="icon-btn" onClick={() => setItems(items.filter((x) => x.id !== it.id))} aria-label="Remove item">✕</button>
                    </div>
                    <div className="chip-row tight">
                      {people.map((m) => {
                        const on = it.people.includes(m.id);
                        return (
                          <button type="button" key={m.id} className={`mini-chip ${on ? 'on' : ''}`} aria-pressed={on}
                            onClick={() => updateItem(it.id, { people: on ? it.people.filter((x) => x !== m.id) : [...it.people, m.id] })}>
                            {m.id === me ? 'You' : m.name}
                          </button>
                        );
                      })}
                    </div>
                  </li>
                ))}
              </ul>
              <button type="button" className="btn block" onClick={addItem}>Add item</button>
              <div className="extras">
                <label>Tax / service<input className="num" inputMode="decimal" placeholder="0.00" value={tax} onChange={(e) => setTax(e.target.value)} /></label>
                <label>Tip<input className="num" inputMode="decimal" placeholder="0.00" value={tip} onChange={(e) => setTip(e.target.value)} /></label>
              </div>
              <p className="hint">Tax and tip are shared in proportion to what each person ordered. Use a negative price for discounts.</p>
              {split.ok && (
                <ul className="split-list summary">
                  {people.filter((m) => split.cents[m.id]).map((m) => (
                    <li key={m.id}><Avatar member={m} size={26} /><span className="who">{m.id === me ? 'You' : m.name}</span><span className="share">{perPerson(m.id)}</span></li>
                  ))}
                </ul>
              )}
            </>
          )}

          <div className="add-person">
            <input value={newPerson} onChange={(e) => setNewPerson(e.target.value)} placeholder="Add someone new" maxLength={40}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPerson(); } }} aria-label="New person’s name" />
            <button type="button" className="btn" onClick={addPerson} disabled={!newPerson.trim()}>Add</button>
          </div>

          {!split.ok && totalCents > 0 && <p className="inline-error">{split.error}</p>}
          {!pay.ok && totalCents > 0 && payMode === 'multi' && <p className="inline-error">{pay.error}</p>}
        </section>

        <div className="field">
          <label htmlFor="notes">Notes</label>
          <textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </div>

        {showErrors && errors.length > 0 && (
          <div className="error-box" role="alert">{errors.map((e) => <p key={e}>{e}</p>)}</div>
        )}

        <button className="btn primary big block" onClick={save} disabled={busy}>{busy ? 'Saving…' : tx ? 'Save changes' : 'Add expense'}</button>
        {tx && <button className="btn danger block" onClick={remove} disabled={busy}>Delete expense</button>}
      </div>
    </div>
  );
}
