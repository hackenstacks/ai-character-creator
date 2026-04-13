
import React, { useState, useEffect, useRef } from 'react';
import { VaultItem } from '../types';
import { saveVaultItem, getVaultItems, deleteVaultItem, encryptPackage, decryptPackage } from '../services/secureStorage';
import { logger } from '../services/loggingService';
import { VaultIcon } from './icons/VaultIcon';
import { FolderIcon } from './icons/FolderIcon';
import { DownloadIcon } from './icons/DownloadIcon';
import { TrashIcon } from './icons/TrashIcon';
import { PlusIcon } from './icons/PlusIcon';
import { UploadIcon } from './icons/UploadIcon';
import { LockOpenIcon } from './icons/LockOpenIcon';
import { LockIcon } from './icons/LockIcon';
import { CheckCircleIcon } from './icons/CheckCircleIcon';
import { InputModal } from './InputModal.tsx';

interface VaultProps {
    onClose: () => void;
    mode?: 'manage' | 'select';
    onConfirmSelection?: (selectedIds: string[]) => void;
}

const ROOT_ID = 'root';
const SHARED_ID = 'not-mine';

export const Vault: React.FC<VaultProps> = ({ onClose, mode = 'manage', onConfirmSelection }) => {
    const [currentFolderId, setCurrentFolderId] = useState<string>(ROOT_ID);
    const [items, setItems] = useState<VaultItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedItem, setSelectedItem] = useState<VaultItem | null>(null);
    const [sharePassword, setSharePassword] = useState('');
    const [importPassword, setImportPassword] = useState('');
    const [showShareModal, setShowShareModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [inputModal, setInputModal] = useState<{ title: string, label: string, onConfirm: (val: string) => void } | null>(null);
    
    // For select mode
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    
    const fileInputRef = useRef<HTMLInputElement>(null);
    const secureImportInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        loadItems(currentFolderId);
    }, [currentFolderId]);

    const loadItems = async (folderId: string) => {
        setLoading(true);
        try {
            const vaultItems = await getVaultItems(folderId);
            // Sort: Folders first, then files
            const sorted = vaultItems.sort((a, b) => {
                if (a.type === b.type) return a.name.localeCompare(b.name);
                return a.type === 'folder' ? -1 : 1;
            });
            setItems(sorted);
        } catch (error) {
            logger.error("Failed to load vault items", error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateFolder = () => {
        setInputModal({
            title: "Create New Folder",
            label: "Folder Name:",
            onConfirm: async (name) => {
                const newFolder: VaultItem = {
                    id: crypto.randomUUID(),
                    parentId: currentFolderId,
                    name,
                    type: 'folder',
                    createdAt: new Date().toISOString()
                };
                await saveVaultItem(newFolder);
                loadItems(currentFolderId);
                setInputModal(null);
            }
        });
    };

    const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const content = event.target?.result as string;
            const newItem: VaultItem = {
                id: crypto.randomUUID(),
                parentId: currentFolderId,
                name: file.name,
                type: 'file',
                mimeType: file.type,
                content: content, // This gets encrypted by saveVaultItem
                size: file.size,
                createdAt: new Date().toISOString()
            };
            
            setLoading(true);
            await saveVaultItem(newItem);
            loadItems(currentFolderId);
            setLoading(false);
        };
        reader.readAsDataURL(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure? This cannot be undone.")) return;
        await deleteVaultItem(id);
        // If it's a folder, we strictly should delete children too, 
        // but for this MVP we just delete the entry. Children become orphans (hidden).
        // A robust implementation would recursively delete.
        loadItems(currentFolderId);
        setSelectedItem(null);
    };

    const handleSecureShare = async () => {
        if (!selectedItem || !sharePassword) return;
        if (selectedItem.type === 'folder') {
            alert("Folder sharing not supported in this version. Please zip it or share files individually.");
            return;
        }

        try {
            // Decrypt content (it's loaded decrypted from getVaultItems), then encrypt with share password
            // Note: In getVaultItems, content is already decrypted for us.
            const encryptedPackage = await encryptPackage(JSON.stringify(selectedItem), sharePassword);
            
            const blob = new Blob([encryptedPackage], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${selectedItem.name}.nexusvault`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            setShowShareModal(false);
            setSharePassword('');
            alert("Secure package generated!");
        } catch (e) {
            logger.error("Sharing failed", e);
            alert("Encryption failed.");
        }
    };
    
    // Exports the entire vault as a JSON file to be imported into another project
    const handleExportVault = async () => {
        setLoading(true);
        try {
            // Retrieve ALL vault items (no parentId filter)
            const allItems = await getVaultItems();
            
            const exportData = {
                spec: 'ai_nexus_vault_export',
                version: '1.0',
                data: allItems
            };
            
            const jsonString = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ai-nexus-vault-export.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            logger.log("Vault exported successfully.");
        } catch (error) {
            logger.error("Failed to export vault", error);
            alert("Failed to export vault. See logs.");
        } finally {
            setLoading(false);
        }
    };

    const handleSecureImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        // We need the password first
        if (!importPassword) {
            alert("Please set the decryption password first.");
            // Also clear input here so they can retry selecting
            if (secureImportInputRef.current) secureImportInputRef.current.value = '';
            return;
        }

        const reader = new FileReader();
        
        const cleanup = () => {
             if (secureImportInputRef.current) secureImportInputRef.current.value = '';
        };

        reader.onload = async (event) => {
            try {
                const encryptedContent = event.target?.result as string;
                // Decrypt
                const decryptedJson = await decryptPackage(encryptedContent, importPassword);
                const importedItem = JSON.parse(decryptedJson) as VaultItem;
                
                importedItem.id = crypto.randomUUID(); // New ID to avoid conflicts
                importedItem.parentId = SHARED_ID; // Force location
                importedItem.name = `[Imported] ${importedItem.name}`;
                importedItem.createdAt = new Date().toISOString();
                
                // Ensure Not Mine folder exists
                const notMineFolder: VaultItem = {
                    id: SHARED_ID,
                    parentId: ROOT_ID,
                    name: 'Not Mine (Incoming)',
                    type: 'folder',
                    createdAt: new Date().toISOString()
                };
                // Try to save folder (idempotent overwrite is fine)
                await saveVaultItem(notMineFolder);
                await saveVaultItem(importedItem);
                
                alert("File imported successfully into 'Not Mine' folder.");
                
                if (currentFolderId === SHARED_ID) {
                    loadItems(SHARED_ID);
                } else {
                    setCurrentFolderId(SHARED_ID);
                }
                setShowImportModal(false);
                setImportPassword('');

            } catch (error) {
                logger.error("Import failed", error);
                alert("Import failed. Incorrect password or invalid file.");
            } finally {
                cleanup();
            }
        };
        
        reader.onerror = () => {
             logger.error("Vault import file read error", reader.error);
             alert("Failed to read file.");
             cleanup();
        }

        reader.readAsText(file);
    };

    const downloadFile = (item: VaultItem) => {
        if (!item.content) return;
        const a = document.createElement('a');
        a.href = item.content;
        a.download = item.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    const formatSize = (bytes?: number) => {
        if (!bytes) return '0 B';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    const toggleSelection = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleItemClick = (item: VaultItem) => {
        if (item.type === 'folder') {
            setCurrentFolderId(item.id);
        } else if (mode === 'select') {
            toggleSelection(item.id);
        } else {
            setSelectedItem(item);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-gray-900 border border-green-500/30 rounded-lg shadow-2xl w-full max-w-6xl h-[85vh] flex flex-col overflow-hidden font-mono text-green-400">
                {/* Header */}
                <header className="p-4 border-b border-green-500/30 flex justify-between items-center bg-gray-900/50">
                    <div className="flex items-center space-x-3">
                        <VaultIcon className="w-8 h-8 text-green-500" />
                        <h1 className="text-2xl font-bold tracking-widest uppercase">
                            {mode === 'select' ? 'Select Vault Items' : 'Nexus Secure Vault'}
                        </h1>
                    </div>
                    <button onClick={onClose} className="text-green-500 hover:text-green-300 text-2xl font-bold">&times;</button>
                </header>

                {/* Toolbar */}
                <div className="p-2 border-b border-green-500/30 flex items-center space-x-2 bg-gray-800/50">
                    {currentFolderId !== ROOT_ID && (
                        <button onClick={() => setCurrentFolderId(ROOT_ID)} className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded border border-green-500/30 text-sm">
                            &larr; Root
                        </button>
                    )}
                    {mode === 'manage' && (
                        <>
                            <button onClick={handleCreateFolder} className="flex items-center space-x-1 px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded border border-green-500/30 text-sm">
                                <PlusIcon className="w-4 h-4" /> <span>New Folder</span>
                            </button>
                            <input type="file" ref={fileInputRef} onChange={handleUpload} className="hidden" />
                            <button onClick={() => fileInputRef.current?.click()} className="flex items-center space-x-1 px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded border border-green-500/30 text-sm">
                                <UploadIcon className="w-4 h-4" /> <span>Upload File</span>
                            </button>
                            <div className="flex-1"></div>
                            <button onClick={handleExportVault} className="flex items-center space-x-1 px-3 py-1 bg-blue-900/30 hover:bg-blue-900/50 rounded border border-blue-500 text-sm text-blue-300 mr-2">
                                <DownloadIcon className="w-4 h-4" /> <span>Export Vault</span>
                            </button>
                            <button onClick={() => setShowImportModal(true)} className="flex items-center space-x-1 px-3 py-1 bg-green-900/30 hover:bg-green-900/50 rounded border border-green-500 text-sm text-green-300">
                                <DownloadIcon className="w-4 h-4" /> <span>Import Secure Pkg</span>
                            </button>
                        </>
                    )}
                    {mode === 'select' && (
                        <>
                            <div className="flex-1"></div>
                            <button 
                                onClick={() => { if(onConfirmSelection) onConfirmSelection(Array.from(selectedIds)); onClose(); }} 
                                disabled={selectedIds.size === 0}
                                className="px-4 py-1 bg-green-600 hover:bg-green-500 text-white rounded font-bold disabled:opacity-50"
                            >
                                Confirm Selection ({selectedIds.size})
                            </button>
                        </>
                    )}
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Sidebar / Quick Access */}
                    <div className="w-48 border-r border-green-500/30 p-4 space-y-2 bg-black/20">
                        <h3 className="text-xs uppercase text-green-600 font-bold mb-2">Locations</h3>
                        <div 
                            onClick={() => setCurrentFolderId(ROOT_ID)}
                            className={`cursor-pointer p-2 rounded ${currentFolderId === ROOT_ID ? 'bg-green-500/20 text-white' : 'hover:bg-green-500/10'}`}
                        >
                            My Files
                        </div>
                        <div 
                            onClick={() => setCurrentFolderId(SHARED_ID)}
                            className={`cursor-pointer p-2 rounded ${currentFolderId === SHARED_ID ? 'bg-green-500/20 text-white' : 'hover:bg-green-500/10'}`}
                        >
                            Not Mine (Incoming)
                        </div>
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 p-4 overflow-y-auto">
                        {loading ? (
                            <div className="text-center mt-10 animate-pulse">Accessing Secure Storage...</div>
                        ) : items.length === 0 ? (
                            <div className="text-center mt-10 text-green-700">Vault Empty.</div>
                        ) : (
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                {items.map(item => (
                                    <div 
                                        key={item.id}
                                        onClick={() => handleItemClick(item)}
                                        className={`group relative p-4 rounded border ${selectedIds.has(item.id) ? 'border-green-400 bg-green-500/20' : (selectedItem?.id === item.id ? 'border-green-400 bg-green-500/10' : 'border-green-500/20 bg-gray-800/30 hover:border-green-500/50')} flex flex-col items-center justify-center cursor-pointer transition-all`}
                                    >
                                        {selectedIds.has(item.id) && <div className="absolute top-2 right-2"><CheckCircleIcon className="w-5 h-5 text-green-400" /></div>}
                                        {item.type === 'folder' ? (
                                            <FolderIcon className="w-12 h-12 text-yellow-500/80 mb-2" />
                                        ) : (
                                            <div className="relative">
                                                {item.mimeType?.startsWith('image/') ? (
                                                    <img src={item.content} className="w-12 h-12 object-cover rounded" alt="thumb" />
                                                ) : (
                                                    <div className="w-12 h-12 flex items-center justify-center bg-gray-700 rounded text-xs text-white">FILE</div>
                                                )}
                                            </div>
                                        )}
                                        <div className="text-xs text-center truncate w-full mt-2" title={item.name}>{item.name}</div>
                                        <div className="text-[10px] text-green-700 mt-1">{formatSize(item.size)}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Details / Actions Pane (Only in manage mode) */}
                    {mode === 'manage' && selectedItem && (
                        <div className="w-64 border-l border-green-500/30 p-4 bg-black/20 flex flex-col">
                            <h3 className="text-lg font-bold truncate mb-4 border-b border-green-500/30 pb-2">{selectedItem.name}</h3>
                            <div className="space-y-4 flex-1">
                                <div className="text-sm">
                                    <span className="text-green-700 block text-xs uppercase">Type</span>
                                    {selectedItem.type}
                                </div>
                                <div className="text-sm">
                                    <span className="text-green-700 block text-xs uppercase">Size</span>
                                    {formatSize(selectedItem.size)}
                                </div>
                                <div className="text-sm">
                                    <span className="text-green-700 block text-xs uppercase">Created</span>
                                    {new Date(selectedItem.createdAt).toLocaleDateString()}
                                </div>
                            </div>
                            <div className="mt-4 space-y-2">
                                {selectedItem.type === 'file' && (
                                    <>
                                        <button onClick={() => downloadFile(selectedItem)} className="w-full py-2 bg-green-700 hover:bg-green-600 text-white rounded text-sm flex items-center justify-center space-x-2">
                                            <DownloadIcon className="w-4 h-4"/> <span>Download</span>
                                        </button>
                                        <button onClick={() => setShowShareModal(true)} className="w-full py-2 bg-blue-900/50 border border-blue-500 hover:bg-blue-800/50 text-blue-300 rounded text-sm flex items-center justify-center space-x-2">
                                            <LockOpenIcon className="w-4 h-4"/> <span>Secure Share</span>
                                        </button>
                                    </>
                                )}
                                <button onClick={() => handleDelete(selectedItem.id)} className="w-full py-2 bg-red-900/50 border border-red-500 hover:bg-red-800/50 text-red-300 rounded text-sm flex items-center justify-center space-x-2">
                                    <TrashIcon className="w-4 h-4"/> <span>Delete</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Share Modal */}
            {showShareModal && (
                <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/80">
                    <div className="bg-gray-800 border border-blue-500 rounded p-6 w-96 text-blue-300">
                        <h3 className="text-lg font-bold mb-4 flex items-center"><LockIcon className="w-5 h-5 mr-2"/> Secure Share</h3>
                        <p className="text-xs mb-4 text-blue-400">
                            Create a password-protected <code>.nexusvault</code> file. You must share the password with the recipient separately.
                        </p>
                        <input 
                            type="password" 
                            placeholder="Set Encryption Password" 
                            className="w-full bg-gray-900 border border-blue-500/50 rounded p-2 mb-4 text-white focus:outline-none focus:border-blue-500"
                            value={sharePassword}
                            onChange={(e) => setSharePassword(e.target.value)}
                        />
                        <div className="flex justify-end space-x-2">
                            <button onClick={() => setShowShareModal(false)} className="px-4 py-2 hover:bg-gray-700 rounded">Cancel</button>
                            <button onClick={handleSecureShare} disabled={!sharePassword} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded disabled:opacity-50">Generate</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Import Modal */}
            {showImportModal && (
                <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/80">
                    <div className="bg-gray-800 border border-green-500 rounded p-6 w-96 text-green-300">
                        <h3 className="text-lg font-bold mb-4 flex items-center"><DownloadIcon className="w-5 h-5 mr-2"/> Import Secure Package</h3>
                        <p className="text-xs mb-4 text-green-400">
                            Enter the password provided by the sender to decrypt the file into your "Not Mine" folder.
                        </p>
                        <input 
                            type="password" 
                            placeholder="Decryption Password" 
                            className="w-full bg-gray-900 border border-green-500/50 rounded p-2 mb-4 text-white focus:outline-none focus:border-green-500"
                            value={importPassword}
                            onChange={(e) => setImportPassword(e.target.value)}
                        />
                        <div className="flex space-x-2">
                            <input 
                                type="file" 
                                ref={secureImportInputRef} 
                                accept=".nexusvault" 
                                onChange={handleSecureImport}
                                className="hidden"
                            />
                            <button onClick={() => setShowImportModal(false)} className="px-4 py-2 hover:bg-gray-700 rounded">Cancel</button>
                            <button onClick={() => secureImportInputRef.current?.click()} disabled={!importPassword} className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded disabled:opacity-50 text-center">Select File</button>
                        </div>
                    </div>
                </div>
            )}
            
            {inputModal && (
                <InputModal 
                    title={inputModal.title}
                    label={inputModal.label}
                    onConfirm={inputModal.onConfirm}
                    onCancel={() => setInputModal(null)}
                />
            )}
        </div>
    );
};
