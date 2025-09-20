import React from 'react';
import { Character } from '../types.ts';
import { PlusIcon } from './icons/PlusIcon.tsx';
import { TrashIcon } from './icons/TrashIcon.tsx';
import { EditIcon } from './icons/EditIcon.tsx';
import { DownloadIcon } from './icons/DownloadIcon.tsx';
import { ArchiveBoxIcon } from './icons/ArchiveBoxIcon.tsx';
import { RestoreIcon } from './icons/RestoreIcon.tsx';
import { UserIcon } from './icons/UserIcon.tsx';
import { BookOpenIcon } from './icons/BookOpenIcon.tsx';

interface CharacterListProps {
  characters: Character[];
  onDeleteCharacter: (id: string) => void;
  onEditCharacter: (character: Character) => void;
  onAddNew: () => void;
  onExportCharacter: (id: string) => void;
  showArchived: boolean;
  onToggleArchiveView: () => void;
  onRestoreCharacter: (id: string) => void;
  onPermanentlyDeleteCharacter: (id: string) => void;
}

export const CharacterList: React.FC<CharacterListProps> = ({
  characters,
  onDeleteCharacter,
  onEditCharacter,
  onAddNew,
  onExportCharacter,
  showArchived,
  onToggleArchiveView,
  onRestoreCharacter,
  onPermanentlyDeleteCharacter
}) => {
  return (
    <div className="flex-1 flex flex-col min-h-0">
       <div className="flex justify-between items-center mb-2 border-t border-border-neutral pt-4">
        <h2 className="text-lg font-semibold text-text-primary">{showArchived ? 'Archived Characters' : 'Characters'}</h2>
        <button
          onClick={onAddNew}
          className="p-2 rounded-md text-text-secondary hover:bg-background-tertiary hover:text-text-primary transition-colors"
          title="Add New Character"
        >
          <PlusIcon className="w-5 h-5" />
        </button>
      </div>
       <button 
        onClick={onToggleArchiveView}
        className="w-full flex items-center justify-center space-x-2 mb-2 text-sm py-2 px-3 rounded-md text-text-primary bg-background-tertiary hover:bg-opacity-80 transition-colors"
      >
        <ArchiveBoxIcon className="w-5 h-5" />
        <span>{showArchived ? 'View Active Characters' : 'View Archived Characters'}</span>
      </button>

      <div className="space-y-2 overflow-y-auto pr-2">
        {characters.length === 0 ? (
           <p className="text-text-secondary text-sm text-center py-4">
            {showArchived ? 'No archived characters.' : "No characters yet. Click '+' to create one."}
           </p>
        ) : (
          characters.map((char) => (
            <div
              key={char.id}
              className="group flex items-center p-2 rounded-lg bg-background-primary hover:bg-background-tertiary"
            >
              <div className="flex-1 flex items-center min-w-0">
                <img
                  src={char.avatarUrl || `https://picsum.photos/seed/${char.id}/40/40`}
                  alt={char.name}
                  className="w-10 h-10 rounded-full mr-3 flex-shrink-0"
                />
                <div className="min-w-0">
                  <div className="flex items-center space-x-2">
                    <p className="font-semibold truncate text-sm">{char.name}</p>
                    {char.characterType === 'narrator' 
                        ? <BookOpenIcon className="w-4 h-4 text-text-secondary flex-shrink-0" title="Narrator/Scenario"/> 
                        : <UserIcon className="w-4 h-4 text-text-secondary flex-shrink-0" title="Persona"/>}
                  </div>
                </div>
              </div>
              <div className="ml-2 flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {showArchived ? (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); onRestoreCharacter(char.id); }}
                      className="p-1 rounded text-text-secondary hover:text-text-primary hover:bg-background-primary"
                      title="Restore Character"
                    >
                      <RestoreIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onPermanentlyDeleteCharacter(char.id); }}
                      className="p-1 rounded text-text-secondary hover:text-accent-red hover:bg-background-primary"
                      title="Delete Permanently"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); onExportCharacter(char.id); }}
                      className="p-1 rounded text-text-secondary hover:text-text-primary hover:bg-background-primary"
                      title="Export Character"
                    >
                      <DownloadIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onEditCharacter(char); }}
                      className="p-1 rounded text-text-secondary hover:text-text-primary hover:bg-background-primary"
                      title="Edit Character"
                    >
                      <EditIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteCharacter(char.id); }}
                      className="p-1 rounded text-text-secondary hover:text-accent-red hover:bg-background-primary"
                      title="Archive Character"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};