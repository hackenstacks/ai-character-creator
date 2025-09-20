import React, { useState, useMemo } from 'react';
import { Character, Lorebook } from '../types.ts';
import { UserIcon } from './icons/UserIcon.tsx';
import { BookOpenIcon } from './icons/BookOpenIcon.tsx';

interface ChatSelectionModalProps {
  characters: Character[];
  lorebooks: Lorebook[];
  onClose: () => void;
  onCreateChat: (name: string, characterIds: string[], lorebookIds: string[]) => void;
}

export const ChatSelectionModal: React.FC<ChatSelectionModalProps> = ({ characters, lorebooks, onClose, onCreateChat }) => {
  const [selectedCharIds, setSelectedCharIds] = useState<Set<string>>(new Set());
  const [selectedLorebookIds, setSelectedLorebookIds] = useState<Set<string>>(new Set());
  const [chatName, setChatName] = useState('');

  const handleToggleCharacter = (id: string) => {
    setSelectedCharIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleToggleLorebook = (id: string) => {
    setSelectedLorebookIds(prev => {
        const newSet = new Set(prev);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        return newSet;
    });
  };

  useMemo(() => {
    const selectedChars = characters.filter(c => selectedCharIds.has(c.id));
    if (selectedChars.length === 1) {
      setChatName(`Chat with ${selectedChars[0].name}`);
    } else if (selectedChars.length > 1) {
      setChatName(selectedChars.map(c => c.name).join(', '));
    } else {
      setChatName('');
    }
  }, [selectedCharIds, characters]);

  const handleSubmit = () => {
    if (selectedCharIds.size === 0) {
      alert('Please select at least one character.');
      return;
    }
    if (!chatName.trim()) {
      alert('Please enter a name for the chat.');
      return;
    }
    onCreateChat(chatName.trim(), Array.from(selectedCharIds), Array.from(selectedLorebookIds));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-background-secondary rounded-lg shadow-xl w-full max-w-lg flex flex-col" onClick={e => e.stopPropagation()}>
        <header className="p-4 border-b border-border-neutral flex justify-between items-center flex-shrink-0">
          <h2 className="text-xl font-bold text-text-primary">Start a New Chat</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors text-2xl font-bold leading-none p-1">&times;</button>
        </header>
        
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
            <div>
                <label htmlFor="chat-name" className="block text-sm font-medium text-text-primary">Chat Name</label>
                <input
                    id="chat-name"
                    type="text"
                    value={chatName}
                    onChange={(e) => setChatName(e.target.value)}
                    required
                    className="mt-1 block w-full bg-background-primary border border-border-strong rounded-md shadow-sm py-2 px-3 text-text-primary placeholder-text-secondary focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                />
            </div>

            <div>
                 <label className="block text-sm font-medium text-text-primary">Select Characters ({selectedCharIds.size})</label>
                 <div className="mt-2 max-h-48 overflow-y-auto border border-border-neutral rounded-md p-2 space-y-2">
                    {characters.length === 0 ? (
                        <p className="text-text-secondary text-center p-4">No characters found. Please create one first.</p>
                    ) : characters.map(character => (
                        <div key={character.id} onClick={() => handleToggleCharacter(character.id)} className={`flex items-center p-2 rounded-md cursor-pointer transition-colors ${selectedCharIds.has(character.id) ? 'bg-primary-500/30' : 'hover:bg-background-tertiary'}`}>
                            <input
                                type="checkbox"
                                checked={selectedCharIds.has(character.id)}
                                readOnly
                                className="h-4 w-4 rounded border-border-strong bg-background-primary text-primary-500 focus:ring-primary-500 pointer-events-none"
                            />
                            <img src={character.avatarUrl || `https://picsum.photos/seed/${character.id}/40/40`} alt={character.name} className="w-8 h-8 rounded-full mx-3"/>
                            <div className="flex items-center space-x-2">
                                <span className="font-medium text-text-primary">{character.name}</span>
                                {character.characterType === 'narrator' 
                                    ? <BookOpenIcon className="w-4 h-4 text-text-secondary flex-shrink-0" title="Narrator/Scenario"/> 
                                    : <UserIcon className="w-4 h-4 text-text-secondary flex-shrink-0" title="Persona"/>}
                            </div>
                        </div>
                    ))}
                 </div>
            </div>

             <div>
                 <label className="block text-sm font-medium text-text-primary">Attach Lorebooks ({selectedLorebookIds.size})</label>
                 <div className="mt-2 max-h-48 overflow-y-auto border border-border-neutral rounded-md p-2 space-y-2">
                    {lorebooks.length === 0 ? (
                        <p className="text-text-secondary text-center p-4">No lorebooks found.</p>
                    ) : lorebooks.map(lorebook => (
                        <div key={lorebook.id} onClick={() => handleToggleLorebook(lorebook.id)} className={`flex items-center p-2 rounded-md cursor-pointer transition-colors ${selectedLorebookIds.has(lorebook.id) ? 'bg-primary-500/30' : 'hover:bg-background-tertiary'}`}>
                            <input
                                type="checkbox"
                                checked={selectedLorebookIds.has(lorebook.id)}
                                readOnly
                                className="h-4 w-4 rounded border-border-strong bg-background-primary text-primary-500 focus:ring-primary-500 pointer-events-none"
                            />
                            <span className="font-medium text-text-primary ml-3">{lorebook.name}</span>
                        </div>
                    ))}
                 </div>
            </div>
        </div>

        <footer className="p-4 border-t border-border-neutral flex justify-end space-x-3">
            <button onClick={onClose} className="py-2 px-4 rounded-md text-text-primary bg-background-tertiary hover:bg-opacity-80 font-medium">
                Cancel
            </button>
            <button onClick={handleSubmit} className="py-2 px-4 rounded-md text-text-accent bg-primary-600 hover:bg-primary-500 font-medium">
                Create Chat
            </button>
        </footer>
      </div>
    </div>
  );
};