const listeners = new Set();
export const toast = (message, tone = 'info') => listeners.forEach((l) => l({ message, tone, id: Date.now() }));
export const onToast = (l) => { listeners.add(l); return () => listeners.delete(l); };
