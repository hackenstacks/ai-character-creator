import React from 'react';

interface HelpModalProps {
  onClose: () => void;
}

const HelpSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="mb-6">
    <h2 className="text-2xl font-bold text-primary-500 border-b-2 border-border-neutral pb-2 mb-3">{title}</h2>
    <div className="space-y-3 text-text-primary">{children}</div>
  </section>
);

const HelpSubSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="mt-4 pl-4 border-l-4 border-border-neutral">
        <h3 className="text-xl font-semibold text-text-primary mb-2">{title}</h3>
        <div className="space-y-2 text-text-secondary">{children}</div>
    </div>
);


export const HelpModal: React.FC<HelpModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-background-secondary rounded-lg shadow-xl w-full max-w-4xl h-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <header className="p-4 border-b border-border-neutral flex justify-between items-center flex-shrink-0">
          <h2 className="text-xl font-bold text-text-primary">AI Nexus Help Center</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors text-2xl font-bold leading-none p-1">&times;</button>
        </header>
        <div className="flex-1 p-6 overflow-y-auto">
            
            <HelpSection title="Getting Started">
                <p>Welcome to AI Nexus! This guide will help you understand all the features of the application.</p>
                <HelpSubSection title="The Master Password">
                    <p>On your first visit, AI Nexus prompts you to create a Master Password. This password is crucial as it encrypts all your application data (characters, chats, plugins) before saving it to your browser's local database (IndexedDB).</p>
                    <p className="font-bold text-accent-yellow">This is a zero-knowledge system. If you forget your password, there is no way to recover it. Your data will be inaccessible.</p>
                </HelpSubSection>
            </HelpSection>

            <HelpSection title="Data Management & Compatibility">
                 <p>AI Nexus is designed to be open and compatible. You have full control over your data.</p>
                <HelpSubSection title="Smart Import">
                    <p>Click the `Import` button in the sidebar to open a file picker. AI Nexus automatically detects what you are importing:</p>
                    <ul className="list-disc list-inside space-y-2">
                        <li><strong>Character Card (.json):</strong> Imports a character from another platform (like SillyTavern, Chub, etc.). This will add the character to your list without overwriting other data.</li>
                        <li><strong>Lorebook / World Info (.json):</strong> Imports a compatible lorebook file, such as those used in SillyTavern.</li>
                        <li><strong>Chat Session (.json):</strong> Imports a chat history file that was exported from AI Nexus.</li>
                        <li><strong>Full Backup (.json):</strong> A full backup file from AI Nexus. Importing this will ask for confirmation before overwriting all your current data.</li>
                    </ul>
                </HelpSubSection>
                 <HelpSubSection title="Granular Export">
                    <p>You can export data in several ways:</p>
                    <ul className="list-disc list-inside space-y-2">
                        <li><strong>Export Character:</strong> Click the download icon next to any character's name to save them as a universal `.json` character card.</li>
                         <li><strong>Export Lorebook:</strong> Go to the Lorebook manager and click the download icon next to any lorebook.</li>
                        <li><strong>Export Chat:</strong> Click the download icon next to any chat's name to save the conversation history as a `.json` file.</li>
                        <li><strong>Save Backup:</strong> Click the `Save Backup` button in the sidebar to save a full backup of your entire instance.</li>
                    </ul>
                 </HelpSubSection>
            </HelpSection>
            
             <HelpSection title="Lorebooks (World Info)">
                <p>Lorebooks are collections of information about your world, its characters, items, or rules. They make your AI characters knowledgeable and consistent without needing to manually remind them of details.</p>
                <HelpSubSection title="How It Works">
                     <p>You can create Lorebooks in the `Lorebooks` section (globe icon in the sidebar). Each Lorebook contains entries, and each entry has a set of **keywords** and some **content**.</p>
                     <p>When you start a new chat, you can **attach** one or more Lorebooks. As you talk, if a keyword from an attached lorebook appears in the recent conversation, its content is invisibly added to the AI's context for its next response. This gives the AI the information it needs, right when it needs it.</p>
                     <p>For example, you could have an entry with keywords `["The Crystal of Zarthus", "crystal"]` and content describing the crystal's magical properties. Whenever you mention the crystal, the AI will automatically know what it is.</p>
                </HelpSubSection>
            </HelpSection>

            <HelpSection title="The Chat Interface">
                 <p>Select or create a chat to begin a conversation. You can create chats with a single character or a group of characters for complex interactions.</p>
                 <HelpSubSection title="Slash Commands">
                    <p>Use slash commands in the chat input for special actions:</p>
                    <ul className="list-disc list-inside space-y-1">
                        <li><code className="bg-background-tertiary px-1 rounded">/image [prompt]</code> - Generates an image.</li>
                        <li><code className="bg-background-tertiary px-1 rounded">/narrate [prompt]</code> - Adds a narrative description to the scene.</li>
                        <li><code className="bg-background-tertiary px-1 rounded">/snapshot</code> or <code className="bg-background-tertiary px-1 rounded">/memorize</code> - Summarizes recent events and saves them to the characters' long-term memory.</li>
                        <li><code className="bg-background-tertiary px-1 rounded">/save</code> - Triggers a download of a full application backup file.</li>
                        <li><code className="bg-background-tertiary px-1 rounded">/sys [instruction]</code> - Provides a one-time system instruction for the AI's next response.</li>
                        <li><code className="bg-background-tertiary px-1 rounded">/character [name] [prompt]</code> - Address a specific character in a group chat.</li>
                        <li><code className="bg-background-tertiary px-1 rounded">/converse [optional topic]</code> - (Group chats only) AIs will start talking to each other.</li>
                        <li><code className="bg-background-tertiary px-1 rounded">/pause</code> - Pauses an ongoing AI conversation.</li>
                        <li><code className="bg-background-tertiary px-1 rounded">/resume</code> - Resumes a paused AI conversation.</li>
                        <li><code className="bg-background-tertiary px-1 rounded">/end</code> or <code className="bg-background-tertiary px-1 rounded">/quit</code> - Stops an ongoing AI conversation.</li>
                    </ul>
                 </HelpSubSection>
                 <HelpSubSection title="Action Buttons">
                    <p>Next to the input field, you'll find powerful action buttons:</p>
                    <ul className="list-disc list-inside space-y-2">
                       <li><strong>Import Memory (Brain Icon):</strong> Allows a character to "remember" things from other chats. Click it, select another chat session, and any shared characters will have their memories from that session appended to their current memory. Great for continuity across different scenarios.</li>
                       <li><strong>Narrator (Book Icon):</strong>
                           <br/>- **Single-Click:** Prompts you to enter a narration instruction (e.g., "Describe the weather changing").
                           <br/>- **Double-Click:** The AI narrates the current situation based on the last few messages.
                       </li>
                       <li><strong>Image Generation (Image Icon):</strong>
                           <br/>- **Single-Click:** Prompts you to enter a prompt for image generation.
                           <br/>- **Double-Click:** The AI creates an image prompt by summarizing the recent chat context.
                       </li>
                       <li><strong>Text-to-Speech (Speaker Icon):</strong>
                           <br/>- A speaker icon appears on every message; click it to read that message aloud.
                           <br/>- In the chat header, a master TTS toggle will automatically read new AI responses as they arrive.
                       </li>
                    </ul>
                 </HelpSubSection>
            </HelpSection>

            <HelpSection title="Plugin System">
                <p>Plugins are custom JavaScript snippets that can extend AI Nexus's functionality. They run in a secure, sandboxed environment.</p>
                <HelpSubSection title="Configuring the Image Generator">
                    <p>The default "Image Generation" plugin is highly configurable. Go to `Plugins` and click its edit icon to:</p>
                    <ul className="list-disc list-inside">
                        <li>Select a preset art style to apply to all generations.</li>
                        <li>Add a global "Negative Prompt" to exclude unwanted elements from images.</li>
                        <li>Set a specific API (e.g., DALL-E via an OpenAI-compatible endpoint) just for image generation, separate from your chat characters.</li>
                    </ul>
                </HelpSubSection>
            </HelpSection>

        </div>
      </div>
    </div>
  );
};