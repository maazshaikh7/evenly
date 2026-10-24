import { useEffect, useState } from 'react';
import { ensureSession, isConfigured } from './lib/supabase.js';
import { useRoute } from './lib/router.js';
import { Spinner, Toaster } from './components/ui.jsx';
import Home from './components/Home.jsx';
import NewGroup from './components/NewGroup.jsx';
import GroupPage from './components/GroupPage.jsx';

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const { parts, query } = useRoute();

  useEffect(() => {
    if (!isConfigured) return;
    ensureSession().then(() => setReady(true)).catch((e) => setError(e.message));
  }, []);

  let screen;
  if (!isConfigured) {
    screen = (
      <div className="center-screen pad">
        <div className="notice">
          <h2>Connect your database</h2>
          <p>Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to your environment, then rebuild. The README walks through it.</p>
        </div>
      </div>
    );
  } else if (error) {
    screen = <div className="center-screen pad"><div className="notice"><h2>Can’t connect</h2><p>{error}</p></div></div>;
  } else if (!ready) {
    screen = <Spinner />;
  } else if (parts[0] === 'new') {
    screen = <NewGroup />;
  } else if (parts[0] === 'g' && parts[1]) {
    screen = <GroupPage key={parts[1]} groupId={parts[1]} sub={parts.slice(2)} query={query} />;
  } else {
    screen = <Home />;
  }

  return (
    <div className="app">
      {screen}
      <Toaster />
    </div>
  );
}
