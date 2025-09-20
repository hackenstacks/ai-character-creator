import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Character, ChatSession, Message, CryptoKeys, GeminiApiRequest, Lorebook } from '../types.ts';
import { streamChatResponse, streamGenericResponse, generateContent } from '../services/geminiService.ts';
import * as cryptoService from '../services/cryptoService.ts';
import * as ttsService from '../services/ttsService.ts';
import * as ragService from '../services/ragService.ts';
import * as lorebookService from '../services/lorebookService.ts';
import { logger } from '../services/loggingService.ts';
import { ChatBubbleIcon } from './icons/ChatBubbleIcon.tsx';
import { ImageIcon } from './icons/ImageIcon.tsx';
import { BookIcon } from './icons/BookIcon.tsx';
import { BrainIcon } from './icons/BrainIcon.tsx';
import { SpeakerIcon } from './icons/SpeakerIcon.tsx';
import { MemoryImportModal } from './MemoryImportModal.tsx';
import { CheckCircleIcon } from './icons/CheckCircleIcon.tsx';
import { ExclamationTriangleIcon } from './icons/ExclamationTriangleIcon.tsx';
import { PluginSandbox } from '../services/pluginSandbox.ts';
import { ImageGenerationWindow } from './ImageGenerationWindow.tsx';
import { PaletteIcon } from './icons/PaletteIcon.tsx';

interface ChatInterfaceProps {
  session: ChatSession;
  allCharacters: Character[];
  allChatSessions: ChatSession[];
  allLorebooks: Lorebook[];
  userKeys?: CryptoKeys;
  onSessionUpdate: (session: ChatSession) => void;
  onCharacterUpdate: (character: Character) => void;
  onTriggerHook: <T, R>(hookName: string, data: T) => Promise<R>;
  onMemoryImport: (fromSessionId: string, toSessionId: string) => void;
  onSaveBackup: () => void;
  handlePluginApiRequest: (request: GeminiApiRequest) => Promise<any>;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
    session, 
    allCharacters, 
    allChatSessions,
    allLorebooks,
    userKeys, 
    onSessionUpdate, 
    onCharacterUpdate, 
    onTriggerHook,
    onMemoryImport,
    onSaveBackup,
    handlePluginApiRequest,
}) => {
  const [currentSession, setCurrentSession] = useState<ChatSession>(session);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [autoConverseStatus, setAutoConverseStatus] = useState<'stopped' | 'running' | 'paused'>('stopped');
  const [isMemoryModalVisible, setIsMemoryModalVisible] = useState(false);
  const [isTtsEnabled, setIsTtsEnabled] = useState(false);
  const [verifiedSignatures, setVerifiedSignatures] = useState<Record<string, boolean>>({});
  const [isImageWindowVisible, setIsImageWindowVisible] = useState(false);

  const nextSpeakerIndex = useRef(0);
  const systemOverride = useRef<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const imageClickTimeout = useRef<number | null>(null);
  const narratorClickTimeout = useRef<number | null>(null);
  const autoConverseTimeout = useRef<number | null>(null);

  // Refs to avoid closure issues with state in timeouts/async calls
  const autoConverseStatusRef = useRef(autoConverseStatus);
  useEffect(() => {
    autoConverseStatusRef.current = autoConverseStatus;
  }, [autoConverseStatus]);

  const currentSessionRef = useRef(session);
  useEffect(() => {
    currentSessionRef.current = currentSession;
  }, [currentSession]);

  const participants = useMemo(() => {
    return allCharacters.filter(c => currentSession.characterIds.includes(c.id));
  }, [allCharacters, currentSession.characterIds]);

  const attachedLorebooks = useMemo(() => {
    return (currentSession.lorebookIds || []).map(id => allLorebooks.find(lb => lb.id === id)).filter(Boolean) as Lorebook[];
  }, [allLorebooks, currentSession.lorebookIds]);

  const avatarSizeClass = useMemo(() => {
    switch (currentSession.uiSettings?.avatarSize) {
      case 'small': return 'w-8 h-8';
      case 'large': return 'w-12 h-12';
      default: return 'w-10 h-10'; // Medium is default
    }
  }, [currentSession.uiSettings?.avatarSize]);

  useEffect(() => {
    if (session.id !== currentSessionRef.current.id) {
        setCurrentSession(session);
        if (autoConverseStatusRef.current !== 'stopped') {
            setAutoConverseStatus('stopped');
            if (autoConverseTimeout.current) clearTimeout(autoConverseTimeout.current);
        }
    }
  }, [session]);
  
  useEffect(() => {
    const verifyAllMessages = async () => {
        const verificationResults: Record<string, boolean> = {};
        for (const msg of currentSession.messages) {
            if (msg.signature && msg.publicKeyJwk) {
                try {
                    const publicKey = await cryptoService.importKey(msg.publicKeyJwk, 'verify');
                    const dataToVerify: Partial<Message> = { ...msg };
                    delete dataToVerify.signature;
                    delete dataToVerify.publicKeyJwk;
                    const canonicalString = cryptoService.createCanonicalString(dataToVerify);
                    verificationResults[msg.timestamp] = await cryptoService.verify(canonicalString, msg.signature, publicKey);
                } catch (e) {
                    logger.error("Message verification failed during check", e);
                    verificationResults[msg.timestamp] = false;
                }
            }
        }
        setVerifiedSignatures(verificationResults);
    };
    verifyAllMessages();
  }, [currentSession.messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentSession.messages, isStreaming]);
  
  useEffect(() => {
    return () => {
      if (autoConverseTimeout.current) clearTimeout(autoConverseTimeout.current);
      ttsService.cancel();
    }
  }, []);

  const updateSession = useCallback((updater: (session: ChatSession) => ChatSession) => {
    const newSession = updater(currentSessionRef.current);
    setCurrentSession(newSession);
    onSessionUpdate(newSession);
  }, [onSessionUpdate]);

  const addMessage = useCallback((message: Message) => {
    updateSession(prevSession => ({ ...prevSession, messages: [...prevSession.messages, message] }));
  }, [updateSession]);

  const addSystemMessage = useCallback((content: string) => {
    const systemMessage: Message = {
      role: 'narrator',
      content,
      timestamp: new Date().toISOString()
    };
    addMessage(systemMessage);
  }, [addMessage]);
  
  const triggerAIResponse = useCallback(async (character: Character, history: Message[], override?: string) => {
    if (history.filter(m => m.content).length === 0) {
      addSystemMessage("AI cannot respond to an empty history.");
      return;
    }

    let finalHistory = history;
    let finalOverride = override || '';

    // --- Lorebook Context Injection ---
    if (attachedLorebooks.length > 0) {
        const loreContext = lorebookService.findRelevantLore(history, attachedLorebooks);
        if (loreContext) {
            logger.log("Injecting Lorebook context for response.", { character: character.name });
            const contextInstruction = `[WORLD INFO]:\n${loreContext}`;
            finalOverride = `${contextInstruction}\n\n${finalOverride}`;
        }
    }

    if (character.pluginEnabled && character.pluginCode) {
        addSystemMessage(`Executing character logic for ${character.name}...`);
        try {
            const sandbox = new PluginSandbox(handlePluginApiRequest);
            await sandbox.loadCode(character.pluginCode);
            
            const hookPayload = { history, systemOverride: finalOverride };
            const modifiedPayload = await sandbox.executeHook<{history: Message[], systemOverride?: string}>('beforeResponseGenerate', hookPayload);
            
            finalHistory = modifiedPayload.history;
            finalOverride = modifiedPayload.systemOverride || '';
            
            sandbox.terminate();
            logger.log(`Character logic for "${character.name}" executed successfully.`);
        } catch (error) {
            logger.error(`Error executing character logic for "${character.name}":`, error);
            addSystemMessage(`Error in character logic for ${character.name}. See logs for details.`);
        }
    }


    setIsStreaming(true);
    const modelPlaceholder: Message = {
        role: 'model',
        content: '',
        timestamp: new Date().toISOString(),
        characterId: character.id
    };
    
    updateSession(current => ({ ...current, messages: [...finalHistory, modelPlaceholder] }));

    let fullResponse = '';
    
    try {
        await streamChatResponse(
            character,
            participants,
            finalHistory,
            (chunk) => {
                fullResponse += chunk;
                const messages = currentSessionRef.current.messages;
                const lastMessage = messages[messages.length - 1];
                if(lastMessage && lastMessage.timestamp === modelPlaceholder.timestamp) {
                    lastMessage.content = fullResponse;
                    const msgElement = document.getElementById(modelPlaceholder.timestamp);
                    if (msgElement) {
                       msgElement.innerHTML = fullResponse.replace(/\n/g, '<br>');
                    }
                }
            },
            finalOverride
        );
    } catch (error) {
        logger.error("Streaming failed:", error);
        fullResponse = "Sorry, an error occurred while responding.";
    } finally {
        setIsStreaming(false);

        const imageRegex = /\[generate_image:\s*(.*?)\]/g;
        const imageMatches = [...fullResponse.matchAll(imageRegex)];
        const cleanedResponse = fullResponse.replace(imageRegex, '').trim();

        if (cleanedResponse.length > 0 || imageMatches.length > 0) {
            let finalMessage: Message = { ...modelPlaceholder, content: cleanedResponse };
            
            if (character.keys) {
                try {
                    const privateKey = await cryptoService.importKey(character.keys.privateKey, 'sign');
                    finalMessage.publicKeyJwk = character.keys.publicKey;
                    const dataToSign: Partial<Message> = { ...finalMessage };
                    delete dataToSign.signature;
                    delete dataToSign.publicKeyJwk;
                    const canonicalString = cryptoService.createCanonicalString(dataToSign);
                    finalMessage.signature = await cryptoService.sign(canonicalString, privateKey);
                } catch (e) {
                    logger.error(`Failed to sign message for character ${character.name}`, e);
                }
            }
            
            if (isTtsEnabled && cleanedResponse) {
                ttsService.speak(cleanedResponse, character.voiceURI);
            }
            
            updateSession(current => {
                const updatedMessages = current.messages.map(msg =>
                    msg.timestamp === modelPlaceholder.timestamp ? finalMessage : msg
                );
                return { ...current, messages: updatedMessages };
            });

            for (const match of imageMatches) {
                const prompt = match[1];
                if (prompt) {
                    handleImageGeneration(prompt, 'direct');
                }
            }
        } else {
            updateSession(current => ({
                ...current,
                messages: current.messages.filter(m => m.timestamp !== modelPlaceholder.timestamp)
            }));
        }
    }
  }, [participants, isTtsEnabled, updateSession, addSystemMessage, handlePluginApiRequest, attachedLorebooks]);

  const continueAutoConversation = useCallback(async () => {
    if (autoConverseTimeout.current) clearTimeout(autoConverseTimeout.current);
    if (autoConverseStatusRef.current !== 'running' || participants.length < 2) {
        if (autoConverseStatusRef.current !== 'paused') {
            setAutoConverseStatus('stopped');
        }
        return;
    }
    
    const speaker = participants[nextSpeakerIndex.current % participants.length];
    nextSpeakerIndex.current += 1;
    const otherParticipantNames = participants.filter(p => p.id !== speaker.id).map(p => p.name).join(', ');
    const override = `You are in an automated conversation with ${otherParticipantNames}. Continue the conversation naturally based on the history. Your response should be directed at them, not a user. Do not act as a narrator.`;
    
    await triggerAIResponse(speaker, currentSessionRef.current.messages, override);

    if (autoConverseStatusRef.current === 'running') {
        autoConverseTimeout.current = window.setTimeout(() => continueAutoConversation(), 3000);
    }
  }, [participants, triggerAIResponse]);

  const startAutoConversation = useCallback(async (topic: string) => {
    const starterMessage: Message = {
        role: 'narrator',
        content: `[The AIs will now converse about: "${topic}"]`,
        timestamp: new Date().toISOString()
    };
    const updatedMessages = [...currentSessionRef.current.messages, starterMessage];
    updateSession(current => ({...current, messages: updatedMessages}));
    
    const firstSpeaker = participants[nextSpeakerIndex.current % participants.length];
    nextSpeakerIndex.current += 1;
    const otherParticipantNames = participants.filter(p => p.id !== firstSpeaker.id).map(p => p.name).join(', ');
    const override = `You are in an automated conversation with ${otherParticipantNames}. The user has set the topic: "${topic}". Start the conversation. Your response should be directed at them, not a user. Do not act as a narrator.`;

    await triggerAIResponse(firstSpeaker, updatedMessages, override);

    if (autoConverseStatusRef.current === 'running') {
        autoConverseTimeout.current = window.setTimeout(continueAutoConversation, 3000);
    }
  }, [participants, triggerAIResponse, updateSession, continueAutoConversation]);

  const handleCommand = async (command: string, args: string) => {
    setInput('');
    switch (command) {
        case 'image': {
            handleImageGeneration(args, 'direct');
            break;
        }
        case 'narrate': {
            handleNarration(args, 'direct');
            break;
        }
        case 'snapshot':
        case 'memorize': {
            const history = currentSessionRef.current.messages.slice(-10);
            if (history.length === 0) {
                addSystemMessage("Not enough conversation history to save a memory snapshot.");
                return;
            }
            addSystemMessage("Generating memory snapshot...");
            const context = history.map(m => `${m.role === 'model' ? allCharacters.find(c => c.id === m.characterId)?.name || 'AI' : 'User'}: ${m.content}`).join('\n');
            const prompt = `Summarize the key events, information, and character developments from this recent conversation snippet into a concise paragraph for a character's long-term memory. Focus on facts and relationship changes. Conversation:\n\n${context}`;
            
            try {
                const summary = await generateContent(prompt);
                participants.forEach(p => {
                    const updatedMemory = `${p.memory || ''}\n\n[Memory from ${new Date().toLocaleString()}]\n${summary}`;
                    onCharacterUpdate({...p, memory: updatedMemory.trim()});
                });
                addSystemMessage("Memory snapshot saved for all participants.");
            } catch (e) {
                logger.error("Failed to generate memory summary", e);
                addSystemMessage("Failed to generate memory summary. See logs for details.");
            }
            break;
        }
        case 'save': {
            addSystemMessage("Saving a full application backup... Your download will begin shortly.");
            onSaveBackup();
            break;
        }
        case 'sys': {
            systemOverride.current = args;
            addSystemMessage(`System override set for next AI response: "${args}"`);
            break;
        }
        case 'character': {
            const [charName, ...promptParts] = args.split(' ');
            const prompt = promptParts.join(' ');
            if (!charName || !prompt) {
                addSystemMessage("Usage: /character <name> <prompt>");
                return;
            }
            const target = participants.find(p => p.name.toLowerCase().startsWith(charName.toLowerCase()));
            if (!target) {
                addSystemMessage(`Character "${charName}" not found in this chat.`);
                return;
            }
            
            const targetIndex = participants.findIndex(p => p.id === target.id);
            nextSpeakerIndex.current = targetIndex;

            const userMessage = await createUserMessage(prompt);
            const newHistory = [...currentSessionRef.current.messages, userMessage];
            addMessage(userMessage);

            await triggerAIResponse(target, newHistory);
            break;
        }
        case 'converse': {
            if (autoConverseStatusRef.current !== 'stopped') {
                addSystemMessage("A conversation is already in progress. Use /end to stop it, or /pause to pause.");
                return;
            }
            if (participants.length > 1) {
                const topic = args || 'Anything at all.';
                setAutoConverseStatus('running');
                startAutoConversation(topic);
            } else {
                addSystemMessage("You need at least two characters in the chat to start a conversation.");
            }
            break;
        }
        case 'pause': {
            if (autoConverseStatusRef.current === 'running') {
                if (autoConverseTimeout.current) clearTimeout(autoConverseTimeout.current);
                setAutoConverseStatus('paused');
                addSystemMessage("AI conversation paused. Use /resume to continue.");
            } else if (autoConverseStatusRef.current === 'paused') {
                addSystemMessage("Conversation is already paused.");
            } else {
                 addSystemMessage("No conversation is running to pause.");
            }
            break;
        }
        case 'resume': {
             if (autoConverseStatusRef.current === 'paused') {
                setAutoConverseStatus('running');
                addSystemMessage("AI conversation resumed.");
                continueAutoConversation();
            } else if (autoConverseStatusRef.current === 'running') {
                addSystemMessage("Conversation is already running.");
            } else {
                addSystemMessage("No paused conversation to resume.");
            }
            break;
        }
        case 'quit':
        case 'end': {
            if (autoConverseStatusRef.current !== 'stopped') {
                if (autoConverseTimeout.current) clearTimeout(autoConverseTimeout.current);
                setAutoConverseStatus('stopped');
                addSystemMessage("AI conversation ended by user.");
            } else {
                addSystemMessage("No conversation is running to end.");
            }
            break;
        }
        default:
            addSystemMessage(`Unknown command: /${command}`);
    }
  };
  
  const createUserMessage = async (content: string): Promise<Message> => {
    let userMessage: Message = { role: 'user', content, timestamp: new Date().toISOString() };
    if (userKeys) {
        try {
            const privateKey = await cryptoService.importKey(userKeys.privateKey, 'sign');
            userMessage.publicKeyJwk = userKeys.publicKey;
            const dataToSign: Partial<Message> = { ...userMessage };
            delete dataToSign.signature;
            delete dataToSign.publicKeyJwk;
            const canonicalString = cryptoService.createCanonicalString(dataToSign);
            userMessage.signature = await cryptoService.sign(canonicalString, privateKey);
        } catch(e) {
            logger.error("Failed to sign user message", e);
        }
    }
    return userMessage;
  };
  
  const handleSendMessage = useCallback(async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput) return;
    
    if (isStreaming && autoConverseStatusRef.current === 'stopped') return;

    if (autoConverseTimeout.current) clearTimeout(autoConverseTimeout.current);
    if (autoConverseStatusRef.current !== 'stopped') {
        setAutoConverseStatus('stopped');
        addSystemMessage("AI conversation stopped by user message.");
    }
    
    if (trimmedInput.startsWith('/')) {
        const [command, ...argsParts] = trimmedInput.substring(1).split(' ');
        const args = argsParts.join(' ');
        handleCommand(command.toLowerCase(), args);
        return;
    }

    const userMessage = await createUserMessage(trimmedInput);
    const newHistory = [...currentSessionRef.current.messages, userMessage];
    addMessage(userMessage);
    setInput('');

    if (participants.length > 0) {
        const respondent = participants[nextSpeakerIndex.current % participants.length];
        nextSpeakerIndex.current += 1;
        
        let finalSystemOverride = systemOverride.current;
        if (respondent.ragEnabled) {
            try {
                const ragContext = await ragService.findRelevantContext(trimmedInput, respondent);
                if (ragContext) {
                    logger.log("Injecting RAG context for response.", { character: respondent.name });
                    const contextInstruction = `[ADDITIONAL CONTEXT FROM KNOWLEDGE BASE]:\n${ragContext}`;
                    finalSystemOverride = finalSystemOverride
                        ? `${contextInstruction}\n\n${finalSystemOverride}`
                        : contextInstruction;
                }
            } catch (e) {
                logger.error("RAG context retrieval failed:", e);
                addSystemMessage(`Could not retrieve context for ${respondent.name}. Check embedding API settings.`);
            }
        }

        await triggerAIResponse(respondent, newHistory, finalSystemOverride || undefined);
        
        if (systemOverride.current) {
            systemOverride.current = null;
        }
    }

  }, [input, isStreaming, participants, addMessage, addSystemMessage, triggerAIResponse, userKeys, handleCommand]);
  
  const handleImageGeneration = async (prompt: string, type: 'direct' | 'summary') => {
      const attachmentMessage: Message = {
          role: 'narrator',
          content: `Generating image for prompt: "${type === 'summary' ? 'Summarizing context...' : prompt}"`,
          timestamp: new Date().toISOString(),
          attachment: { type: 'image', status: 'loading', prompt }
      };
      addMessage(attachmentMessage);
      
      try {
        const payload = type === 'summary'
            ? { type: 'summary', value: prompt }
            : { type: 'direct', value: prompt };
            
        const result = await onTriggerHook<{type: string, value: string}, {url?: string, error?: string}>('generateImage', payload);

        if (result.url) {
            updateSession(curr => {
                const updatedMessages = curr.messages.map((m): Message => m.timestamp === attachmentMessage.timestamp 
                    ? { ...m, content: '', attachment: { ...m.attachment!, status: 'done', url: result.url } }
                    : m
                );
                return { ...curr, messages: updatedMessages };
            });
        } else {
            throw new Error(result.error || 'Image generation failed with no message.');
        }
      } catch (error) {
           const errorMessage = error instanceof Error ? error.message : String(error);
           logger.error('Image generation failed:', error);
           updateSession(curr => {
                const updatedMessages = curr.messages.map((m): Message => m.timestamp === attachmentMessage.timestamp 
                    ? { ...m, content: `Image generation failed: ${errorMessage}`, attachment: { ...m.attachment!, status: 'error' } }
                    : m
                );
                return { ...curr, messages: updatedMessages };
            });
      }
  };

  const handleGenerateImageInWindow = useCallback(async (prompt: string) => {
    logger.log("Generating image in floating window for prompt:", prompt);
    const payload = { type: 'direct', value: prompt };
    const result = await onTriggerHook<{type: string, value: string}, {url?: string, error?: string}>('generateImage', payload);
    return result;
  }, [onTriggerHook]);
  
  const handleNarration = async (prompt: string, type: 'direct' | 'summary') => {
    let finalPrompt = prompt;
    if (type === 'summary') {
        const summaryPrompt = `Based on the following conversation, create a short, descriptive narration of the current scene or situation. Be creative and concise. Conversation:\n\n${prompt}`;
        try {
            finalPrompt = await generateContent(summaryPrompt);
        } catch(e) {
            addSystemMessage("Failed to summarize context for narration.");
            return;
        }
    }
    
    const narratorPlaceholder: Message = { role: 'narrator', content: '', timestamp: new Date().toISOString() };
    addMessage(narratorPlaceholder);
    
    let fullResponse = '';
    await streamGenericResponse(
        "You are a neutral, third-person narrator for a story. Describe the scene or events based on the user's request.",
        finalPrompt,
        (chunk) => {
            fullResponse += chunk;
            const msgElement = document.getElementById(narratorPlaceholder.timestamp);
            if (msgElement) {
                msgElement.innerHTML = fullResponse.replace(/\n/g, '<br>');
            }
        }
    );
     updateSession(curr => {
        const finalMessages = curr.messages.map(m => m.timestamp === narratorPlaceholder.timestamp ? {...m, content: fullResponse} : m);
        return { ...curr, messages: finalMessages };
    });
  };

  const handleImageButtonClick = () => {
    if (imageClickTimeout.current) {
      clearTimeout(imageClickTimeout.current);
      imageClickTimeout.current = null;
      const context = currentSessionRef.current.messages.slice(-5).map(m => `${m.role}: ${m.content}`).join('\n');
      handleImageGeneration(context, 'summary');
    } else {
      imageClickTimeout.current = window.setTimeout(() => {
        const prompt = window.prompt("Enter a prompt for the image:");
        if (prompt) handleImageGeneration(prompt, 'direct');
        imageClickTimeout.current = null;
      }, 250);
    }
  };

  const handleNarratorButtonClick = () => {
    if (narratorClickTimeout.current) {
      clearTimeout(narratorClickTimeout.current);
      narratorClickTimeout.current = null;
      const context = currentSessionRef.current.messages.slice(-5).map(m => `${m.role}: ${m.content}`).join('\n');
      handleNarration(context, 'summary');
    } else {
      narratorClickTimeout.current = window.setTimeout(() => {
        const prompt = window.prompt("Enter a narration instruction (e.g., 'Describe the weather changing'):");
        if (prompt) handleNarration(prompt, 'direct');
        narratorClickTimeout.current = null;
      }, 250);
    }
  };
  
  const renderMessageContent = (message: Message) => {
    if (message.attachment?.type === 'image') {
        switch(message.attachment.status) {
            case 'loading': return <div className="p-4 text-center">Generating image...</div>;
            case 'done': return <img src={message.attachment.url} alt={message.attachment.prompt || 'Generated Image'} className="rounded-lg max-w-sm" />;
            case 'error': return null;
        }
    }
    return <span id={message.timestamp} dangerouslySetInnerHTML={{ __html: message.content.replace(/\n/g, '<br />') }} />;
  };
  
  const getCharacterById = (id: string) => allCharacters.find(c => c.id === id);

  const isInputDisabled = isStreaming && autoConverseStatus === 'stopped';

  return (
    <div className="flex flex-col h-full bg-background-primary">
      {isImageWindowVisible && (
        <ImageGenerationWindow 
            onGenerate={handleGenerateImageInWindow}
            onClose={() => setIsImageWindowVisible(false)}
        />
      )}
      {isMemoryModalVisible && (
        <MemoryImportModal 
            allSessions={allChatSessions}
            currentSessionId={currentSession.id}
            onClose={() => setIsMemoryModalVisible(false)}
            onImport={(fromSessionId) => {
                onMemoryImport(fromSessionId, currentSession.id);
                setIsMemoryModalVisible(false);
            }}
        />
      )}
      <header className="flex items-center p-3 border-b border-border-neutral">
        <div className="flex -space-x-4">
            {participants.slice(0, 3).map(p => (
                <img key={p.id} src={p.avatarUrl || `https://picsum.photos/seed/${p.id}/40/40`} alt={p.name} className="w-10 h-10 rounded-full border-2 border-background-primary"/>
            ))}
        </div>
        <div className="ml-4 flex-1 min-w-0">
          <h2 className="text-lg font-bold text-text-primary truncate">{session.name}</h2>
          <p className="text-sm text-text-secondary truncate">{participants.map(p=>p.name).join(', ')}</p>
        </div>
      </header>

      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {currentSession.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-secondary">
            <ChatBubbleIcon className="w-16 h-16 mb-4" />
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          currentSession.messages.map((msg, index) => {
            if (msg.role === 'narrator') {
              return (
                <div key={index} className="text-center my-2 group relative">
                  <p id={msg.timestamp} className="text-sm text-text-secondary italic px-4">{renderMessageContent(msg)}</p>
                  <div className="absolute top-1/2 -translate-y-1/2 right-0 flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                     <button onClick={() => ttsService.speak(msg.content)} title="Read Aloud" className="p-1 rounded-full text-text-secondary hover:bg-background-tertiary">
                        <SpeakerIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            }
            const msgCharacter = msg.characterId ? getCharacterById(msg.characterId) : null;
            const isUser = msg.role === 'user';
            const characterVoiceURI = msg.role === 'model' && msgCharacter ? msgCharacter.voiceURI : undefined;
            return (
              <div key={index} className={`flex items-start gap-3 group ${isUser ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'model' && msgCharacter && (
                  <img src={msgCharacter.avatarUrl || `https://picsum.photos/seed/${msgCharacter.id}/40/40`} alt={msgCharacter.name} className={`${avatarSizeClass} rounded-full flex-shrink-0`} title={msgCharacter.name}/>
                )}
                <div className={`relative max-w-xl p-3 rounded-lg ${
                    isUser
                      ? 'bg-primary-600 text-text-accent'
                      : 'bg-background-secondary text-text-primary'
                  }`}>
                  <div className="absolute top-0 -translate-y-1/2 flex items-center opacity-0 group-hover:opacity-100 transition-opacity" style={isUser ? {left: '-2rem'} : {right: '-2rem'}}>
                     <button onClick={() => ttsService.speak(msg.content, characterVoiceURI)} title="Read Aloud" className="p-1 rounded-full text-text-secondary bg-background-tertiary hover:bg-opacity-80">
                        <SpeakerIcon className="w-4 h-4" />
                    </button>
                  </div>
                  {msg.role === 'model' && msgCharacter && <p className="font-bold text-sm mb-1">{msgCharacter.name}</p>}
                  {renderMessageContent(msg)}
                  {msg.signature && (
                    <div className="absolute -bottom-2 -right-2 bg-background-primary rounded-full p-0.5">
                        {verifiedSignatures[msg.timestamp] === true && <CheckCircleIcon className="w-4 h-4 text-accent-green" title="Signature Verified" />}
                        {verifiedSignatures[msg.timestamp] === false && <ExclamationTriangleIcon className="w-4 h-4 text-accent-yellow" title="Signature Invalid" />}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-border-neutral">
        <div className="flex items-center bg-background-secondary rounded-lg p-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
            placeholder={
                autoConverseStatus === 'running' ? "AI conversation in progress... (/pause or /end)" :
                autoConverseStatus === 'paused' ? "AI conversation paused. (/resume or /end)" :
                `Message ${session.name}... (/converse)`
            }
            className="flex-1 bg-transparent resize-none focus:outline-none px-2 text-text-primary"
            rows={1}
            disabled={isInputDisabled}
          />
          <button 
                onClick={() => setIsImageWindowVisible(!isImageWindowVisible)} 
                title="Open Image Generation Window" 
                className={`p-2 rounded-full transition-colors ${isImageWindowVisible ? 'text-primary-500' : 'text-text-secondary hover:text-primary-500'}`} disabled={isInputDisabled}
            >
                <PaletteIcon className="w-6 h-6" />
            </button>
            <button 
                onClick={() => setIsTtsEnabled(!isTtsEnabled)} 
                title={isTtsEnabled ? "Disable Auto-TTS" : "Enable Auto-TTS for AI Responses"} 
                className={`p-2 rounded-full transition-colors ${isTtsEnabled ? 'text-primary-500' : 'text-text-secondary hover:text-primary-500'}`} disabled={isInputDisabled}
            >
                <SpeakerIcon className="w-6 h-6" />
            </button>
          <button onClick={() => setIsMemoryModalVisible(true)} title="Import Memory From Another Chat" className="p-2 text-text-secondary hover:text-primary-500 disabled:opacity-50" disabled={isInputDisabled}>
            <BrainIcon className="w-6 h-6" />
          </button>
          <button onClick={handleNarratorButtonClick} title="Narrate (Single-click for prompt, double-click for auto)" className="p-2 text-text-secondary hover:text-primary-500 disabled:opacity-50" disabled={isInputDisabled}>
            <BookIcon className="w-6 h-6" />
          </button>
          <button onClick={handleImageButtonClick} title="Generate Image (Single-click for prompt, double-click for auto)" className="p-2 text-text-secondary hover:text-primary-500 disabled:opacity-50" disabled={isInputDisabled}>
            <ImageIcon className="w-6 h-6" />
          </button>
          <button onClick={handleSendMessage} disabled={!input.trim() || isInputDisabled} className="p-2 text-text-secondary hover:text-primary-500 disabled:opacity-50" title="Send message">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
};