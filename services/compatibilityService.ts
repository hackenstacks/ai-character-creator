import { Character, Lorebook, LorebookEntry } from '../types.ts';
import { logger } from './loggingService.ts';

// --- Utilities ---

/**
 * Fetches an image from a URL and converts it to a base64 data string.
 * Handles various image types and CORS issues by fetching through the app's context.
 */
const imageUrlToBase64 = async (url: string): Promise<string> => {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.statusText}`);
        }
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        logger.warn(`Could not convert image URL to base64. It might be a CORS issue or an invalid URL. URL: ${url}`, error);
        return ''; // Return empty string or a default placeholder if needed
    }
};

const getBase64FromDataUrl = (dataUrl: string): string => {
    return dataUrl.substring(dataUrl.indexOf(',') + 1);
}

// --- Conversion Logic ---

/**
 * Converts an AI Nexus character object to a Character Card v2 compatible object.
 * It embeds AI Nexus specific data in a private `_aiNexusData` block for lossless re-import.
 */
export const nexusToV2 = async (character: Character): Promise<any> => {
    logger.log(`Starting character export for: ${character.name}`);
    
    let char_persona = `## ${character.name}\n`;
    if (character.description) char_persona += `${character.description}\n\n`;

    char_persona += "### Physical Appearance\n";
    char_persona += `${character.physicalAppearance || 'Not specified'}\n\n`;
    
    char_persona += "### Personality Traits\n";
    char_persona += `${character.personalityTraits || 'Not specified'}\n\n`;

    if (character.lore && character.lore.length > 0) {
        char_persona += "### Lore\n";
        char_persona += character.lore.map(fact => `- ${fact}`).join('\n') + '\n\n';
    }

    const avatarDataUrl = character.avatarUrl.startsWith('data:image') 
        ? character.avatarUrl 
        : await imageUrlToBase64(character.avatarUrl);
    
    const base64Avatar = avatarDataUrl ? getBase64FromDataUrl(avatarDataUrl) : '';

    const cardData = {
        name: character.name,
        description: character.description,
        personality: character.personality,
        first_mes: character.firstMessage, 
        mes_example: '',
        scenario: '',
        char_persona: char_persona.trim(),
        avatar: base64Avatar,
        // Private block for perfect re-import into AI Nexus
        _aiNexusData: {
            version: '1.1',
            id: character.id,
            name: character.name,
            description: character.description,
            personality: character.personality,
            avatarUrl: character.avatarUrl,
            tags: character.tags,
            createdAt: character.createdAt,
            physicalAppearance: character.physicalAppearance,
            personalityTraits: character.personalityTraits,
            lore: character.lore,
            memory: character.memory,
            apiConfig: character.apiConfig,
            firstMessage: character.firstMessage,
            characterType: character.characterType,
            keys: { publicKey: character.keys?.publicKey }, // Only export public key
            signature: character.signature,
            userPublicKeyJwk: character.userPublicKeyJwk
        }
    };
    
    return {
        spec: 'chara_card_v2',
        spec_version: '2.0',
        data: cardData
    };
};

/**
 * Converts a Character Card v2 compatible object into an AI Nexus Character.
 * It prioritizes the private `_aiNexusData` block if it exists.
 * It can also auto-detect narrator/scenario bots and parse their content into a Lorebook.
 */
export const v2ToNexus = (card: any): { character: Character, lorebook?: Lorebook } | null => {
    const isV2Spec = card.spec === 'chara_card_v2' || card.spec === 'chara_card_v2.0';
    const data = card.data || card; 
    
    if (!data || !data.name) {
        return null; 
    }

    if (Array.isArray(data.characterIds) && Array.isArray(data.messages)) {
        logger.debug(`File identified as Chat Session, not a character card. Skipping v2ToNexus.`);
        return null;
    }

    const hasCharFields = data.description !== undefined || 
                          data.personality !== undefined || 
                          data.char_persona !== undefined || 
                          isV2Spec;

    if (!hasCharFields) {
         logger.debug(`File does not contain character-specific fields (description, personality, etc.). Skipping v2ToNexus.`);
        return null;
    }

    if (data._aiNexusData) {
        logger.log(`Importing character "${data.name}" using _aiNexusData block.`);
        const nexusData = data._aiNexusData;
        const character: Character = {
            ...nexusData,
            id: crypto.randomUUID(),
            keys: undefined,
        };
        return { character };
    }

    logger.log(`Importing standard character card: ${data.name}`);
    
    const avatarUrl = data.avatar?.startsWith('http') ? data.avatar : (data.avatar ? `data:image/png;base64,${data.avatar}` : '');
    
    const shortDescription = (data.description?.split('\n')[0] || data.creator_notes || `A character named ${data.name}`).substring(0, 200);

    let combinedPersonality = '';
    if (data.system_prompt) combinedPersonality += `${data.system_prompt.trim()}\n\n`;
    if (data.personality) combinedPersonality += `${data.personality.trim()}\n\n`;
    if (data.description) combinedPersonality += `${data.description.trim()}\n\n`;
    if (data.scenario) combinedPersonality += `Scenario: ${data.scenario.trim()}\n\n`;
    if (data.char_persona) combinedPersonality += `${data.char_persona.trim()}\n\n`;
    if (data.mes_example) combinedPersonality += `Example Messages:\n${data.mes_example.trim()}\n\n`;
    if (data.post_history_instructions) combinedPersonality += `Post History Instructions: ${data.post_history_instructions.trim()}\n\n`;

    const contentFields = combinedPersonality.toLowerCase();
    const narratorKeywords = ["narrator", "dungeon master", "game master", "setting", "scenario", "world", "text based game"];
    const isNarrator = narratorKeywords.some(kw => contentFields.includes(kw));

    let autoLorebook: Lorebook | undefined = undefined;

    // Auto-parse lorebook from narrator cards that use markdown-style headers
    if (isNarrator) {
        const loreEntries: LorebookEntry[] = [];
        const sections = combinedPersonality.split(/\n(?=\*\*)/); // Split by lines that start with **
        
        for (const section of sections) {
            const match = section.match(/^\*\*(.*?)\*\*\s*\n([\s\S]*)/);
            if (match) {
                const key = match[1].trim();
                const content = match[2].trim();
                if (key && content && key.length < 100) { // Basic sanity check
                    loreEntries.push({
                        id: crypto.randomUUID(),
                        keys: [key],
                        content: content
                    });
                }
            }
        }

        if (loreEntries.length > 0) {
            logger.log(`Automatically parsed ${loreEntries.length} entries into a new Lorebook for "${data.name}".`);
            autoLorebook = {
                id: crypto.randomUUID(),
                name: `${data.name} World`,
                description: `Auto-generated from the ${data.name} character card.`,
                entries: loreEntries
            };
        }
    }

    const newCharacter: Character = {
        id: crypto.randomUUID(),
        name: data.name,
        description: shortDescription,
        personality: combinedPersonality.trim(),
        firstMessage: data.first_mes || '',
        avatarUrl: avatarUrl,
        tags: data.tags || [],
        createdAt: new Date().toISOString(),
        characterType: isNarrator ? 'narrator' : 'character',
        physicalAppearance: '', 
        personalityTraits: (data.tags || []).join(', '),
        lore: [],
        memory: `Memory of ${data.name} begins here.`,
    };

    return { character: newCharacter, lorebook: autoLorebook };
};

/**
 * Converts a SillyTavern World Info JSON into an AI Nexus Lorebook.
 */
export const sillyTavernWorldInfoToNexus = (data: any, fileName: string): Omit<Lorebook, 'id'> | null => {
    // Handle both the object-based and array-based formats
    let entriesData: any[] = [];
    if (data && typeof data === 'object' && !Array.isArray(data)) {
        if (data.entries && typeof data.entries === 'object') {
            entriesData = Object.values(data.entries);
        } else if (Array.isArray(data.entries)) {
            entriesData = data.entries;
        }
    } else if (Array.isArray(data)) {
        entriesData = data;
    }

    if (entriesData.length === 0) return null;
    
    const firstEntry = entriesData[0];
    const isWorldInfo = typeof firstEntry === 'object' && Array.isArray(firstEntry.key) && typeof firstEntry.content === 'string';
    const isAgnaistic = typeof firstEntry === 'object' && Array.isArray(firstEntry.keys) && typeof firstEntry.content === 'string';
    
    if (!isWorldInfo && !isAgnaistic) {
        return null;
    }

    logger.log(`Detected SillyTavern/Agnaistic World Info format from file: ${fileName}`);

    const entries: LorebookEntry[] = entriesData
        .filter(entry => entry && (Array.isArray(entry.key) || Array.isArray(entry.keys)) && typeof entry.content === 'string' && entry.enabled !== false)
        .map(entry => ({
            id: crypto.randomUUID(),
            keys: (entry.keys || entry.key).map((k: string) => k.trim()).filter((k: string) => k),
            content: entry.content
        }));
    
    const lorebookName = data.name || fileName.replace(/\.[^/.]+$/, "");

    return {
        name: lorebookName,
        description: data.description || `Imported from ${fileName}`,
        entries: entries,
    };
};