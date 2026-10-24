import { useEffect, useState } from 'react';

const read = () => window.location.hash.replace(/^#\/?/, '');

export function useRoute() {
  const [raw, setRaw] = useState(read);
  useEffect(() => {
    const f = () => setRaw(read());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  const [path, query = ''] = raw.split('?');
  return { parts: path.split('/').filter(Boolean), query: new URLSearchParams(query) };
}

export const go = (path) => { window.location.hash = `#/${path.replace(/^\//, '')}`; };

export const groupLink = (id) => `${window.location.origin}/#/g/${id}`;
