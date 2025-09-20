import React, { useState, useEffect } from 'react';
import { SunIcon } from './icons/SunIcon.tsx';
import { MoonIcon } from './icons/MoonIcon.tsx';
import * as themeService from '../services/themeService.ts';

export const ThemeSwitcher: React.FC = () => {
  const [mode, setMode] = useState(themeService.getMode());

  useEffect(() => {
    const unsubscribe = themeService.subscribe(() => {
      setMode(themeService.getMode());
    });
    return unsubscribe;
  }, []);

  const handleToggle = () => {
    themeService.toggleMode();
  };

  return (
    <button
      onClick={handleToggle}
      className="p-2 rounded-full text-text-secondary hover:bg-background-tertiary hover:text-text-primary transition-colors"
      title={`Switch to ${mode === 'light' ? 'dark' : 'light'} mode`}
    >
      {mode === 'light' ? (
        <MoonIcon className="w-5 h-5" />
      ) : (
        <SunIcon className="w-5 h-5" />
      )}
    </button>
  );
};