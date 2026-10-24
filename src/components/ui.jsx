import { useEffect, useState } from 'react';
import { formatMoney } from '../lib/money.js';
import { onToast } from '../lib/toast.js';

const AVATAR_COLORS = ['#3E6BE0', '#1E8E5A', '#C2410C', '#8E44AD', '#0E7C86', '#B83265', '#6D7A12', '#A65E00'];

function hash(s) {
  let h = 0;
  for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}

export function Avatar({ member, size = 36 }) {
  const name = member?.name || '?';
  const initials = name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4, background: AVATAR_COLORS[hash(member?.id || name) % AVATAR_COLORS.length] }} aria-hidden="true">
      {initials}
    </span>
  );
}

export function Money({ value, currency, signed, tone, className = '' }) {
  const t = tone ?? (signed ? (value > 0.004 ? 'pos' : value < -0.004 ? 'neg' : '') : '');
  return <span className={`money ${t} ${className}`}>{formatMoney(value, currency, { signed })}</span>;
}

export function TopBar({ left, title, right }) {
  return (
    <header className="topbar">
      <div className="topbar-side">{left}</div>
      <h1 className="topbar-title">{title}</h1>
      <div className="topbar-side right">{right}</div>
    </header>
  );
}

export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={value === o.id}
          className={value === o.id ? 'on' : ''} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Sheet({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return;
    const f = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Empty({ emoji, title, children }) {
  return (
    <div className="empty">
      <div className="empty-emoji" aria-hidden="true">{emoji}</div>
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function Spinner({ label = 'Loading' }) {
  return <div className="center-screen"><div className="spinner" role="status" aria-label={label} /></div>;
}

export function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(() => onToast((t) => {
    setItems((xs) => [...xs, t]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== t.id)), 3200);
  }), []);
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => <div key={t.id} className={`toast ${t.tone}`}>{t.message}</div>)}
    </div>
  );
}

export function balanceText(net, currency) {
  if (net > 0.004) return { text: `you’re owed ${formatMoney(net, currency)}`, tone: 'pos' };
  if (net < -0.004) return { text: `you owe ${formatMoney(-net, currency)}`, tone: 'neg' };
  return { text: 'you’re all square', tone: '' };
}
