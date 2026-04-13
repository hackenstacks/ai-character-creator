
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { ApiConfig, Character, Message } from "../types";
import { logger } from "./loggingService";

// Helper to convert blob to base64
export const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = reader.result as string;
            resolve(result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

const fetchWithRetry = async (
    url: RequestInfo, 
    options: RequestInit, 
    maxRetries = 3, 
    initialDelay = 2000,
    logError = true
): Promise<Response> => {
    let attempt = 0;
    while (attempt < maxRetries) {
        try {
            const response = await fetch(url, options);

            if (response.status === 429) {
                if (attempt + 1 >= maxRetries) {
                    if (logError) logger.warn(`API rate limit exceeded. All ${maxRetries} retries failed. Returning final error response.`);
                    return response;
                }
                const delay = initialDelay * Math.pow(2, attempt) + Math.random() * 1000;
                logger.warn(`API rate limit exceeded. Retrying in ${Math.round(delay / 1000)}s... (Attempt ${attempt + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                attempt++;
                continue;
            }
            return response;

        } catch (error) {
             if (attempt + 1 >= maxRetries) {
                if (logError) logger.error(`API request failed after ${maxRetries} attempts due to network errors.`, error);
                throw error; 
            }
            const delay = initialDelay * Math.pow(2, attempt) + Math.random() * 1000;
            if (logError) logger.warn(`Fetch failed due to a network error. Retrying in ${Math.round(delay / 1000)}s...`, error);
            await new Promise(resolve => setTimeout(resolve, delay));
            attempt++;
        }
    }
    throw new Error(`API request failed to complete after ${maxRetries} attempts.`);
};

const streamOpenAIChatResponse = async (
    config: ApiConfig,
    systemInstruction: string,
    history: Message[],
    onChunk: (chunk: string) => void
): Promise<void> => {
    try {
        const mappedMessages = history
            .filter(msg => msg.role === 'user' || msg.role === 'model' || msg.role === 'narrator')
            .map(msg => {
                const role = msg.role === 'model' ? 'assistant' : 'user';
                const content = msg.role === 'narrator' ? `[NARRATOR]: ${msg.content}` : msg.content;
                return { role, content };
            });

        const mergedMessages = [];
        if (mappedMessages.length > 0) {
            mergedMessages.push(mappedMessages[0]);
            for (let i = 1; i < mappedMessages.length; i++) {
                const prev = mergedMessages[mergedMessages.length - 1];
                const curr = mappedMessages[i];
                if (prev.role === curr.role) {
                    prev.content += `\n\n${curr.content}`; 
                } else {
                    mergedMessages.push(curr);
                }
            }
        }
        
        if (mergedMessages.length > 0 && mergedMessages[mergedMessages.length - 1].role === 'assistant') {
            if (mergedMessages.length > 1) {
                mergedMessages[mergedMessages.length - 1].role = 'user';
            } else {
                logger.warn("OpenAI stream called with a history containing only a single assistant message. This will likely fail.");
            }
        }

        const messages = [
            { role: "system", content: systemInstruction },
            ...mergedMessages
        ];

        const response = await fetchWithRetry((config.apiEndpoint || '').trim(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey?.trim() || 'ollama'}`,
            },
            body: JSON.stringify({
                model: config.model?.trim() || 'default',
                messages: messages,
                stream: true,
            }),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            if (response.status === 429) {
                throw new Error(`Rate limit exceeded: ${errorBody}`);
            }
            throw new Error(`API request failed with status ${response.status}: ${errorBody}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("Could not get response reader.");

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.substring(6);
                    if (jsonStr === '[DONE]') {
                        return;
                    }
                    try {
                        const parsed = JSON.parse(jsonStr);
                        const chunk = parsed.choices[0]?.delta?.content;
                        if (chunk) {
                            onChunk(chunk);
                        }
                    } catch (e) {
                        logger.warn("Failed to parse stream chunk JSON:", jsonStr);
                    }
                }
            }
        }
    } catch (error) {
        logger.error("Error in OpenAI-compatible stream:", error);
        onChunk(`Sorry, I encountered an error with the OpenAI-compatible API: ${error instanceof Error ? error.message : String(error)}`);
    }
};

const streamGeminiChatResponse = async (
    apiKey: string,
    model: string,
    systemInstruction: string,
    history: Message[],
    onChunk: (chunk: string) => void,
    character?: Character
): Promise<void> => {
    try {
        const ai = new GoogleGenAI({ apiKey });
        
        const pastMessages = history.slice(0, -1);
        const newMessage = history[history.length - 1];

        const geminiHistory = pastMessages
            .filter(m => m.role === 'user' || m.role === 'model')
            .map(m => ({
                role: m.role === 'model' ? 'model' : 'user',
                parts: [{ text: m.content }]
            }));
        
        // Configuration for tools and thinking
        const config: any = {
            systemInstruction: systemInstruction,
        };

        // Add Search Tool if enabled
        if (character?.useSearchGrounding) {
            config.tools = [{ googleSearch: {} }];
        }

        // Add Thinking Config if enabled (budget > 0)
        // Thinking is only available on 2.5/3.0 models.
        if (character?.thinkingBudget && character.thinkingBudget > 0) {
            config.thinkingConfig = { thinkingBudget: character.thinkingBudget };
        }

        const chat = ai.chats.create({
            model: model || 'gemini-3-flash-preview',
            config: config,
            history: geminiHistory
        });

        const prompt = newMessage.content || (newMessage.role === 'user' ? '...' : 'Continue');
        
        const result = await chat.sendMessageStream({ message: prompt });
        
        for await (const chunk of result) {
            // Handle search grounding chunks
            if (chunk.groundingMetadata?.groundingChunks) {
                const chunks = chunk.groundingMetadata.groundingChunks;
                // We can construct a footnote string or just append. 
                // For simplicity in this text stream, we append sources at the end if possible, 
                // but since it's streaming, we might just log them or append a marker.
                // NOTE: The main UI just displays text.
            }
            if (chunk.text) {
                onChunk(chunk.text);
            }
        }
    } catch (error) {
         logger.error("Error in Gemini stream:", error);
         onChunk(`[Error: ${error instanceof Error ? error.message : String(error)}]`);
    }
};

export const streamChatResponse = async (
    character: Character,
    participants: Character[],
    history: Message[],
    onChunk: (chunk: string) => void,
    systemOverride?: string
): Promise<void> => {
    // Construct System Instruction
    let systemInstruction = `You are playing the role of ${character.name}. ${character.description}\n\nPersonality: ${character.personality}`;
    if (character.physicalAppearance) systemInstruction += `\nAppearance: ${character.physicalAppearance}`;
    if (character.personalityTraits) systemInstruction += `\nTraits: ${character.personalityTraits}`;
    if (character.backstory) systemInstruction += `\nBackstory: ${character.backstory}`;
    if (character.lore && character.lore.length > 0) systemInstruction += `\nLore: ${character.lore.join(' ')}`;
    
    // Add Capability Instructions
    systemInstruction += `\n\n[CAPABILITIES]:
    1. INLINE IMAGES: If you want to show the user an image of what is happening or what you are imagining, output the tag: [generate_image: detailed visual description].
    2. DYNAMIC AVATAR: You can change your profile picture to match your current emotion, outfit, or situation. To do this, output the tag: [change_avatar: description of new look]. E.g. [change_avatar: smiling warmly wearing a summer dress]. Use this sparingly for effect.
    `;

    if (participants.length > 1) {
        const otherNames = participants.filter(p => p.id !== character.id).map(p => p.name).join(', ');
        systemInstruction += `\n\nYou are in a chat with: ${otherNames}.`;
    }
    
    if (systemOverride) {
        systemInstruction += `\n\n${systemOverride}`;
    }

    const config = character.apiConfig || { service: 'default' };

    if (config.service === 'openai') {
        return streamOpenAIChatResponse(config, systemInstruction, history, onChunk);
    } else {
        // Default to Gemini
        const apiKey = config.apiKey || process.env.API_KEY;
        if (!apiKey) {
            onChunk("Error: No API Key configured for Gemini.");
            return;
        }
        // Map common model aliases or use default
        let model = config.model || 'gemini-3-flash-preview';
        return streamGeminiChatResponse(apiKey, model, systemInstruction, history, onChunk, character);
    }
};

export const streamGenericResponse = async (
    systemInstruction: string,
    prompt: string,
    onChunk: (chunk: string) => void
): Promise<void> => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        onChunk("Error: No API Key available.");
        return;
    }
    try {
        const ai = new GoogleGenAI({ apiKey });
        const result = await ai.models.generateContentStream({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: { systemInstruction }
        });
        for await (const chunk of result) {
            onChunk(chunk.text);
        }
    } catch (error) {
        logger.error("Error in generic stream:", error);
        onChunk(`[Error: ${error instanceof Error ? error.message : String(error)}]`);
    }
};

export const generateContent = async (prompt: string, config?: ApiConfig): Promise<string> => {
    // If specific config is passed (e.g. for memory management), use it.
    if (config && config.service === 'openai') {
        // Simple one-shot for OpenAI
        let result = '';
        await streamOpenAIChatResponse(config, "You are a helpful assistant.", [{role: 'user', content: prompt, timestamp: ''}], (chunk) => result += chunk);
        return result;
    }

    const apiKey = config?.apiKey || process.env.API_KEY;
    if (!apiKey) throw new Error("No API Key available.");
    
    const ai = new GoogleGenAI({ apiKey });
    const modelName = config?.model || 'gemini-3-flash-preview';

    const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt
    });
    return response.text || '';
};

const buildImagePrompt = (prompt: string, settings: { [key: string]: any }): string => {
    let stylePrompt = '';
    if (settings.style && settings.style !== 'Default (None)') {
        if (settings.style === 'Custom' && settings.customStylePrompt) {
            stylePrompt = `${settings.customStylePrompt}, `;
        } else if (settings.style !== 'Custom') {
             stylePrompt = `${settings.style} style, `;
        }
    }
    const negativePrompt = settings.negativePrompt ? `. Negative prompt: ${settings.negativePrompt}` : '';
    return `${stylePrompt}${prompt}${negativePrompt}`;
};

const generateOpenAIImage = async (prompt: string, settings: { [key: string]: any }): Promise<string> => {
    const fullPrompt = buildImagePrompt(prompt, settings);
    logger.log("Generating OpenAI image with full prompt:", { fullPrompt });

    const response = await fetchWithRetry((settings.apiEndpoint || '').trim(), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.apiKey?.trim() || 'ollama'}`,
        },
        body: JSON.stringify({
            prompt: fullPrompt,
            model: settings.model?.trim() || 'dall-e-3',
            n: 1,
            size: "1024x1024",
            response_format: "b64_json",
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Image generation failed with status ${response.status}: ${errorBody}`);
    }

    const json = await response.json();
    const base64Image = json.data?.[0]?.b64_json;

    if (!base64Image) {
        throw new Error("API response did not contain image data.");
    }
    return `data:image/png;base64,${base64Image}`;
};

const generatePollinationsImage = async (prompt: string, settings: { [key: string]: any }): Promise<string> => {
    const fullPrompt = buildImagePrompt(prompt, settings);
    logger.log("Generating Pollinations image...", { fullPrompt });
    
    let model = settings.model ? `&model=${encodeURIComponent(settings.model)}` : '';
    const seed = Math.floor(Math.random() * 1000000000);
    const encodedPrompt = encodeURIComponent(fullPrompt);
    let url = `https://pollinations.ai/p/${encodedPrompt}?width=1024&height=1024${model}&seed=${seed}&nologo=true`;

    // Add API Key if present
    if (settings.apiKey) {
        url += `&api_key=${settings.apiKey}`;
    }

    try {
        const response = await fetchWithRetry(url, {
            method: 'GET',
        }, 3, 2000, false);

        if (!response.ok) {
            throw new Error(`Pollinations API failed with status ${response.status}`);
        }

        const blob = await response.blob();
        const base64 = await blobToBase64(blob);
        // blobToBase64 includes prefix usually, but check implementation
        return base64; 
    } catch (error) {
        logger.warn("Pollinations fetch failed (likely CORS), falling back to direct URL.");
        return url;
    }
};

export const generateImageFromPrompt = async (prompt: string, settings: { [key: string]: any }): Promise<string> => {
    const service = settings.service || 'pollinations';

    if (service === 'openai' || service === 'imagerouter') {
        return generateOpenAIImage(prompt, settings);
    } else if (service === 'gemini') {
         const apiKey = settings.apiKey || process.env.API_KEY;
         if (!apiKey) throw new Error("API Key required for Gemini Image Generation");
         const ai = new GoogleGenAI({ apiKey });
         const model = settings.model || 'gemini-2.5-flash-image';
         // Gemini 2.5 Flash Image uses generateContent for images
         const response = await ai.models.generateContent({
             model,
             contents: { parts: [{ text: buildImagePrompt(prompt, settings) }] }
         });
         
         // Extract image from response
         // Note: Actual extraction depends on model output format which might be base64 in inlineData
         // For nano banana series (gemini-2.5-flash-image), it returns inlineData.
         // We need to iterate parts.
         for (const candidate of response.candidates || []) {
             for (const part of candidate.content.parts) {
                 if (part.inlineData) {
                     return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                 }
             }
         }
         throw new Error("No image data found in Gemini response.");

    } else {
        // Default to Pollinations (handles Hugging Face, AI Horde, etc via URL construction or fallback)
        // Note: For real implementations of Stability/HuggingFace auth, specific handlers would be needed.
        // Pollinations is a good generic fallback proxy.
        return generatePollinationsImage(prompt, settings);
    }
};
