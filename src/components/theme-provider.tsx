'use client';

import { createContext, useContext, useEffect, useState } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
const storageKey = 'ekdk-theme';
const ThemeContext = createContext<{ preference: ThemePreference; setPreference: (value: ThemePreference) => void }>({ preference: 'system', setPreference: () => {} });

function readPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {}
  return 'system';
}

function applyTheme(preference: ThemePreference) {
  document.documentElement.dataset.theme = preference === 'system' ? window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' : preference;
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setCurrentPreference] = useState<ThemePreference>('system');
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const synchronize = () => {
      const saved = readPreference();
      setCurrentPreference(saved);
      applyTheme(saved);
    };
    const storageChanged = (event: StorageEvent) => { if (event.key === storageKey || event.key === null) synchronize(); };
    synchronize();
    media.addEventListener('change', synchronize);
    window.addEventListener('storage', storageChanged);
    return () => { media.removeEventListener('change', synchronize); window.removeEventListener('storage', storageChanged); };
  }, []);
  function setPreference(value: ThemePreference) {
    setCurrentPreference(value);
    applyTheme(value);
    try { localStorage.setItem(storageKey, value); } catch {}
  }
  return <ThemeContext.Provider value={{ preference, setPreference }}>{children}</ThemeContext.Provider>;
}

export function useTheme() { return useContext(ThemeContext); }
