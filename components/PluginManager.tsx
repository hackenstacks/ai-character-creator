import React, { useState, useEffect, useRef } from 'react';
import { Plugin, ApiConfig, ConfirmationRequest } from '../types.ts';
import { logger } from '../services/loggingService.ts';
import { PlusIcon } from './icons/PlusIcon.tsx';
import { TrashIcon } from './icons/TrashIcon.tsx';
import { EditIcon } from './icons/EditIcon.tsx';
import { PowerIcon } from './icons/PowerIcon.tsx';
import { UploadIcon } from './icons/UploadIcon.tsx';
import { DownloadIcon } from './icons/DownloadIcon.tsx';

interface PluginManagerProps {
  plugins: Plugin[];
  onPluginsUpdate: (plugins: Plugin[]) => void;
  onSetConfirmation: (request: ConfirmationRequest | null) => void;
}

const examplePluginCode = `// Example Plugin: UPPERCASE every message
// This plugin intercepts every message sent by the user and converts it to uppercase.

// Use nexus.hooks.register to listen for specific events in the application.
// 'beforeMessageSend' is triggered right before a user's message is sent to the AI.
nexus.hooks.register('beforeMessageSend', (payload) => {
  // payload is an object like { content: "some message" }
  // Use nexus.log for safe debugging from the sandbox.
  nexus.log('Plugin transforming message:', payload.content);

  const modifiedContent = payload.content.toUpperCase();

  // The hook must return an object with the same structure as the payload.
  return { content: modifiedContent };
});

nexus.log('UPPERCASE plugin loaded and ready.');
`;

const imageStyles = ["Default (None)", "Anime/Manga", "Photorealistic", "Digital Painting", "Fantasy Art", "Cyberpunk", "Vintage Photo", "Low Poly", "Custom"];

export const PluginManager: React.FC<PluginManagerProps> = ({ plugins, onPluginsUpdate, onSetConfirmation }) => {
  const [editingPlugin, setEditingPlugin] = useState<Plugin | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formState, setFormState] = useState<Omit<Plugin, 'id' | 'enabled'>>({ name: '', description: '', code: '', settings: {} });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingPlugin) {
      setFormState({
        name: editingPlugin.name,
        description: editingPlugin.description,
        code: editingPlugin.code,
        settings: editingPlugin.settings || {},
      });
      setIsCreating(false);
    } else if (isCreating) {
      setFormState({
        name: '',
        description: '',
        code: examplePluginCode,
        settings: {}
      });
    }
  }, [editingPlugin, isCreating]);

  const handleSave = () => {
    if (!formState.name.trim()) {
      alert('Plugin name cannot be empty.');
      return;
    }
    
    let updatedPlugins;
    if (editingPlugin) {
      updatedPlugins = plugins.map(p => p.id === editingPlugin.id ? { ...editingPlugin, ...formState } : p);
      logger.log(`Plugin updated: ${formState.name}`);
    } else {
      const newPlugin: Plugin = { ...formState, id: crypto.randomUUID(), enabled: false };
      updatedPlugins = [...plugins, newPlugin];
      logger.log(`Plugin created: ${formState.name}`);
    }
    onPluginsUpdate(updatedPlugins);
    setEditingPlugin(null);
    setIsCreating(false);
  };
  
  const handleDelete = (pluginId: string) => {
    const pluginName = plugins.find(p => p.id === pluginId)?.name || 'Unknown';
    onSetConfirmation({
        message: `Are you sure you want to delete the plugin "${pluginName}"? This action cannot be undone.`,
        onConfirm: () => {
            const updatedPlugins = plugins.filter(p => p.id !== pluginId);
            onPluginsUpdate(updatedPlugins);
            logger.log(`Plugin deleted: ${pluginName}`);
            onSetConfirmation(null);
        },
        onCancel: () => onSetConfirmation(null),
    });
  };

  const handleToggle = (pluginId: string) => {
    // Prevent disabling core plugins
    if (pluginId === 'default-image-generator' || pluginId === 'default-tts-narrator') {
        alert("This is a core plugin and cannot be disabled.");
        return;
    }
    const updatedPlugins = plugins.map(p => p.id === pluginId ? { ...p, enabled: !p.enabled } : p);
    onPluginsUpdate(updatedPlugins);
    const plugin = updatedPlugins.find(p => p.id === pluginId);
    if (plugin) {
        logger.log(`Plugin ${plugin.enabled ? 'enabled' : 'disabled'}: ${plugin.name}`);
    }
  };
  
  const handleCancel = () => {
    setEditingPlugin(null);
    setIsCreating(false);
  };
  
  const triggerDownload = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportAll = () => {
    try {
      const jsonString = JSON.stringify(plugins, null, 2);
      const filename = 'ai-nexus-plugins.json';
      triggerDownload(filename, jsonString);
      logger.log(`Exported all ${plugins.length} plugins.`, { filename });
    } catch (error) {
        logger.error("Failed to export all plugins.", error);
        alert("Failed to export plugins. Check logs for details.");
    }
  };

  const handleExportPlugin = (plugin: Plugin) => {
    try {
        const jsonString = JSON.stringify(plugin, null, 2);
        const filename = `${plugin.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
        triggerDownload(filename, jsonString);
        logger.log(`Exported plugin: ${plugin.name}`, { filename });
    } catch (error) {
        logger.error(`Failed to export plugin: ${plugin.name}`, error);
        alert("Failed to export plugin. Check logs for details.");
    }
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    logger.log(`Starting plugin import from file: ${file.name}`);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const imported = JSON.parse(text);
        
        let pluginsToImport: Plugin[] = [];

        const isValidPlugin = (p: any): p is Plugin => {
          return p && typeof p.name === 'string' && typeof p.code === 'string';
        };

        if (Array.isArray(imported)) {
          pluginsToImport = imported.filter(isValidPlugin);
        } else if (isValidPlugin(imported)) {
          pluginsToImport = [imported];
        } else {
            throw new Error("Invalid plugin file format. Expected a plugin object or an array of plugins.");
        }

        if (pluginsToImport.length === 0) {
            alert("No valid plugins found in the file.");
            logger.warn("Plugin import completed with no valid plugins found.", { filename: file.name });
            return;
        }

        const newPlugins = pluginsToImport.map(p => ({
            ...p,
            id: crypto.randomUUID(), // Assign new ID to avoid conflicts
            enabled: false, // Import as disabled for security
        }));

        const finalPlugins = [...plugins, ...newPlugins];
        onPluginsUpdate(finalPlugins);
        logger.log(`${newPlugins.length} plugin(s) imported successfully. They are disabled by default.`);
        alert(`${newPlugins.length} plugin(s) imported successfully. They are disabled by default.`);

      } catch (error) {
        logger.error("Plugin import failed:", error);
        alert(`Failed to import plugins. Check logs for details. Error: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };
  
  const handleSettingsChange = (key: string, value: any) => {
      setFormState(prev => ({
          ...prev,
          settings: {
              ...prev.settings,
              [key]: value
          }
      }));
  };
  
  const isDefaultImagePlugin = editingPlugin?.id === 'default-image-generator';
  const isDefaultTtsPlugin = editingPlugin?.id === 'default-tts-narrator';

  if (editingPlugin || isCreating) {
     return (
      <div className="flex-1 flex flex-col bg-nexus-gray-light-200 dark:bg-nexus-gray-900 h-full">
         <header className="flex items-center p-4 border-b border-nexus-gray-light-300 dark:border-nexus-gray-700 flex-shrink-0">
            <h2 className="text-xl font-bold text-nexus-gray-900 dark:text-white">{isDefaultImagePlugin ? 'Configure Plugin' : (editingPlugin ? 'Edit Plugin' : 'Create New Plugin')}</h2>
        </header>
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
            <div className="space-y-6 max-w-4xl mx-auto">
              <input
                type="text"
                placeholder="Plugin Name"
                value={formState.name}
                onChange={(e) => setFormState(s => ({...s, name: e.target.value}))}
                className="w-full bg-nexus-gray-light-100 dark:bg-nexus-gray-800 border border-nexus-gray-light-400 dark:border-nexus-gray-700 rounded-md py-2 px-3 text-nexus-gray-900 dark:text-white focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500"
                readOnly={isDefaultImagePlugin || isDefaultTtsPlugin}
              />
              <textarea
                placeholder="Plugin Description"
                value={formState.description}
                onChange={(e) => setFormState(s => ({...s, description: e.target.value}))}
                rows={2}
                className="w-full bg-nexus-gray-light-100 dark:bg-nexus-gray-800 border border-nexus-gray-light-400 dark:border-nexus-gray-700 rounded-md py-2 px-3 text-nexus-gray-900 dark:text-white focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500"
                readOnly={isDefaultTtsPlugin}
              />
              {isDefaultImagePlugin && (
                <div className="p-4 rounded-md border border-nexus-gray-light-400 dark:border-nexus-gray-700 bg-nexus-gray-light-200/50 dark:bg-nexus-gray-800/50 space-y-4">
                  <h3 className="text-lg font-medium text-nexus-gray-900 dark:text-white mb-3">Image Generation Settings</h3>
                   <div>
                        <label htmlFor="image-style" className="block text-sm font-medium text-nexus-gray-800 dark:text-nexus-gray-300">Image Style</label>
                        <select
                            id="image-style"
                            value={formState.settings?.style || 'Default (None)'}
                            onChange={(e) => handleSettingsChange('style', e.target.value)}
                            className="mt-1 block w-full bg-nexus-gray-light-100 dark:bg-nexus-gray-800 border border-nexus-gray-light-400 dark:border-nexus-gray-700 rounded-md shadow-sm py-2 px-3 text-nexus-gray-900 dark:text-white focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500"
                        >
                            {imageStyles.map(style => <option key={style} value={style}>{style}</option>)}
                        </select>
                    </div>
                     {formState.settings?.style === 'Custom' && (
                         <div>
                            <label htmlFor="custom-style-prompt" className="block text-sm font-medium text-nexus-gray-800 dark:text-nexus-gray-300">Custom Style Prompt</label>
                            <textarea
                                id="custom-style-prompt"
                                value={formState.settings?.customStylePrompt || ''}
                                onChange={(e) => handleSettingsChange('customStylePrompt', e.target.value)}
                                rows={2}
                                className="mt-1 block w-full bg-nexus-gray-light-100 dark:bg-nexus-gray-800 border border-nexus-gray-light-400 dark:border-nexus-gray-700 rounded-md shadow-sm py-2 px-3 text-nexus-gray-900 dark:text-white focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500"
                                placeholder="e.g., in the style of vaporwave, cinematic lighting"
                            />
                         </div>
                    )}
                    <div>
                        <label htmlFor="negative-prompt" className="block text-sm font-medium text-nexus-gray-800 dark:text-nexus-gray-300">Negative Prompt</label>
                        <textarea
                            id="negative-prompt"
                            value={formState.settings?.negativePrompt || ''}
                            onChange={(e) => handleSettingsChange('negativePrompt', e.target.value)}
                            rows={2}
                            className="mt-1 block w-full bg-nexus-gray-light-100 dark:bg-nexus-gray-800 border border-nexus-gray-light-400 dark:border-nexus-gray-700 rounded-md shadow-sm py-2 px-3 text-nexus-gray-900 dark:text-white focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500"
                            placeholder="e.g., ugly, blurry, deformed"
                        />
                    </div>
                  <h3 className="text-lg font-medium text-nexus-gray-900 dark:text-white pt-4 border-t border-nexus-gray-light-400 dark:border-nexus-gray-700">API Configuration</h3>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="api-service" className="block text-sm font-medium text-nexus-gray-800 dark:text-nexus-gray-300">API Service</label>
                      <select 
                          id="api-service"
                          value={formState.settings?.service || 'default'}
                          onChange={(e) => handleSettingsChange('service', e.target.value as ApiConfig['service'])}
                          className="mt-1 block w-full bg-nexus-gray-light-100 dark:bg-nexus-gray-800 border border-nexus-gray-light-400 dark:border-nexus-gray-700 rounded-md shadow-sm py-2 px-3 text-nexus-gray-900 dark:text-white focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500"
                      >
                          <option value="default">Default (Gemini)</option>
                          <option value="gemini">Google Gemini (Custom Key)</option>
                          <option value="openai">OpenAI-Compatible (e.g., DALL-E)</option>
                      </select>
                    </div>
                    {formState.settings?.service === 'gemini' && (
                        <div>
                          <label htmlFor="api-key" className="block text-sm font-medium text-nexus-gray-800 dark:text-nexus-gray-300">Gemini API Key</label>
                          <input
                            id="api-key"
                            type="password"
                            value={formState.settings?.apiKey || ''}
                            onChange={(e) => handleSettingsChange('apiKey', e.target.value)}
                            className="mt-1 block w-full bg-nexus-gray-light-100 dark:bg-nexus-gray-800 border border-nexus-gray-light-400 dark:border-nexus-gray-700 rounded-md shadow-sm py-2 px-3 text-nexus-gray-900 dark:text-white focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500"
                            placeholder="Leave blank to use default key"
                          />
                        </div>
                    )}
                     {formState.settings?.service === 'openai' && (
                          <>
                              <div>
                                  <label htmlFor="api-endpoint" className="block text-sm font-medium text-nexus-gray-800 dark:text-nexus-gray-300">API Endpoint</label>
                                  <input
                                      id="api-endpoint"
                                      type="text"
                                      value={formState.settings?.apiEndpoint || ''}
                                      onChange={(e) => handleSettingsChange('apiEndpoint', e.target.value)}
                                      className="mt-1 block w-full bg-nexus-gray-light-100 dark:bg-nexus-gray-800 border border-nexus-gray-light-400 dark:border-nexus-gray-700 rounded-md py-2 px-3 text-nexus-gray-900 dark:text-white focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500"
                                      placeholder="e.g., https://api.openai.com/v1/images/generations"
                                  />
                              </div>
                               <div>
                                  <label htmlFor="api-key" className="block text-sm font-medium text-nexus-gray-800 dark:text-nexus-gray-300">API Key</label>
                                  <input
                                      id="api-key"
                                      type="password"
                                      value={formState.settings?.apiKey || ''}
                                      onChange={(e) => handleSettingsChange('apiKey', e.target.value)}
                                      className="mt-1 block w-full bg-nexus-gray-light-100 dark:bg-nexus-gray-800 border border-nexus-gray-light-400 dark:border-nexus-gray-700 rounded-md py-2 px-3 text-nexus-gray-900 dark:text-white focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500"
                                      placeholder="API Key"
                                  />
                              </div>
                              <div>
                                  <label htmlFor="api-model" className="block text-sm font-medium text-nexus-gray-800 dark:text-nexus-gray-300">Model Name</label>
                                  <input
                                      id="api-model"
                                      type="text"
                                      value={formState.settings?.model || ''}
                                      onChange={(e) => handleSettingsChange('model', e.target.value)}
                                      className="mt-1 block w-full bg-nexus-gray-light-100 dark:bg-nexus-gray-800 border border-nexus-gray-light-400 dark:border-nexus-gray-700 rounded-md py-2 px-3 text-nexus-gray-900 dark:text-white focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500"
                                      placeholder="e.g., dall-e-3"
                                  />
                              </div>
                          </>
                      )}
                      {(formState.settings?.service === 'gemini' || formState.settings?.service === 'openai') && (
                        <div>
                            <label htmlFor="plugin-api-rate-limit" className="block text-sm font-medium text-nexus-gray-800 dark:text-nexus-gray-300">Request Delay (ms)</label>
                            <input
                                id="plugin-api-rate-limit"
                                type="number"
                                value={formState.settings?.rateLimit || ''}
                                onChange={(e) => handleSettingsChange('rateLimit', e.target.value ? parseInt(e.target.value, 10) : undefined)}
                                className="mt-1 block w-full bg-nexus-gray-light-100 dark:bg-nexus-gray-800 border border-nexus-gray-light-400 dark:border-nexus-gray-700 rounded-md py-2 px-3 text-nexus-gray-900 dark:text-white focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500"
                                placeholder="e.g., 1000 (for 1 request per second)"
                                min="0"
                            />
                            <p className="text-xs text-nexus-gray-700 dark:text-nexus-gray-400 mt-1">Minimum time to wait between image generation requests to avoid rate limits.</p>
                        </div>
                    )}
                  </div>
                </div>
              )}
              <div className="flex flex-col h-96">
                <label className="block text-sm font-medium text-nexus-gray-800 dark:text-nexus-gray-300 mb-1">Plugin Code (JavaScript)</label>
                <textarea
                  placeholder="Enter your plugin code here..."
                  value={formState.code}
                  onChange={(e) => setFormState(s => ({...s, code: e.target.value}))}
                  className={`flex-1 w-full bg-nexus-light dark:bg-nexus-dark border border-nexus-gray-light-400 dark:border-nexus-gray-700 rounded-md py-2 px-3 text-nexus-gray-900 dark:text-white font-mono text-sm focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500 resize-none ${(isDefaultImagePlugin || isDefaultTtsPlugin) ? 'opacity-70 cursor-not-allowed' : ''}`}
                  spellCheck="false"
                  readOnly={isDefaultImagePlugin || isDefaultTtsPlugin}
                />
              </div>
              <div className="flex justify-end space-x-4 pb-4">
                <button onClick={handleCancel} className="py-2 px-4 rounded-md text-nexus-gray-900 dark:text-white bg-nexus-gray-light-400 dark:bg-nexus-gray-600 hover:bg-nexus-gray-light-500 dark:hover:bg-nexus-gray-500">Cancel</button>
                <button onClick={handleSave} className="py-2 px-4 rounded-md text-white bg-nexus-blue-600 hover:bg-nexus-blue-500">Save Plugin</button>
              </div>
            </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-nexus-gray-light-200 dark:bg-nexus-gray-900">
        <header className="flex items-center p-4 border-b border-nexus-gray-light-300 dark:border-nexus-gray-700 flex-shrink-0">
            <div className="flex-1 flex justify-between items-center">
                <h2 className="text-xl font-bold text-nexus-gray-900 dark:text-white">Plugin Manager</h2>
                <div className="flex items-center space-x-2">
                    <input type="file" ref={fileInputRef} onChange={handleImport} accept=".json" className="hidden" />
                    <button onClick={() => fileInputRef.current?.click()} title="Import Plugin(s) from File" className="flex items-center space-x-2 py-2 px-3 rounded-md text-nexus-gray-900 dark:text-white bg-nexus-gray-light-300 dark:bg-nexus-gray-700 hover:bg-nexus-gray-light-400 dark:hover:bg-nexus-gray-600">
                        <UploadIcon className="w-5 h-5"/>
                        <span>Import</span>
                    </button>
                    <button onClick={handleExportAll} title="Export All Plugins" className="flex items-center space-x-2 py-2 px-3 rounded-md text-nexus-gray-900 dark:text-white bg-nexus-gray-light-300 dark:bg-nexus-gray-700 hover:bg-nexus-gray-light-400 dark:hover:bg-nexus-gray-600">
                        <DownloadIcon className="w-5 h-5"/>
                        <span>Export All</span>
                    </button>
                    <button onClick={() => setIsCreating(true)} title="Create a New Plugin" className="flex items-center space-x-2 py-2 px-4 rounded-md text-white bg-nexus-blue-600 hover:bg-nexus-blue-500">
                        <PlusIcon className="w-5 h-5" />
                        <span>New Plugin</span>
                    </button>
                </div>
            </div>
        </header>
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
            <div className="space-y-4 max-w-4xl mx-auto">
                {plugins.length === 0 ? (
                  <p className="text-nexus-gray-700 dark:text-nexus-gray-400 text-center py-8">No plugins installed. Click 'New Plugin' to create one.</p>
                ) : (
                  plugins.map(plugin => (
                    <div key={plugin.id} className="bg-nexus-gray-light-100 dark:bg-nexus-gray-800 p-4 rounded-lg flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-lg font-semibold text-nexus-gray-900 dark:text-white truncate">{plugin.name}</p>
                        <p className="text-sm text-nexus-gray-700 dark:text-nexus-gray-400 truncate">{plugin.description}</p>
                      </div>
                      <div className="flex items-center space-x-3 ml-4">
                        <button onClick={() => handleExportPlugin(plugin)} title="Export Plugin" className="text-nexus-gray-600 dark:text-nexus-gray-400 hover:text-nexus-gray-900 dark:hover:text-white"><DownloadIcon className="w-5 h-5"/></button>
                        <button onClick={() => handleToggle(plugin.id)} title={plugin.enabled ? 'Disable' : 'Enable'}>
                          <PowerIcon className={`w-6 h-6 ${(plugin.id === 'default-image-generator' || plugin.id === 'default-tts-narrator') ? 'text-nexus-green-500 cursor-not-allowed' : (plugin.enabled ? 'text-nexus-green-500' : 'text-nexus-gray-500 hover:text-white')}`}/>
                        </button>
                        <button onClick={() => setEditingPlugin(plugin)} title={plugin.id === 'default-image-generator' ? 'Configure Plugin' : 'Edit Plugin'} className="text-nexus-gray-600 dark:text-nexus-gray-400 hover:text-nexus-gray-900 dark:hover:text-white"><EditIcon className="w-5 h-5" /></button>
                        {plugin.id !== 'default-image-generator' && plugin.id !== 'default-tts-narrator' && (
                            <button onClick={() => handleDelete(plugin.id)} title="Delete Plugin" className="text-nexus-gray-600 dark:text-nexus-gray-400 hover:text-red-500 dark:hover:text-red-400"><TrashIcon className="w-5 h-5" /></button>
                        )}
                      </div>
                    </div>
                  ))
                )}
            </div>
        </div>
    </div>
  );
};