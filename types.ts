export interface CryptoKeys {
    publicKey: JsonWebKey;
    privateKey: JsonWebKey;
}

export interface Message {
  role: 'user' | 'model' | 'narrator';
  content: string;
  timestamp: string;
  characterId?: string; // Identifies which character sent a 'model' message
  attachment?: {
    type: 'image';
    status: 'loading' | 'done' | 'error';
    url?: string;
    prompt?: string;
  };
  // New security fields
  signature?: string; // Signed by user or character's private key
  publicKeyJwk?: JsonWebKey; // Public key of the signer for verification
}

export interface UISettings {
  backgroundImage?: string; // Now stores an image ID like 'nexus-image://uuid'
  bannerImage?: string; // Now stores an image ID
  avatarSize?: 'small' | 'medium' | 'large';
}

export interface ChatSession {
  id: string;
  characterIds: string[];
  name: string;
  messages: Message[];
  isArchived?: boolean;
  uiSettings?: UISettings;
  lorebookIds?: string[]; // New: Link to active lorebooks
}

export interface ApiConfig {
  service: 'default' | 'gemini' | 'openai';
  apiKey?: string;
  apiEndpoint?: string; // Base URL for OpenAI-compatible
  model?: string;
  rateLimit?: number; // Delay in milliseconds between requests
}

export interface EmbeddingConfig {
  service: 'gemini' | 'openai';
  apiKey?: string;
  apiEndpoint?: string;
  model?: string;
}

export interface RagSource {
    id: string;
    fileName: string;
    fileType: string;
    createdAt: string;
}

export interface Character {
  id:string;
  name: string;
  description: string;
  personality: string; // Will be used as Role Instruction
  avatarUrl: string; // Now stores an image ID like 'nexus-image://uuid'
  tags: string[];
  createdAt: string;
  apiConfig?: ApiConfig;
  // New fields for more detailed characters
  physicalAppearance?: string;
  personalityTraits?: string; // Comma-separated
  lore?: string[];
  memory?: string;
  voiceURI?: string; // For Text-to-Speech
  firstMessage?: string; // New: For character card compatibility
  characterType?: 'character' | 'narrator'; // New: Distinguish between persona and scenario bots
  // New RAG fields
  ragEnabled?: boolean;
  embeddingConfig?: EmbeddingConfig;
  ragSources?: RagSource[];
  // New per-character plugin fields
  pluginEnabled?: boolean;
  pluginCode?: string;
  // New security fields
  keys?: CryptoKeys; // Character's own signing key pair
  signature?: string; // Signed by the USER's master private key
  userPublicKeyJwk?: JsonWebKey; // User's public key that signed this character
  isArchived?: boolean;
}

export interface Plugin {
  id: string;
  name: string;
  description: string;
  code: string;
  enabled: boolean;
  settings?: {
    [key:string]: any;
  };
}

export interface LorebookEntry {
    id: string;
    keys: string[];
    content: string;
}

export interface Lorebook {
    id: string;
    name: string;
    description: string;
    entries: LorebookEntry[];
}

export interface AppData {
  characters: Character[];
  chatSessions: ChatSession[];
  plugins?: Plugin[];
  lorebooks?: Lorebook[]; // New: Store all lorebooks
  // New security field
  userKeys?: CryptoKeys;
}

// Types for the secure plugin API bridge
export type GeminiApiRequest = 
  | { type: 'generateContent'; prompt: string }
  | { type: 'generateImage'; prompt: string, settings?: { [key: string]: any } };

export interface PluginApiRequest {
  ticket: number;
  apiRequest: GeminiApiRequest;
}

export interface PluginApiResponse {
  ticket: number;
  result?: any;
  error?: string;
}

// RAG Types
export interface VectorChunk {
    id: string; // chunk-[uuid]
    characterId: string;
    sourceId: string;
    content: string;
    embedding: number[];
}

// Type for the new confirmation modal
export interface ConfirmationRequest {
  message: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}