import { logger } from './loggingService.ts';

export type ThemeName = 'nexus' | 'synthwave' | 'forest' | 'crimson';
export type ThemeMode = 'light' | 'dark';

const THEME_KEY = 'ai-nexus-theme';
const MODE_KEY = 'ai-nexus-theme-mode';

export const themes: { id: ThemeName; name: string }[] = [
  { id: 'nexus', name: 'Nexus' },
  { id: 'synthwave', name: 'Synthwave' },
  { id: 'forest', name: 'Forest' },
  { id: 'crimson', name: 'Crimson' },
];

// --- Subscription Service ---
type ThemeListener = () => void;
const listeners: Set<ThemeListener> = new Set();

const notifyListeners = () => {
  listeners.forEach(l => l());
};

export const subscribe = (listener: ThemeListener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

// --- Theme Management ---
export const getTheme = (): ThemeName => {
  return (localStorage.getItem(THEME_KEY) as ThemeName) || 'nexus';
};

export const getMode = (): ThemeMode => {
  return (localStorage.getItem(MODE_KEY) as ThemeMode) || 'dark';
};

export const applyTheme = () => {
  const theme = getTheme();
  const mode = getMode();
  
  const root = document.documentElement;

  // Remove old theme classes
  themes.forEach(t => root.classList.remove(`theme-${t.id}`));
  
  // Add new theme class
  root.classList.add(`theme-${theme}`);
  
  // Handle dark/light mode
  if (mode === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  logger.log(`Theme applied: ${theme} (${mode})`);
};

export const setTheme = (theme: ThemeName) => {
  localStorage.setItem(THEME_KEY, theme);
  applyTheme();
  notifyListeners();
};

export const setMode = (mode: ThemeMode) => {
  localStorage.setItem(MODE_KEY, mode);
  applyTheme();
  notifyListeners();
};

export const toggleMode = () => {
  const currentMode = getMode();
  setMode(currentMode === 'light' ? 'dark' : 'light');
};
