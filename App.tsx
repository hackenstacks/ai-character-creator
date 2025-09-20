import React, { useState, useEffect, useCallback } from 'react';
import { AuthScreen } from './components/AuthScreen.tsx';
import { MainLayout } from './components/MainLayout.tsx';
import { hasMasterPassword, verifyMasterPassword } from './services/secureStorage.ts';
import { logger } from './services/loggingService.ts';
import { applyTheme } from './services/themeService.ts';

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isPasswordSet, setIsPasswordSet] = useState<boolean>(false);

  useEffect(() => {
    applyTheme(); // Apply theme on initial load
    logger.log("Application starting up...");
    const checkPassword = async () => {
      const isSet = await hasMasterPassword();
      setIsPasswordSet(isSet);
      logger.log(`Master password is ${isSet ? 'set' : 'not set'}.`);
    };
    checkPassword();
  }, []);

  const handleLogin = useCallback(async (password: string) => {
    logger.log("Attempting login...");
    const isValid = await verifyMasterPassword(password);
    if (isValid) {
      logger.log("Login successful.");
      setIsAuthenticated(true);
      return true;
    }
    logger.warn("Login failed: incorrect password.");
    return false;
  }, []);

  const handlePasswordSet = useCallback(() => {
    logger.log("Master password has been set.");
    setIsPasswordSet(true);
    setIsAuthenticated(true);
  }, []);

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background-secondary">
        <AuthScreen
          isPasswordSet={isPasswordSet}
          onLogin={handleLogin}
          onPasswordSet={handlePasswordSet}
        />
      </div>
    );
  }

  return <MainLayout />;
};

export default App;