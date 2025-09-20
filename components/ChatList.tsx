import React from 'react';
import { ChatSession, Character } from '../types.ts';
import { TrashIcon } from './icons/TrashIcon.tsx';
import { UsersIcon } from './icons/UsersIcon.tsx';
import { DownloadIcon } from './icons/DownloadIcon.tsx';
import { ArchiveBoxIcon } from './icons/ArchiveBoxIcon.tsx';
import { RestoreIcon } from './icons/RestoreIcon.tsx';

interface ChatListProps {
  chatSessions: ChatSession[];
  characters: Character[];
  selectedChatId?: string | null;
  onSelectChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onExportChat: (id: string) => void;
  showArchived: boolean;
  onToggleArchiveView: () => void;
  onRestoreChat: (id: string) => void;
  onPermanentlyDeleteChat: (id: string) => void;
}

export const ChatList: React.FC<ChatListProps> = ({
  chatSessions,
  characters,
  selectedChatId,
  onSelectChat,
  onDeleteChat,
  onExportChat,
  showArchived,
  onToggleArchiveView,
  onRestoreChat,
  onPermanentlyDeleteChat
}) => {
  const getCharacter = (id: string) => characters.find(c => c.id === id);

  return (
    <div className="flex-1 flex flex-col min-h-0">
       <button 
        onClick={onToggleArchiveView}
        className="w-full flex items-center justify-center space-x-2 mb-2 text-sm py-2 px-3 rounded-md text-text-primary bg-background-tertiary hover:bg-opacity-80 transition-colors"
      >
        <ArchiveBoxIcon className="w-5 h-5" />
        <span>{showArchived ? 'View Active Chats' : 'View Archived Chats'}</span>
      </button>

      <div className="overflow-y-auto pr-2 space-y-2">
        {chatSessions.length === 0 ? (
          <p className="text-text-secondary text-sm text-center py-4">
            {showArchived ? 'No archived chats.' : "No chats yet. Click '+' to start a new conversation."}
          </p>
        ) : (
          chatSessions.map((session) => {
            const participants = session.characterIds.map(getCharacter).filter(Boolean) as Character[];
            
            return (
              <div
                key={session.id}
                onClick={() => onSelectChat(session.id)}
                className={`group flex items-center p-3 rounded-lg cursor-pointer transition-colors ${
                  selectedChatId === session.id
                    ? 'bg-primary-600 text-text-accent'
                    : 'bg-background-primary hover:bg-background-tertiary'
                }`}
              >
                <div className="flex-shrink-0 mr-3">
                  {participants.length === 1 ? (
                    <img
                      src={participants[0].avatarUrl || `https://picsum.photos/seed/${participants[0].id}/40/40`}
                      alt={participants[0].name}
                      className="w-10 h-10 rounded-full"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-background-tertiary flex items-center justify-center">
                        <UsersIcon className="w-6 h-6 text-text-primary" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold truncate ${selectedChatId === session.id ? 'text-text-accent' : 'text-text-primary'}`}>{session.name}</p>
                  <p className={`text-sm truncate ${selectedChatId === session.id ? 'text-white/70' : 'text-text-secondary group-hover:text-text-primary'}`}>
                    {participants.length > 0 ? participants.map(p => p.name).join(', ') : 'Empty Chat'}
                  </p>
                </div>
                 <div className="ml-2 flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {showArchived ? (
                        <>
                            <button
                                onClick={(e) => { e.stopPropagation(); onRestoreChat(session.id); }}
                                className={`p-1 rounded hover:bg-background-primary ${selectedChatId === session.id ? 'text-white/70 hover:text-white' : 'text-text-secondary hover:text-text-primary'}`}
                                title="Restore Chat"
                            >
                                <RestoreIcon className="w-4 h-4" />
                            </button>
                             <button
                                onClick={(e) => { e.stopPropagation(); onPermanentlyDeleteChat(session.id); }}
                                className={`p-1 rounded hover:bg-background-primary hover:text-accent-red ${selectedChatId === session.id ? 'text-white/70' : 'text-text-secondary'}`}
                                title="Delete Permanently"
                            >
                                <TrashIcon className="w-4 h-4" />
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                onClick={(e) => { e.stopPropagation(); onExportChat(session.id); }}
                                className={`p-1 rounded hover:bg-background-tertiary ${selectedChatId === session.id ? 'text-white/70 hover:text-white' : 'text-text-secondary hover:text-text-primary'}`}
                                title="Export Chat"
                            >
                                <DownloadIcon className="w-4 h-4" />
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); onDeleteChat(session.id); }}
                                className={`p-1 rounded hover:bg-background-tertiary hover:text-accent-red ${selectedChatId === session.id ? 'text-white/70' : 'text-text-secondary'}`}
                                title="Archive Chat"
                            >
                                <TrashIcon className="w-4 h-4" />
                            </button>
                        </>
                    )}
                 </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};