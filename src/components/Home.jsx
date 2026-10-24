import { useEffect, useState } from 'react';
import { listMyGroups } from '../lib/api.js';
import { netBalances } from '../lib/balances.js';
import { go } from '../lib/router.js';
import { Empty, Spinner, balanceText } from './ui.jsx';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export default function Home() {
  const [groups, setGroups] = useState(null);
  const [error, setError] = useState(null);
  const [link, setLink] = useState('');

  useEffect(() => { listMyGroups().then(setGroups).catch((e) => setError(e.message)); }, []);

  const join = (e) => {
    e.preventDefault();
    const m = link.match(UUID);
    if (m) go(`g/${m[0].toLowerCase()}`);
  };

  if (error) return <div className="center-screen pad"><div className="notice"><h2>Couldn’t load your groups</h2><p>{error}</p></div></div>;
  if (!groups) return <Spinner />;

  return (
    <main className="page home">
      <header className="home-head">
        <div className="wordmark" aria-label="Evenly"><span className="bars" aria-hidden="true"><i /><i /></span>Evenly</div>
        <button className="btn primary" onClick={() => go('new')}>New group</button>
      </header>

      {groups.length === 0 ? (
        <Empty emoji="🧾" title="Start a group for your next shared bill">
          <p>Make a group for a trip, your flat or a regular dinner, then send the link to your friends.</p>
          <button className="btn primary big" onClick={() => go('new')}>Create a group</button>
        </Empty>
      ) : (
        <ul className="group-list">
          {groups.map((g) => {
            const net = g.me ? netBalances(g.txs)[g.me] || 0 : 0;
            const b = balanceText(net, g.currency);
            return (
              <li key={g.id}>
                <button className="group-card" onClick={() => go(`g/${g.id}`)}>
                  <span className="group-emoji" aria-hidden="true">{g.emoji}</span>
                  <span className="group-meta">
                    <strong>{g.name}</strong>
                    <span className={`muted ${b.tone}`}>{g.me ? b.text : 'pick who you are'}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <form className="join" onSubmit={join}>
        <label htmlFor="join">Got a link from a friend?</label>
        <div className="row">
          <input id="join" value={link} onChange={(e) => setLink(e.target.value)} placeholder="Paste the group link" />
          <button className="btn" disabled={!UUID.test(link)}>Join</button>
        </div>
      </form>
    </main>
  );
}
