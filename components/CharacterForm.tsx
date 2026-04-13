
import React, { useState, useRef, useEffect } from 'react';
import { Character, RagSource, ApiConfig } from '../types';
import { logger } from '../services/loggingService';
import * as ragService from '../services/ragService';
import * as geminiService from '../services/geminiService';
import { PlusIcon } from './icons/PlusIcon';
import { TrashIcon } from './icons/TrashIcon';
import { UploadIcon } from './icons/UploadIcon';
import { ImageIcon } from './icons/ImageIcon';
import { SpinnerIcon } from './icons/SpinnerIcon';
import { SparklesIcon } from './icons/SparklesIcon';
import { CogIcon } from './icons/CogIcon';
import { VaultIcon } from './icons/VaultIcon';

interface CharacterFormProps {
    character: Character | null;
    onSave: (character: Character) => void;
    onCancel: () => void;
    onDeleteRagSource: (characterId: string, sourceId: string) => void;
    onGenerateImage: (prompt: string) => Promise<string | null>;
    onOpenVaultSelection: (onConfirm: (ids: string[]) => void) => void; // Callback to open vault in selection mode
}

export const CharacterForm: React.FC<CharacterFormProps> = ({ character, onSave, onCancel, onDeleteRagSource, onGenerateImage, onOpenVaultSelection }) => {
    const [formState, setFormState] = useState<Character>(character || {
        id: crypto.randomUUID(),
        name: '',
        description: '',
        personality: '',
        backstory: '',
        firstMessage: '',
        avatarUrl: '',
        tags: [],
        createdAt: new Date().toISOString(),
        characterType: 'character',
        ragEnabled: false,
        useSearchGrounding: false,
        thinkingBudget: 0,
        embeddingConfig: { service: 'gemini' },
        vaultAttachmentIds: []
    });
    
    // Ensure embedding config is initialized even if loading an old character
    useEffect(() => {
        if (character && !character.embeddingConfig) {
            setFormState(prev => ({
                ...prev,
                embeddingConfig: { service: 'gemini' }
            }));
        }
    }, [character]);
    
    const [indexingStatus, setIndexingStatus] = useState<string | null>(null);
    const [isGeneratingAvatar, setIsGeneratingAvatar] = useState(false);
    const [isGeneratingText, setIsGeneratingText] = useState<string | null>(null); // 'description' | 'personality' etc
    const [activeTab, setActiveTab] = useState<'basic' | 'details' | 'advanced' | 'memory'>('basic');
    
    const ragFileInputRef = useRef<HTMLInputElement>(null);
    const avatarInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (character) {
            setFormState(character);
        }
    }, [character]);

    const handleChange = (field: keyof Character, value: any) => {
        setFormState(prev => ({ ...prev, [field]: value }));
    };

    const handleNestedChange = (parent: keyof Character, key: string, value: any) => {
        setFormState(prev => ({
            ...prev,
            [parent]: {
                ...(prev[parent] as object),
                [key]: value
            }
        }));
    };

    const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                handleChange('avatarUrl', ev.target?.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleGenerateAvatar = async () => {
        if (!formState.description) {
            alert("Please enter a description first.");
            return;
        }
        setIsGeneratingAvatar(true);
        try {
            const prompt = `A portrait of a character matching this description: ${formState.description}. ${formState.physicalAppearance || ''} ${formState.name}`;
            const url = await onGenerateImage(prompt);
            if (url) {
                handleChange('avatarUrl', url);
            }
        } catch (e) {
            logger.error("Avatar generation failed", e);
            alert("Failed to generate avatar.");
        } finally {
            setIsGeneratingAvatar(false);
        }
    };

    const handleAIGenerate = async (field: keyof Character, promptTemplate: string) => {
        if (!formState.name) {
            alert("Please enter a character name first.");
            return;
        }
        setIsGeneratingText(field as string);
        try {
            // Use the summaryApiConfig if available, else default
            const config = formState.summaryApiConfig || { service: 'default' };
            const prompt = promptTemplate.replace('{{name}}', formState.name).replace('{{desc}}', formState.description || 'a generic character');
            
            const content = await geminiService.generateContent(prompt, config);
            handleChange(field, content.trim());
        } catch (e) {
            logger.error(`Failed to generate ${field}`, e);
            alert(`Failed to generate content: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setIsGeneratingText(null);
        }
    };

    const handleRagFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            setIndexingStatus(`Processing "${file.name}"...`);
            const newSource = await ragService.processAndIndexFile(file, formState, (progress) => {
                setIndexingStatus(progress);
            });

            const updatedCharacter = {
                ...formState,
                ragSources: [...(formState.ragSources || []), newSource]
            };
            setFormState(updatedCharacter);
            onSave(updatedCharacter); // Persist immediately
            setIndexingStatus(`Successfully indexed "${file.name}"!`);
        } catch (error) {
            logger.error("File indexing failed:", error);
            setIndexingStatus(`Error indexing "${file.name}": ${error instanceof Error ? error.message : "Unknown error"}`);
        } finally {
            if (ragFileInputRef.current) ragFileInputRef.current.value = "";
            setTimeout(() => setIndexingStatus(null), 5000);
        }
    };
    
    const handleAttachVaultItems = () => {
        onOpenVaultSelection((selectedIds) => {
            const currentIds = new Set(formState.vaultAttachmentIds || []);
            selectedIds.forEach(id => currentIds.add(id));
            handleChange('vaultAttachmentIds', Array.from(currentIds));
        });
    };
    
    const handleRemoveVaultItem = (id: string) => {
        const updatedIds = (formState.vaultAttachmentIds || []).filter(vid => vid !== id);
        handleChange('vaultAttachmentIds', updatedIds);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formState);
    };

    const renderAIGenButton = (field: keyof Character, prompt: string, tooltip: string) => (
        <button
            type="button"
            onClick={() => handleAIGenerate(field, prompt)}
            disabled={!!isGeneratingText}
            className="absolute top-0 right-0 p-1 text-primary-500 hover:text-primary-400 disabled:opacity-50"
            title={tooltip}
        >
            {isGeneratingText === field ? <SpinnerIcon className="w-4 h-4 animate-spin"/> : <SparklesIcon className="w-4 h-4"/>}
        </button>
    );

    return (
        <div className="flex-1 flex flex-col bg-background-primary overflow-hidden">
            <header className="p-4 border-b border-border-neutral flex items-center justify-between">
                <h2 className="text-xl font-bold text-text-primary">{character ? 'Edit Character' : 'New Character'}</h2>
                <div className="space-x-3">
                    <button onClick={onCancel} className="px-4 py-2 rounded text-text-primary bg-background-tertiary hover:bg-opacity-80">Cancel</button>
                    <button onClick={handleSubmit} className="px-4 py-2 rounded text-text-accent bg-primary-600 hover:bg-primary-500">Save</button>
                </div>
            </header>
            
            <div className="flex border-b border-border-neutral bg-background-secondary overflow-x-auto">
                <button onClick={() => setActiveTab('basic')} className={`px-4 py-3 text-sm font-medium ${activeTab === 'basic' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-text-secondary hover:text-text-primary'}`}>Basic Info</button>
                <button onClick={() => setActiveTab('details')} className={`px-4 py-3 text-sm font-medium ${activeTab === 'details' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-text-secondary hover:text-text-primary'}`}>Details & Personality</button>
                <button onClick={() => setActiveTab('advanced')} className={`px-4 py-3 text-sm font-medium ${activeTab === 'advanced' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-text-secondary hover:text-text-primary'}`}>Advanced Logic (RAG/Vault)</button>
                <button onClick={() => setActiveTab('memory')} className={`px-4 py-3 text-sm font-medium ${activeTab === 'memory' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-text-secondary hover:text-text-primary'}`}>Memory & Intelligence</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-8">
                <form onSubmit={handleSubmit} className="max-w-4xl mx-auto space-y-6">
                    
                    {/* --- BASIC INFO TAB --- */}
                    {activeTab === 'basic' && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fadeIn">
                            <div className="col-span-1 flex flex-col items-center space-y-4">
                                <div className="w-32 h-32 rounded-full bg-background-tertiary overflow-hidden border-2 border-border-strong relative group">
                                    {formState.avatarUrl ? (
                                        <img src={formState.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="flex items-center justify-center w-full h-full text-text-secondary">No Avatar</div>
                                    )}
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-2">
                                        <button type="button" onClick={() => avatarInputRef.current?.click()} className="p-2 text-white hover:bg-white/20 rounded-full" title="Upload"><UploadIcon className="w-5 h-5"/></button>
                                        <button type="button" onClick={handleGenerateAvatar} disabled={isGeneratingAvatar} className="p-2 text-white hover:bg-white/20 rounded-full" title="Generate">{isGeneratingAvatar ? <SpinnerIcon className="w-5 h-5 animate-spin"/> : <ImageIcon className="w-5 h-5"/>}</button>
                                    </div>
                                </div>
                                <input type="file" ref={avatarInputRef} className="hidden" accept="image/*" onChange={handleAvatarUpload} />
                                <input 
                                    type="text" 
                                    placeholder="Character Name" 
                                    className="w-full bg-background-secondary border border-border-strong rounded px-3 py-2 text-text-primary text-center font-bold"
                                    value={formState.name}
                                    onChange={e => handleChange('name', e.target.value)}
                                    required
                                />
                                <select 
                                    value={formState.characterType || 'character'} 
                                    onChange={e => handleChange('characterType', e.target.value)}
                                    className="w-full bg-background-secondary border border-border-strong rounded px-3 py-2 text-text-primary text-sm"
                                >
                                    <option value="character">Persona (Character)</option>
                                    <option value="narrator">Scenario (Narrator)</option>
                                </select>
                            </div>
                            <div className="col-span-1 md:col-span-2 space-y-4">
                                <div className="relative">
                                    <label className="block text-sm font-medium text-text-secondary mb-1">Description</label>
                                    <textarea 
                                        className="w-full bg-background-secondary border border-border-strong rounded px-3 py-2 text-text-primary h-24 resize-none"
                                        value={formState.description}
                                        onChange={e => handleChange('description', e.target.value)}
                                        placeholder="Short description of the character..."
                                    />
                                    {renderAIGenButton('description', "Write a short, engaging description for a character named {{name}}.", "Auto-generate Description")}
                                </div>
                                <div className="relative">
                                    <label className="block text-sm font-medium text-text-secondary mb-1">First Message</label>
                                    <textarea 
                                        className="w-full bg-background-secondary border border-border-strong rounded px-3 py-2 text-text-primary h-32"
                                        value={formState.firstMessage}
                                        onChange={e => handleChange('firstMessage', e.target.value)}
                                        placeholder="Greeting message sent when a new chat starts..."
                                    />
                                    {renderAIGenButton('firstMessage', "Write an engaging first message for a roleplay character named {{name}} described as: {{desc}}. Use {{user}} to refer to the user.", "Auto-generate First Message")}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* --- DETAILS TAB --- */}
                    {activeTab === 'details' && (
                        <div className="space-y-6 animate-fadeIn">
                            <div className="relative">
                                <label className="block text-sm font-medium text-text-secondary mb-1">Personality / Role Instruction</label>
                                <textarea 
                                    className="w-full bg-background-secondary border border-border-strong rounded px-3 py-2 text-text-primary h-48"
                                    value={formState.personality}
                                    onChange={e => handleChange('personality', e.target.value)}
                                    placeholder="Detailed personality instructions, behavior guidelines, and traits..."
                                />
                                {renderAIGenButton('personality', "Write detailed personality and roleplay instructions for {{name}}, described as: {{desc}}.", "Auto-generate Personality")}
                            </div>
                            
                            <div className="relative">
                                <label className="block text-sm font-medium text-text-secondary mb-1">Backstory</label>
                                <textarea 
                                    className="w-full bg-background-secondary border border-border-strong rounded px-3 py-2 text-text-primary h-40"
                                    value={formState.backstory}
                                    onChange={e => handleChange('backstory', e.target.value)}
                                    placeholder="The character's history, origin, and key life events..."
                                />
                                {renderAIGenButton('backstory', "Write a compelling backstory for {{name}}, described as: {{desc}}.", "Auto-generate Backstory")}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-text-secondary mb-1">Physical Appearance</label>
                                    <textarea 
                                        className="w-full bg-background-primary border border-border-strong rounded px-3 py-2 text-text-primary h-20"
                                        value={formState.physicalAppearance}
                                        onChange={e => handleChange('physicalAppearance', e.target.value)}
                                        placeholder="Eye color, hair style, clothing, etc."
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-text-secondary mb-1">Personality Traits (comma-separated)</label>
                                    <textarea 
                                        className="w-full bg-background-primary border border-border-strong rounded px-3 py-2 text-text-primary h-20"
                                        value={formState.personalityTraits}
                                        onChange={e => handleChange('personalityTraits', e.target.value)}
                                        placeholder="e.g. Brave, Stubborn, Intelligent..."
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* --- ADVANCED LOGIC TAB --- */}
                    {activeTab === 'advanced' && (
                        <div className="space-y-6 animate-fadeIn">
                            <div className="bg-background-secondary p-4 rounded-lg border border-border-neutral">
                                <h3 className="text-lg font-medium text-text-primary mb-4 flex items-center">
                                    <SparklesIcon className="w-5 h-5 mr-2 text-accent-yellow"/> Deep Thinking & Grounding
                                </h3>
                                
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <span className="text-sm font-medium text-text-primary block">Thinking Budget (Deep Thinking)</span>
                                            <span className="text-xs text-text-secondary">Allows the model to reason before responding (Gemini 2.5/3.0 only). 0 to disable.</span>
                                        </div>
                                        <input 
                                            type="number" 
                                            value={formState.thinkingBudget || 0}
                                            onChange={e => handleChange('thinkingBudget', parseInt(e.target.value) || 0)}
                                            className="w-24 bg-background-primary border border-border-strong rounded px-2 py-1 text-text-primary"
                                            min="0"
                                            max="32000"
                                            step="1024"
                                        />
                                    </div>

                                    <div className="flex items-center space-x-3">
                                        <input 
                                            type="checkbox" 
                                            id="useSearch"
                                            checked={formState.useSearchGrounding || false} 
                                            onChange={e => handleChange('useSearchGrounding', e.target.checked)}
                                            className="rounded border-border-strong bg-background-primary text-primary-600 focus:ring-primary-500 h-5 w-5"
                                        />
                                        <div>
                                            <label htmlFor="useSearch" className="text-sm font-medium text-text-primary block">Enable Google Search Grounding</label>
                                            <span className="text-xs text-text-secondary">Allows the character to access real-time information from the web.</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="bg-background-secondary p-4 rounded-lg border border-border-neutral space-y-4">
                                <h3 className="text-lg font-medium text-text-primary flex items-center">
                                    <VaultIcon className="w-5 h-5 mr-2 text-text-secondary" /> Vault Attachments
                                </h3>
                                <p className="text-sm text-text-secondary">
                                    Grant this character access to specific files from your Secure Vault. The content of these files will be visible to the character during chats.
                                </p>
                                
                                <div className="space-y-2">
                                    {(formState.vaultAttachmentIds || []).map(id => (
                                        <div key={id} className="flex items-center justify-between p-2 bg-background-primary rounded border border-border-neutral">
                                            <span className="text-sm text-text-primary font-mono text-xs truncate max-w-[200px]">{id}</span>
                                            <button 
                                                type="button" 
                                                onClick={() => handleRemoveVaultItem(id)}
                                                className="text-accent-red hover:text-red-400"
                                                title="Remove Access"
                                            >
                                                <TrashIcon className="w-4 h-4"/>
                                            </button>
                                        </div>
                                    ))}
                                    {(formState.vaultAttachmentIds?.length === 0) && <p className="text-sm text-text-secondary italic">No vault items attached.</p>}
                                    
                                    <button 
                                        type="button" 
                                        onClick={handleAttachVaultItems}
                                        className="w-full flex items-center justify-center space-x-2 py-2 border border-dashed border-border-strong rounded text-text-secondary hover:text-text-primary hover:bg-background-tertiary"
                                    >
                                        <PlusIcon className="w-4 h-4" /> <span>Attach from Vault</span>
                                    </button>
                                </div>
                            </div>

                            <div className="bg-background-secondary p-4 rounded-lg border border-border-neutral space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-lg font-medium text-text-primary">Knowledge Base (RAG)</h3>
                                    <label className="flex items-center space-x-2 cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            checked={formState.ragEnabled} 
                                            onChange={e => handleChange('ragEnabled', e.target.checked)}
                                            className="rounded border-border-strong bg-background-primary text-primary-600 focus:ring-primary-500"
                                        />
                                        <span className="text-sm text-text-primary">Enable RAG</span>
                                    </label>
                                </div>
                                
                                {formState.ragEnabled && (
                                    <div className="space-y-4">
                                        <div className="border border-dashed border-border-strong rounded-lg p-6 flex flex-col items-center justify-center bg-background-primary">
                                            <input 
                                                type="file" 
                                                ref={ragFileInputRef} 
                                                className="hidden" 
                                                onChange={handleRagFileUpload} 
                                                accept=".txt,.md,.json"
                                            />
                                            <button 
                                                type="button"
                                                onClick={() => ragFileInputRef.current?.click()}
                                                className="flex items-center space-x-2 text-primary-500 hover:text-primary-400"
                                            >
                                                <PlusIcon className="w-6 h-6" />
                                                <span className="font-medium">Upload Knowledge File</span>
                                            </button>
                                            <p className="text-xs text-text-secondary mt-2">Supported: .txt, .md, .json</p>
                                        </div>
                                        
                                        {indexingStatus && (
                                            <div className="text-sm text-center text-primary-500 animate-pulse font-medium">
                                                {indexingStatus}
                                            </div>
                                        )}

                                        {formState.ragSources && formState.ragSources.length > 0 && (
                                            <div className="space-y-2">
                                                <h4 className="text-sm font-medium text-text-secondary">Indexed Files:</h4>
                                                {formState.ragSources.map(source => (
                                                    <div key={source.id} className="flex items-center justify-between p-2 bg-background-primary rounded border border-border-neutral">
                                                        <span className="text-sm text-text-primary truncate">{source.fileName}</span>
                                                        <button 
                                                            type="button"
                                                            onClick={() => onDeleteRagSource(formState.id, source.id)}
                                                            className="text-accent-red hover:text-red-400 p-1"
                                                        >
                                                            <TrashIcon className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* --- MEMORY & INTELLIGENCE TAB --- */}
                    {activeTab === 'memory' && (
                        <div className="space-y-6 animate-fadeIn">
                            <div className="bg-background-secondary p-4 rounded-lg border border-border-neutral">
                                <h3 className="text-lg font-medium text-text-primary mb-2 flex items-center">
                                    <CogIcon className="w-5 h-5 mr-2 text-text-secondary" /> Context & Memory Manager
                                </h3>
                                <p className="text-sm text-text-secondary mb-4">
                                    Configure a separate LLM for memory summarization, context extraction, and "AI Assist" features. 
                                    This allows you to use a faster/cheaper model (like Flash) for maintenance tasks, keeping your main interaction model (like Pro) focused on roleplay.
                                </p>

                                <div className="space-y-4 border-t border-border-neutral pt-4">
                                    <div>
                                        <label className="block text-sm font-medium text-text-primary mb-1">Service Provider</label>
                                        <select 
                                            value={formState.summaryApiConfig?.service || 'default'}
                                            onChange={e => handleNestedChange('summaryApiConfig', 'service', e.target.value)}
                                            className="w-full bg-background-primary border border-border-strong rounded px-3 py-2 text-text-primary"
                                        >
                                            <option value="default">Same as Character (Default)</option>
                                            <option value="gemini">Google Gemini</option>
                                            <option value="openai">OpenAI Compatible</option>
                                        </select>
                                    </div>

                                    {(formState.summaryApiConfig?.service === 'gemini' || formState.summaryApiConfig?.service === 'openai') && (
                                        <>
                                            <div>
                                                <label className="block text-sm font-medium text-text-primary mb-1">API Key</label>
                                                <input 
                                                    type="password"
                                                    value={formState.summaryApiConfig?.apiKey || ''}
                                                    onChange={e => handleNestedChange('summaryApiConfig', 'apiKey', e.target.value)}
                                                    placeholder="API Key"
                                                    className="w-full bg-background-primary border border-border-strong rounded px-3 py-2 text-text-primary"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-text-primary mb-1">Model ID</label>
                                                <input 
                                                    type="text"
                                                    value={formState.summaryApiConfig?.model || ''}
                                                    onChange={e => handleNestedChange('summaryApiConfig', 'model', e.target.value)}
                                                    placeholder="e.g. gemini-2.5-flash-latest"
                                                    className="w-full bg-background-primary border border-border-strong rounded px-3 py-2 text-text-primary"
                                                />
                                            </div>
                                            {formState.summaryApiConfig?.service === 'openai' && (
                                                <div>
                                                    <label className="block text-sm font-medium text-text-primary mb-1">API Endpoint</label>
                                                    <input 
                                                        type="text"
                                                        value={formState.summaryApiConfig?.apiEndpoint || ''}
                                                        onChange={e => handleNestedChange('summaryApiConfig', 'apiEndpoint', e.target.value)}
                                                        placeholder="e.g. https://api.openai.com/v1/chat/completions"
                                                        className="w-full bg-background-primary border border-border-strong rounded px-3 py-2 text-text-primary"
                                                    />
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                            
                            <div className="bg-background-secondary p-4 rounded-lg border border-border-neutral">
                                <h3 className="text-lg font-medium text-text-primary mb-2">Primary Chat Model Override</h3>
                                <p className="text-sm text-text-secondary mb-4">
                                    Leave generic to use the system default, or configure specific API settings for this character's chat responses.
                                </p>
                                <div className="space-y-4 border-t border-border-neutral pt-4">
                                     <div>
                                        <label className="block text-sm font-medium text-text-primary mb-1">Service Provider</label>
                                        <select 
                                            value={formState.apiConfig?.service || 'default'}
                                            onChange={e => handleNestedChange('apiConfig', 'service', e.target.value)}
                                            className="w-full bg-background-primary border border-border-strong rounded px-3 py-2 text-text-primary"
                                        >
                                            <option value="default">System Default (Gemini)</option>
                                            <option value="gemini">Google Gemini</option>
                                            <option value="openai">OpenAI Compatible</option>
                                        </select>
                                    </div>
                                    {(formState.apiConfig?.service === 'gemini' || formState.apiConfig?.service === 'openai') && (
                                        <>
                                            <div>
                                                <label className="block text-sm font-medium text-text-primary mb-1">API Key</label>
                                                <input 
                                                    type="password"
                                                    value={formState.apiConfig?.apiKey || ''}
                                                    onChange={e => handleNestedChange('apiConfig', 'apiKey', e.target.value)}
                                                    placeholder="API Key"
                                                    className="w-full bg-background-primary border border-border-strong rounded px-3 py-2 text-text-primary"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-text-primary mb-1">Model ID</label>
                                                <input 
                                                    type="text"
                                                    value={formState.apiConfig?.model || ''}
                                                    onChange={e => handleNestedChange('apiConfig', 'model', e.target.value)}
                                                    placeholder="e.g. gemini-3-pro-preview"
                                                    className="w-full bg-background-primary border border-border-strong rounded px-3 py-2 text-text-primary"
                                                />
                                            </div>
                                            {formState.apiConfig?.service === 'openai' && (
                                                <div>
                                                    <label className="block text-sm font-medium text-text-primary mb-1">API Endpoint</label>
                                                    <input 
                                                        type="text"
                                                        value={formState.apiConfig?.apiEndpoint || ''}
                                                        onChange={e => handleNestedChange('apiConfig', 'apiEndpoint', e.target.value)}
                                                        placeholder="e.g. https://api.openai.com/v1/chat/completions"
                                                        className="w-full bg-background-primary border border-border-strong rounded px-3 py-2 text-text-primary"
                                                    />
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                </form>
            </div>
        </div>
    );
};
