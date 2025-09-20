import { Character, RagSource, VectorChunk } from '../types';
import { logger } from './loggingService';
import * as embeddingService from './embeddingService';
import * as db from './secureStorage';

// --- Text Processing ---

const chunkText = (text: string, chunkSize = 1000, overlap = 200): string[] => {
    const chunks: string[] = [];
    let i = 0;
    while (i < text.length) {
        const end = Math.min(i + chunkSize, text.length);
        chunks.push(text.slice(i, end));
        i += chunkSize - overlap;
        if (i + overlap >= text.length) {
             i = text.length; // exit condition
        }
    }
    return chunks;
};

const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
};

// --- Vector Operations ---

const calculateCosineSimilarity = (vecA: number[], vecB: number[]): number => {
    if (vecA.length !== vecB.length || vecA.length === 0) {
        return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) {
        return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};


// --- Main RAG Logic ---

export const processAndIndexFile = async (
    file: File,
    character: Character,
    onProgress: (progress: string) => void
): Promise<RagSource> => {
    if (!character.embeddingConfig) {
        throw new Error("Embedding configuration is missing for this character.");
    }
    
    const newSource: RagSource = {
        id: `source-${crypto.randomUUID()}`,
        fileName: file.name,
        fileType: file.type,
        createdAt: new Date().toISOString(),
    };

    onProgress(`Reading file: ${file.name}...`);
    const content = await readFileAsText(file);
    
    onProgress(`Chunking text...`);
    const textChunks = chunkText(content);
    logger.log(`File chunked into ${textChunks.length} pieces.`);

    const vectorChunks: VectorChunk[] = [];
    for (let i = 0; i < textChunks.length; i++) {
        const chunk = textChunks[i];
        onProgress(`Generating embedding for chunk ${i + 1} of ${textChunks.length}...`);
        try {
            const embedding = await embeddingService.generateEmbedding(chunk, character.embeddingConfig);
            vectorChunks.push({
                id: `chunk-${crypto.randomUUID()}`,
                characterId: character.id,
                sourceId: newSource.id,
                content: chunk,
                embedding: embedding,
            });
        } catch (error) {
            logger.error(`Failed to generate embedding for chunk ${i+1}`, error);
            // Decide if we should stop or continue. For now, we stop on error.
            throw new Error(`Failed to process chunk ${i+1}. Check embedding API settings.`);
        }
    }
    
    onProgress(`Saving ${vectorChunks.length} vectors to the database...`);
    await db.saveVectorChunks(vectorChunks);

    logger.log(`Successfully indexed file "${file.name}" for character "${character.name}"`);
    return newSource;
};

export const deleteSource = async (sourceId: string): Promise<void> => {
    await db.deleteVectorChunksBySource(sourceId);
    logger.log(`Deleted all vector chunks for source ID: ${sourceId}`);
};

export const findRelevantContext = async (
    query: string,
    character: Character,
    topK = 3
): Promise<string | null> => {
    if (!character.embeddingConfig) {
        logger.warn("Cannot find relevant context: character has no embedding config.");
        return null;
    }
    
    try {
        const queryEmbedding = await embeddingService.generateEmbedding(query, character.embeddingConfig);
        const characterChunks = await db.getVectorChunksByCharacter(character.id);

        if (characterChunks.length === 0) {
            logger.log("No knowledge base found for this character to search.");
            return null;
        }

        const scoredChunks = characterChunks.map(chunk => ({
            ...chunk,
            similarity: calculateCosineSimilarity(queryEmbedding, chunk.embedding),
        }));

        scoredChunks.sort((a, b) => b.similarity - a.similarity);

        const topChunks = scoredChunks.slice(0, topK);
        
        logger.debug(`Found ${topChunks.length} relevant chunks for query.`, { query, topChunks });

        return topChunks.map(chunk => chunk.content).join('\n\n---\n\n');

    } catch (error) {
        logger.error("Error finding relevant context:", error);
        // Re-throw so the UI can catch it and inform the user
        throw error;
    }
};