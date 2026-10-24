import { useState } from 'react';
import { createGroup } from '../lib/api.js';
import { CURRENCIES } from '../lib/currency.js';
import { go } from '../lib/router.js';
import { toast } from '../lib/toast.js';
import { TopBar } from './ui.jsx';

const EMOJIS = ['💸', '✈️', '🏠', '🍕', '🏖️', '🎉', '⛷️', '🚗', '🍻', '🏕️'];

export default function NewGroup() {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('💸');
  const [currency, setCurrency] = useState('GBP');
  const [myName, setMyName] = useState('');
  const [friends, setFriends] = useState([]);
  const [friend, setFriend] = useState('');
  const [busy, setBusy] = useState(false);

  const addFriend = () => {
    const n = friend.trim();
    if (n && !friends.includes(n)) setFriends([...friends, n]);
    setFriend('');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !myName.trim()) return;
    setBusy(true);
    try {
      const pending = friend.trim() ? [...friends, friend.trim()] : friends;
      const id = await createGroup({ name: name.trim(), emoji, currency, members: [myName.trim(), ...pending], meIndex: 0 });
      go(`g/${id}`);
    } catch (err) {
      toast(err.message, 'error');
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <TopBar left={<button className="text-btn" onClick={() => go('')}>Cancel</button>} title="New group" />
      <form className="form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="gname">Group name</label>
          <input id="gname" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Lisbon trip, Flat 4B, Friday dinners" maxLength={80} />
        </div>

        <div className="field">
          <span className="label">Icon</span>
          <div className="chip-row">
            {EMOJIS.map((em) => (
              <button type="button" key={em} className={`emoji-chip ${emoji === em ? 'on' : ''}`} onClick={() => setEmoji(em)} aria-pressed={emoji === em}>{em}</button>
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="cur">Main currency</label>
          <select id="cur" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <p className="hint">Balances are shown in this currency. You can still add expenses in others.</p>
        </div>

        <div className="field">
          <label htmlFor="me">Your name</label>
          <input id="me" value={myName} onChange={(e) => setMyName(e.target.value)} placeholder="What friends call you" maxLength={40} />
        </div>

        <div className="field">
          <label htmlFor="friend">Friends</label>
          <div className="row">
            <input id="friend" value={friend} onChange={(e) => setFriend(e.target.value)} placeholder="Add a name" maxLength={40}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFriend(); } }} />
            <button type="button" className="btn" onClick={addFriend} disabled={!friend.trim()}>Add</button>
          </div>
          {friends.length > 0 && (
            <div className="chip-row">
              {friends.map((f) => (
                <button type="button" key={f} className="name-chip" onClick={() => setFriends(friends.filter((x) => x !== f))} aria-label={`Remove ${f}`}>{f} ✕</button>
              ))}
            </div>
          )}
          <p className="hint">You can add more people any time, and friends can join through the link.</p>
        </div>

        <button className="btn primary big block" disabled={busy || !name.trim() || !myName.trim()}>
          {busy ? 'Creating…' : 'Create group'}
        </button>
      </form>
    </div>
  );
}
