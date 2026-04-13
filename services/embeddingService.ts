import { GoogleGenAI } from "@google/genai";
import { EmbeddingConfig } from "../types";

export const generateEmbedding = async (text: string, config: EmbeddingConfig): Promise<number[]> => {
    const apiKey = config.apiKey || process.env.API_KEY;
    if (!apiKey) throw new Error("API Key required for embeddings. Please check your configuration.");
    
    const ai = new GoogleGenAI({ apiKey });
    
    // Use 'text-embedding-004' as standard, or config provided model
    const model = config.model || "text-embedding-004";

    const response = await ai.models.embedContent({
        model: model,
        contents: text
    });
    
    // The response structure from @google/genai for embedContent
    if (response && response.embedding && response.embedding.values) {
        return response.embedding.values;
    }
    
    throw new Error("Failed to generate embedding: No values returned from API.");
};
