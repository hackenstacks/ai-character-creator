import React, { useState } from 'react';

interface InputModalProps {
  title: string;
  label?: string;
  initialValue?: string;
  placeholder?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export const InputModal: React.FC<InputModalProps> = ({ title, label, initialValue = '', placeholder, onConfirm, onCancel }) => {
  const [value, setValue] = useState(initialValue);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onConfirm(value);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 z-[60] flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-background-secondary rounded-lg shadow-xl w-full max-w-md flex flex-col border border-border-neutral" onClick={e => e.stopPropagation()}>
        <header className="p-4 border-b border-border-neutral">
          <h2 className="text-xl font-bold text-text-primary">{title}</h2>
        </header>
        <form onSubmit={handleSubmit} className="p-6">
            {label && <label className="block text-sm font-medium text-text-primary mb-2">{label}</label>}
            <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={placeholder}
                className="w-full bg-background-primary border border-border-strong rounded-md shadow-sm py-2 px-3 text-text-primary focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                autoFocus
            />
            <div className="mt-6 flex justify-end space-x-3">
                <button type="button" onClick={onCancel} className="py-2 px-4 rounded-md text-text-primary bg-background-tertiary hover:bg-opacity-80 transition-colors">Cancel</button>
                <button type="submit" disabled={!value.trim()} className="py-2 px-4 rounded-md text-text-accent bg-primary-600 hover:bg-primary-500 disabled:opacity-50 transition-colors">Confirm</button>
            </div>
        </form>
      </div>
    </div>
  );
};