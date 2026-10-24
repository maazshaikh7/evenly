import { useState } from 'react';
import { addMember, leaveGroup, logActivity, setMe, updateGroup, updateMember } from '../lib/api.js';
import { categoryOf } from '../lib/categories.js';
import { CURRENCIES } from '../lib/currency.js';
import { go, groupLink } from '../lib/router.js';
import { toast } from '../lib/toast.js';
import { Avatar, Money, TopBar } from './ui.jsx';
import { shareGroup } from './GroupPage.jsx';

function toCSV(group, members, txs) {
  const name = (id) => members.find((m) => m.id === id)?.name || '?';
  const fmt = (map) => Object.entries(map).map(([id, v]) => `${name(id)}: ${Number(v).toFixed(2)}`).join('; ');
  const rows = [['Date', 'Type', 'Description', 'Category', 'Amount', 'Currency', 'Rate', `Amount (${group.currency})`, 'Paid by', 'Split', 'Notes']];
  for (const t of [...txs].reverse()) {
    rows.push([t.date, t.kind, t.description, categoryOf(t.category).label, Number(t.amount).toFixed(2), t.currency,
      t.fx_rate, (t.amount * t.fx_rate).toFixed(2), fmt(t.paid_by), fmt(t.split), t.notes]);
  }
  return rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
}

export default function Settings({ group, members, txs, me, net, reload, onDone }) {
  const [name, setName] = useState(group.name);
  const [currency, setCurrency] = useState(group.currency);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState(null);

  const saveGroup = async () => {
    try {
      await updateGroup(group.id, { name: name.trim() || group.name, currency });
      toast('Group updated'); reload();
    } catch (e) { toast(e.message, 'error'); }
  };

  const add = async () => {
    if (!newName.trim()) return;
    try {
      await addMember(group.id, newName.trim());
      await logActivity(group.id, me, 'member_added', `added ${newName.trim()} to the group`);
      setNewName(''); reload();
    } catch (e) { toast(e.message, 'error'); }
  };

  const saveMember = async () => {
    try {
      await updateMember(editing.id, { name: editing.name.trim() || 'Friend', pay_link: editing.pay_link.trim() });
      setEditing(null); reload();
    } catch (e) { toast(e.message, 'error'); }
  };

  const exportCSV = () => {
    const blob = new Blob([toCSV(group, members, txs)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${group.name.replace(/[^\w-]+/g, '_')}_expenses.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const leave = async () => {
    if (!window.confirm('Remove this group from this phone? You can rejoin any time with the link.')) return;
    await leaveGroup(group.id);
    go('');
  };

  return (
    <div className="page form-page">
      <TopBar left={<button className="text-btn" onClick={onDone}>Done</button>} title="Group settings" />
      <div className="form">
        <section className="block">
          <h2>Invite friends</h2>
          <p className="hint">Anyone with this link can join and see this group’s expenses.</p>
          <div className="row">
            <input readOnly value={groupLink(group.id)} onFocus={(e) => e.target.select()} aria-label="Invite link" />
            <button className="btn primary" onClick={() => shareGroup(group)}>Share</button>
          </div>
        </section>

        <section className="block">
          <h2>Group</h2>
          <div className="field"><label htmlFor="sname">Name</label><input id="sname" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="field">
            <label htmlFor="scur">Main currency</label>
            <select id="scur" value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={txs.length > 0}>
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            {txs.length > 0 && <p className="hint">Locked once expenses exist, so past conversions stay correct.</p>}
          </div>
          <button className="btn" onClick={saveGroup}>Save group</button>
        </section>

        <section className="block">
          <h2>People</h2>
          <ul className="member-list">
            {members.map((m) => (
              <li key={m.id}>
                {editing?.id === m.id ? (
                  <div className="member-edit">
                    <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} aria-label="Name" />
                    <input value={editing.pay_link} onChange={(e) => setEditing({ ...editing, pay_link: e.target.value })} placeholder="Payment link, e.g. monzo.me/sam or paypal.me/sam" aria-label="Payment link" />
                    <div className="row"><button className="btn primary" onClick={saveMember}>Save</button><button className="btn" onClick={() => setEditing(null)}>Cancel</button></div>
                  </div>
                ) : (
                  <>
                    <Avatar member={m} size={32} />
                    <span className="who">{m.name}{m.id === me && <span className="muted"> (you)</span>}{m.pay_link && <span className="muted small-line">{m.pay_link}</span>}</span>
                    <Money value={net[m.id] || 0} currency={group.currency} signed />
                    <button className="text-btn small" onClick={() => setEditing({ ...m, pay_link: m.pay_link || '' })}>Edit</button>
                  </>
                )}
              </li>
            ))}
          </ul>
          <div className="row">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Add a person" maxLength={40}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} aria-label="New person" />
            <button className="btn" onClick={add} disabled={!newName.trim()}>Add</button>
          </div>
        </section>

        <section className="block">
          <h2>This phone</h2>
          <button className="btn block" onClick={async () => { await setMe(group.id, null); reload(); }}>I’m not {members.find((m) => m.id === me)?.name}</button>
          <button className="btn block" onClick={exportCSV} disabled={!txs.length}>Export expenses as CSV</button>
          <button className="btn danger block" onClick={leave}>Remove group from this phone</button>
        </section>
      </div>
    </div>
  );
}
