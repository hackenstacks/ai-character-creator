import React, { useState, useCallback } from 'react';
import { LockIcon } from './icons/LockIcon.tsx';
import { setMasterPassword } from '../services/secureStorage.ts';

interface AuthScreenProps {
  isPasswordSet: boolean;
  onLogin: (password: string) => Promise<boolean>;
  onPasswordSet: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ isPasswordSet, onLogin, onPasswordSet }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (isPasswordSet) {
      const success = await onLogin(password);
      if (!success) {
        setError('Incorrect password. Please try again.');
      }
    } else {
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        setIsLoading(false);
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters long.');
        setIsLoading(false);
        return;
      }
      await setMasterPassword(password);
      onPasswordSet();
    }
    setIsLoading(false);
  }, [isPasswordSet, onLogin, password, confirmPassword, onPasswordSet]);

  return (
    <div className="w-full max-w-md p-8 space-y-8 bg-background-primary rounded-lg shadow-2xl">
      <div className="text-center">
        <LockIcon className="w-16 h-16 mx-auto text-primary-500"/>
        <h2 className="mt-6 text-3xl font-extrabold text-text-primary">
          {isPasswordSet ? 'Enter Master Password' : 'Create Master Password'}
        </h2>
        <p className="mt-2 text-sm text-text-secondary">
          {isPasswordSet ? 'Your local data is encrypted.' : 'This password encrypts all your local data.'}
        </p>
      </div>
      <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
        <div className="rounded-md shadow-sm -space-y-px">
          <div>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="appearance-none rounded-none relative block w-full px-3 py-3 border border-border-strong bg-background-secondary placeholder-text-secondary text-text-primary rounded-t-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 focus:z-10 sm:text-sm"
              placeholder="Master Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {!isPasswordSet && (
            <div>
              <input
                id="confirm-password"
                name="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-3 border border-border-strong bg-background-secondary placeholder-text-secondary text-text-primary rounded-b-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 focus:z-10 sm:text-sm"
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          )}
        </div>

        {error && <p className="text-accent-red text-sm text-center">{error}</p>}

        <div>
          <button
            type="submit"
            disabled={isLoading}
            className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-text-accent bg-primary-600 hover:bg-primary-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background-primary focus:ring-primary-500 disabled:opacity-50"
          >
            {isLoading ? 'Unlocking...' : (isPasswordSet ? 'Unlock' : 'Create & Unlock')}
          </button>
        </div>
      </form>
    </div>
  );
};