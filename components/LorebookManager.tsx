import React, { useState, useEffect, useRef } from 'react';
import { Lorebook, LorebookEntry, ConfirmationRequest } from '../types.ts';
import { logger } from '../services/loggingService.ts';
import { PlusIcon } from './icons/PlusIcon.tsx';
import { TrashIcon } from './icons/TrashIcon.tsx';
import { EditIcon } from './icons/EditIcon.tsx';
import { DownloadIcon } from './icons/DownloadIcon.tsx';

interface LorebookManagerProps {
  lorebooks: Lorebook[];
  onLorebooksUpdate: (lorebooks: Lorebook[]) => void;
  onSetConfirmation: (request: ConfirmationRequest | null) => void;
}

const LorebookEditor: React.FC<{
    lorebook: Lorebook;
    onSave: (lorebook: Lorebook) => void;
    onCancel: () => void;
}> = ({ lorebook, onSave, onCancel }) => {
    const [formState, setFormState] = useState<Lorebook>(lorebook);

    const handleBookChange = <K extends keyof Omit<Lorebook, 'entries'>>(key: K, value: Lorebook[K]) => {
        setFormState(prev => ({ ...prev, [key]: value }));
    };

    const handleEntryChange = (entryId: string, field: keyof LorebookEntry, value: string | string[]) => {
        setFormState(prev => ({
            ...prev,
            entries: prev.entries.map(e => e.id === entryId ? { ...e, [field]: value } : e)
        }));
    };

    const handleAddEntry = () => {
        const newEntry: LorebookEntry = { id: crypto.randomUUID(), keys: [], content: '' };
        setFormState(prev => ({ ...prev, entries: [...prev.entries, newEntry]}));
    };

    const handleDeleteEntry = (entryId: string) => {
        setFormState(prev => ({ ...prev, entries: prev.entries.filter(e => e.id !== entryId)}));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formState);
    };

    return (
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col h-full">
            <header className="p-4 border-b border-border-neutral flex-shrink-0">
                <input
                  type="text"
                  value={formState.name}
                  onChange={(e) => handleBookChange('name', e.target.value)}
                  className="text-xl font-bold bg-transparent focus:outline-none w-full text-text-primary"
                  placeholder="Lorebook Name"
                  required
                />
                <textarea
                    value={formState.description}
                    onChange={(e) => handleBookChange('description', e.target.value)}
                    className="text-sm bg-transparent focus:outline-none w-full text-text-secondary mt-1 resize-none"
                    placeholder="Lorebook description..."
                    rows={1}
                />
            </header>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {formState.entries.map(entry => (
                    <div key={entry.id} className="bg-background-primary p-3 rounded-md border border-border-neutral">
                        <div className="flex justify-between items-center mb-2">
                            <label className="text-sm font-medium text-text-primary">Keywords (comma-separated)</label>
                            <button type="button" onClick={() => handleDeleteEntry(entry.id)} className="text-accent-red hover:opacity-80"><TrashIcon className="w-4 h-4" /></button>
                        </div>
                        <input
                            type="text"
                            value={entry.keys.join(', ')}
                            onChange={(e) => handleEntryChange(entry.id, 'keys', e.target.value.split(',').map(k => k.trim()))}
                            className="w-full bg-background-secondary border border-border-strong rounded-md py-1 px-2 text-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
                            placeholder="e.g., Excalibur, Holy Grail"
                        />
                        <label className="text-sm font-medium text-text-primary mt-3 block">Content</label>
                        <textarea
                            value={entry.content}
                            onChange={(e) => handleEntryChange(entry.id, 'content', e.target.value)}
                            rows={4}
                            className="w-full mt-1 bg-background-secondary border border-border-strong rounded-md py-1 px-2 text-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
                            placeholder="Details about these keywords..."
                        />
                    </div>
                ))}
                <button type="button" onClick={handleAddEntry} className="w-full flex items-center justify-center space-x-2 py-2 px-3 rounded-md text-text-primary bg-background-tertiary hover:bg-opacity-80 transition-colors">
                    <PlusIcon className="w-5 h-5" /><span>Add Entry</span>
                </button>
            </div>
            <footer className="p-4 border-t border-border-neutral flex justify-end space-x-3">
                <button type="button" onClick={onCancel} className="py-2 px-4 rounded-md text-text-primary bg-background-tertiary hover:bg-opacity-80">Cancel</button>
                <button type="submit" className="py-2 px-4 rounded-md text-text-accent bg-primary-600 hover:bg-primary-500">Save Lorebook</button>
            </footer>
        </form>
    );
};


export const LorebookManager: React.FC<LorebookManagerProps> = ({ lorebooks, onLorebooksUpdate, onSetConfirmation }) => {
  const [editingLorebook, setEditingLorebook] = useState<Lorebook | null>(null);

  const handleSave = (lorebookToSave: Lorebook) => {
    const isNew = !lorebooks.some(lb => lb.id === lorebookToSave.id);
    const updatedLorebooks = isNew
        ? [...lorebooks, lorebookToSave]
        : lorebooks.map(lb => lb.id === lorebookToSave.id ? lorebookToSave : lb);
    onLorebooksUpdate(updatedLorebooks);
    logger.log(`Lorebook saved: ${lorebookToSave.name}`);
    setEditingLorebook(null);
  };
  
  const handleCreate = () => {
    setEditingLorebook({ id: crypto.randomUUID(), name: '', description: '', entries: []});
  };

  const handleDelete = (lorebookId: string) => {
    const lorebookName = lorebooks.find(lb => lb.id === lorebookId)?.name || 'Unknown';
    onSetConfirmation({
        message: `Are you sure you want to delete the lorebook "${lorebookName}"? This action cannot be undone.`,
        onConfirm: () => {
            const updatedLorebooks = lorebooks.filter(lb => lb.id !== lorebookId);
            onLorebooksUpdate(updatedLorebooks);
            logger.log(`Lorebook deleted: ${lorebookName}`);
            onSetConfirmation(null);
        },
        onCancel: () => onSetConfirmation(null),
    });
  };
  
  const handleExport = (lorebook: Lorebook) => {
    try {
        const jsonString = JSON.stringify(lorebook, null, 2);
        const filename = `${lorebook.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_lorebook.json`;
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        logger.log(`Exported lorebook: ${lorebook.name}`, { filename });
    } catch (error) {
        logger.error(`Failed to export lorebook: ${lorebook.name}`, error);
    }
  };

  if (editingLorebook) {
      return <LorebookEditor lorebook={editingLorebook} onSave={handleSave} onCancel={() => setEditingLorebook(null)} />
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full">
        <header className="p-4 border-b border-border-neutral flex justify-between items-center flex-shrink-0">
            <h2 className="text-xl font-bold text-text-primary">Lorebooks</h2>
            <button onClick={handleCreate} className="p-2 rounded-md text-text-secondary hover:bg-background-tertiary hover:text-text-primary transition-colors" title="New Lorebook">
                <PlusIcon className="w-5 h-5" />
            </button>
        </header>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {lorebooks.length === 0 ? (
                <p className="text-text-secondary text-center py-8">No lorebooks. Click '+' to create one, or import one using the sidebar.</p>
            ) : (
                lorebooks.map(lb => (
                    <div key={lb.id} className="bg-background-primary p-3 rounded-lg group">
                        <div className="flex items-center justify-between">
                            <div className="min-w-0">
                                <p className="font-semibold text-text-primary truncate">{lb.name}</p>
                                <p className="text-sm text-text-secondary truncate">{lb.description || `${lb.entries.length} entries`}</p>
                            </div>
                            <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => handleExport(lb)} title="Export" className="p-1 rounded text-text-secondary hover:text-text-primary"><DownloadIcon className="w-4 h-4" /></button>
                                <button onClick={() => setEditingLorebook(lb)} title="Edit" className="p-1 rounded text-text-secondary hover:text-text-primary"><EditIcon className="w-4 h-4" /></button>
                                <button onClick={() => handleDelete(lb.id)} title="Delete" className="p-1 rounded text-text-secondary hover:text-accent-red"><TrashIcon className="w-4 h-4" /></button>
                            </div>
                        </div>
                    </div>
                ))
            )}
        </div>
    </div>
  );
};