import { useEffect, useState } from 'react';
import { loadActivity } from '../lib/api.js';
import { Avatar, Empty, Spinner } from './ui.jsx';

function ago(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ActivityTab({ group, members, me, tick }) {
  const [items, setItems] = useState(null);
  useEffect(() => { loadActivity(group.id).then(setItems).catch(() => setItems([])); }, [group.id, tick]);
  if (!items) return <Spinner />;
  if (!items.length) return <Empty emoji="🕓" title="Nothing yet"><p>Every added, edited or deleted expense shows up here.</p></Empty>;
  const byId = Object.fromEntries(members.map((m) => [m.id, m]));
  return (
    <ul className="activity">
      {items.map((a) => (
        <li key={a.id} className={`act-${a.action}`}>
          <Avatar member={byId[a.member_id]} size={30} />
          <div>
            <p><strong>{a.member_id === me ? 'You' : byId[a.member_id]?.name || 'Someone'}</strong> {a.summary}</p>
            <span className="muted">{ago(a.created_at)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
