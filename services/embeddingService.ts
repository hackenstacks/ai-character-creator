import { GoogleGenAI, EmbedContentResponse } from "@google/genai";
import { EmbeddingConfig } from "../types";
import { logger } from "./loggingService";

// --- Gemini Client Setup ---
const API_KEY = typeof process !== 'undefined' ? process.env.API_KEY : undefined;
let defaultAi: GoogleGenAI | null = null;

if (API_KEY) {
  defaultAi = new GoogleGenAI({ apiKey: API_KEY });
} else {
  const errorMsg = "API_KEY environment variable not set. The application will not be able to connect to the Gemini API by default.";
  logger.warn(errorMsg);
}

const getAiClient = (apiKey?: string): GoogleGenAI => {
    if (apiKey) {
        logger.debug("Creating a new Gemini client for embeddings with a custom API key.");
        return new GoogleGenAI({ apiKey });
    }
    if (defaultAi) {
        return defaultAi;
    }
    throw new Error("Default Gemini API key not configured. Please set a custom API key for the character or plugin.");
}


const withRetry = async <T>(
    apiCall: () => Promise<T>,
    maxRetries = 3,
    initialDelay = 2000
): Promise<T> => {
    let attempt = 0;
    while (attempt < maxRetries) {
        try {
            return await apiCall();
        } catch (error: any) {
            let isRateLimitError = false;
            let errorMessage = "An unknown error occurred";

            if (error && typeof error.message === 'string') {
                 errorMessage = error.message;
                 // FIX: Corrected typo in 'RESOURCE_EXHAUSTED'
                 if (errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
                     isRateLimitError = true;
                 }
            } else if (error instanceof Response && error.status === 429) {
                isRateLimitError = true;
            }

            if (isRateLimitError) {
                 if (attempt + 1 >= maxRetries) {
                    logger.warn(`API rate limit exceeded. All ${maxRetries} retries failed. Rethrowing final error.`);
                    throw error;
                }
                const delay = initialDelay * Math.pow(2, attempt) + Math.random() * 1000;
                logger.warn(`API rate limit exceeded. Retrying in ${Math.round(delay / 1000)}s... (Attempt ${attempt + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                attempt++;
                continue;
            }
            
            logger.error("API call failed with non-retriable error:", error);
            throw error;
        }
    }
    throw new Error('API request failed to complete after all retries.');
};

const generateGeminiEmbedding = async (text: string, config: EmbeddingConfig): Promise<number[]> => {
    const ai = getAiClient(config.apiKey);
    // FIX: The compiler suggests 'contents' (plural) for the parameter name.
    const result: EmbedContentResponse = await withRetry(() => ai.models.embedContent({
        model: "text-embedding-004",
        contents: text
    }));
    // FIX: The compiler suggests the response object has an 'embeddings' property, not 'embedding'.
    return (result as any).embeddings.values;
};

const generateOpenAIEmbedding = async (text: string, config: EmbeddingConfig): Promise<number[]> => {
    if (!config.apiEndpoint) throw new Error("OpenAI-compatible embedding endpoint is not configured.");

    const response = await fetch(config.apiEndpoint.trim(), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey?.trim() || 'ollama'}`,
        },
        body: JSON.stringify({
            model: config.model?.trim() || 'nomic-embed-text',
            prompt: text, // Ollama uses 'prompt', OpenAI uses 'input'
            input: text,
        }),
    });

    if (response.status === 429) {
        throw response; // Throw response to be caught by withRetry
    }
    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Embedding API request failed with status ${response.status}: ${errorBody}`);
    }
    
    const json = await response.json();
    
    // Handle different response structures (Ollama vs OpenAI)
    const embedding = json.embedding || json.data?.[0]?.embedding;

    if (!embedding) {
        throw new Error("API response did not contain embedding data.");
    }
    return embedding;
};

export const generateEmbedding = async (text: string, config: EmbeddingConfig): Promise<number[]> => {
    try {
        if (config.service === 'openai') {
            logger.debug(`Generating embedding with OpenAI-compatible API. Endpoint: ${config.apiEndpoint}`);
            return await withRetry(() => generateOpenAIEmbedding(text, config));
        } else { // Default to Gemini
            logger.debug("Generating embedding with Gemini API.");
            return await generateGeminiEmbedding(text, config);
        }
    } catch (error) {
        logger.error("Failed to generate embedding:", error);
        throw new Error(`Embedding generation failed. Check API configuration and logs. Details: ${error instanceof Error ? error.message : String(error)}`);
    }
};