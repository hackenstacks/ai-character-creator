import React from 'react';
import { WarningIcon } from './icons/WarningIcon.tsx';

interface ConfirmationModalProps {
  message: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ message, onConfirm, onCancel }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-background-secondary rounded-lg shadow-xl w-full max-w-md flex flex-col" onClick={e => e.stopPropagation()}>
        <header className="p-4 flex items-center space-x-3 border-b border-border-neutral">
          <WarningIcon className="w-8 h-8 text-accent-yellow flex-shrink-0" />
          <h2 className="text-xl font-bold text-text-primary">Please Confirm</h2>
        </header>
        <div className="p-6">
            <div className="text-text-primary">{message}</div>
        </div>
        <footer className="p-4 bg-background-tertiary/50 flex justify-end space-x-3 rounded-b-lg">
            <button onClick={onCancel} className="py-2 px-4 rounded-md text-text-primary bg-background-tertiary hover:bg-opacity-80 font-medium">
                Cancel
            </button>
            <button onClick={onConfirm} className="py-2 px-4 rounded-md text-white bg-accent-red hover:opacity-90 font-medium">
                Confirm
            </button>
        </footer>
      </div>
    </div>
  );
};