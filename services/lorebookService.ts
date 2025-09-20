import { Message, Lorebook } from '../types.ts';
import { logger } from './loggingService.ts';

const MAX_CONTEXT_SCAN_LENGTH = 2000; // Scan the last ~2000 characters of conversation
const MAX_CONTEXT_INJECTION = 1000; // Inject a maximum of 1000 characters of lore

/**
 * Scans recent messages for keywords from active lorebooks and returns relevant content.
 * @param messages The full message history of the chat.
 * @param lorebooks An array of Lorebook objects attached to the chat.
 * @returns A string containing the relevant lore, or null if no keywords are found.
 */
export const findRelevantLore = (messages: Message[], lorebooks: Lorebook[]): string | null => {
    if (!lorebooks || lorebooks.length === 0) {
        return null;
    }

    // Combine recent messages into a single text block for efficient scanning.
    let recentText = messages
        .slice(-5) // Look at the last 5 messages
        .map(m => m.content)
        .join(' ')
        .toLowerCase();
    
    // Cap the length to avoid performance issues on very long messages.
    if (recentText.length > MAX_CONTEXT_SCAN_LENGTH) {
        recentText = recentText.slice(-MAX_CONTEXT_SCAN_LENGTH);
    }
    
    const triggeredEntries = new Set<string>();

    for (const book of lorebooks) {
        for (const entry of book.entries) {
            for (const key of entry.keys) {
                const lowerKey = key.toLowerCase().trim();
                if (lowerKey && recentText.includes(lowerKey)) {
                    // Using a Set ensures we don't add the same content twice
                    // if multiple keywords from the same entry are triggered.
                    triggeredEntries.add(entry.content);
                    break; // Move to the next entry once one key is matched.
                }
            }
        }
    }

    if (triggeredEntries.size === 0) {
        return null;
    }

    logger.log(`Lorebook triggered ${triggeredEntries.size} entries.`);
    
    let combinedContent = Array.from(triggeredEntries).join('\n---\n');

    // Cap the total injected content to prevent oversized prompts.
    if (combinedContent.length > MAX_CONTEXT_INJECTION) {
        combinedContent = combinedContent.slice(0, MAX_CONTEXT_INJECTION) + '...';
    }

    return combinedContent;
};
