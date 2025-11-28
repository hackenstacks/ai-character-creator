// The correct type for a stream response is an async iterable of `GenerateContentResponse`.
import { GoogleGenAI, GenerateContentResponse, GenerateImagesResponse } from "@google/genai";
import { Character, Message, ApiConfig } from "../types";
import { logger } from "./loggingService";

// --- Rate Limiting ---
const lastRequestTimestamps = new Map<string, number>();

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
        logger.debug("Creating a new Gemini client with a custom API key.");
        return new GoogleGenAI({ apiKey });
    }
    if (defaultAi) {
        return defaultAi;
    }
    throw new Error("Default Gemini API key not configured. Please set a custom API key for the character or plugin.");
}

// --- Helper: Blob to Base64 ---
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// --- OpenAI Compatible Service ---

/**
 * A generic wrapper for async functions that includes a retry mechanism with exponential backoff.
 * This is useful for handling rate limiting (429) and transient network issues.
 */
const withRetry = async <T,>(
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
                 if (errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
                     isRateLimitError = true;
                 }
            }

            // Retry only on rate limit errors
            if (isRateLimitError) {
                 if (attempt + 1 >= maxRetries) {
                    logger.warn(`API rate limit exceeded. All ${maxRetries} retries failed. Rethrowing final error.`);
                    throw error;
                }
                const delay = initialDelay * Math.pow(2, attempt) + Math.random() * 1000;
                logger.warn(`API rate limit exceeded. Retrying in ${Math.round(delay / 1000)}s... (Attempt ${attempt + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                attempt++;
                continue; // Continue to the next attempt
            }
            
            // For any other error, rethrow it immediately
            logger.error("API call failed with non-retriable error:", error);
            throw error;
        }
    }
    throw new Error('API request failed to complete after all retries.');
};

const fetchWithRetry = async (
    url: RequestInfo, 
    options: RequestInit, 
    maxRetries = 3, 
    initialDelay = 2000
): Promise<Response> => {
    let attempt = 0;
    while (attempt < maxRetries) {
        try {
            const response = await fetch(url, options);

            if (response.status === 429) {
                if (attempt + 1 >= maxRetries) {
                    logger.warn(`API rate limit exceeded. All ${maxRetries} retries failed. Returning final error response to be handled by caller.`);
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
                logger.error(`API request failed after ${maxRetries} attempts due to network errors.`, error);
                throw error; 
            }
            const delay = initialDelay * Math.pow(2, attempt) + Math.random() * 1000;
            logger.warn(`Fetch failed due to a network error. Retrying in ${Math.round(delay / 1000)}s...`, error);
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
                let errorMessage = `The API is rate-limiting requests.`;
                try {
                    const parsedError = JSON.parse(errorBody);
                    if (parsedError.message) {
                        errorMessage += ` Message: ${parsedError.message}`;
                    }
                } catch (e) {
                    errorMessage += ` Details: ${errorBody}`;
                }
                logger.error("OpenAI-compatible stream failed due to rate limiting after all retries.", { status: response.status, body: errorBody });
                throw new Error(errorMessage);
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

// --- Image Generators ---

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
    
    // Construct URL parameters
    const model = settings.model ? `&model=${encodeURIComponent(settings.model)}` : '';
    const seed = Math.floor(Math.random() * 1000000000);
    // Ensure prompt is properly encoded
    const encodedPrompt = encodeURIComponent(fullPrompt);
    const url = `https://pollinations.ai/p/${encodedPrompt}?width=1024&height=1024${model}&seed=${seed}&nologo=true`;

    try {
        const response = await fetchWithRetry(url, {
            method: 'GET',
        });

        if (!response.ok) {
            throw new Error(`Pollinations API failed with status ${response.status}`);
        }

        const blob = await response.blob();
        return await blobToBase64(blob);
    } catch (error) {
        logger.warn("Pollinations fetch failed, falling back to direct URL. Error:", error);
        // Fallback: Return the direct URL. The UI can display this, though it won't be saved as a base64 snapshot.
        // This handles cases where CORS blocks the fetch but the browser can still display the image tag.
        return url;
    }
};

const generateHuggingFaceImage = async (prompt: string, settings: { [key: string]: any }): Promise<string> => {
    const fullPrompt = buildImagePrompt(prompt, settings);
    const model = settings.model || 'stabilityai/stable-diffusion-xl-base-1.0';
    const endpoint = `https://api-inference.huggingface.co/models/${model}`;
    const apiKey = settings.apiKey;

    logger.log(`Generating Hugging Face image with model ${model}...`);

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    
    // Only add Authorization if key is present. Many HF models work free (rate-limited) without a key.
    if (apiKey && apiKey.trim()) {
        headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetchWithRetry(endpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ inputs: fullPrompt }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Hugging Face API failed: ${errorBody}`);
    }

    const blob = await response.blob();
    return await blobToBase64(blob);
};

const generateStabilityImage = async (prompt: string, settings: { [key: string]: any }): Promise<string> => {
    const fullPrompt = buildImagePrompt(prompt, settings);
    const engineId = settings.model || 'stable-diffusion-xl-1024-v1-0';
    const apiKey = settings.apiKey;
    const url = `https://api.stability.ai/v1/generation/${engineId}/text-to-image`;

    logger.log(`Generating Stability.ai image with model ${engineId}...`);

    if (!apiKey) {
        throw new Error("Stability.ai API key is required.");
    }

    const response = await fetchWithRetry(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            text_prompts: [
                {
                    text: fullPrompt,
                    weight: 1
                }
            ],
            cfg_scale: 7,
            height: 1024,
            width: 1024,
            samples: 1,
            steps: 30,
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Stability API failed: ${errorBody}`);
    }

    const json = await response.json();
    const base64Image = json.artifacts?.[0]?.base64;

    if (!base64Image) {
        throw new Error("Stability API response did not contain image data.");
    }
    return `data:image/png;base64,${base64Image}`;
};

// --- AI Horde Generator ---
const generateAIHordeImage = async (prompt: string, settings: { [key: string]: any }): Promise<string> => {
    const fullPrompt = buildImagePrompt(prompt, settings);
    logger.log("Submitting job to AI Horde...", { fullPrompt });

    const apiKey = settings.apiKey || '0000000000'; // Anonymous key if none provided
    const model = settings.model || 'stable_diffusion';
    
    // 1. Submit Generation Request
    const submitResponse = await fetch("https://stablehorde.net/api/v2/generate/async", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "apikey": apiKey,
            "Client-Agent": "AI-Nexus:1.0:Unknown",
        },
        body: JSON.stringify({
            prompt: fullPrompt,
            params: {
                n: 1,
                width: 512,
                height: 512, // Keep small for free tier speed
                steps: 30,
                karras: true,
                tiling: false,
                hires_fix: false,
                clip_skip: 1,
                sampler_name: "k_euler",
            },
            nsfw: true, // Allow NSFW if the user wants, filtering handled by client or prompt
            censor_nsfw: false,
            trusted_workers: false,
            models: [model],
        }),
    });

    if (!submitResponse.ok) {
        const errText = await submitResponse.text();
        throw new Error(`AI Horde submission failed: ${errText}`);
    }

    const submitJson = await submitResponse.json();
    const id = submitJson.id;
    if (!id) throw new Error("AI Horde did not return a Job ID.");

    logger.log(`AI Horde Job ID: ${id}. Polling for status...`);

    // 2. Poll for Status
    let attempts = 0;
    const maxAttempts = 60; // Wait up to 2-3 minutes approx (assuming 2-3s delay)
    
    while (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 2000 + attempts * 100)); // Exponential backoff polling
        attempts++;

        const statusResponse = await fetch(`https://stablehorde.net/api/v2/generate/check/${id}`);
        if (!statusResponse.ok) continue; // Transient network error, retry

        const statusJson = await statusResponse.json();
        
        if (statusJson.done) {
            // 3. Retrieve Result
            const resultResponse = await fetch(`https://stablehorde.net/api/v2/generate/status/${id}`);
            if (!resultResponse.ok) throw new Error("Failed to retrieve final AI Horde result.");
            
            const resultJson = await resultResponse.json();
            const generation = resultJson.generations?.[0];
            
            if (generation && generation.img) {
                // Determine if it's a URL or base64 (Horde usually returns URL)
                const imgData = generation.img;
                if (imgData.startsWith('http')) {
                    // It's a URL, fetch it
                    try {
                        const imgFetch = await fetch(imgData);
                        if (!imgFetch.ok) throw new Error("Fetch failed");
                        const blob = await imgFetch.blob();
                        return await blobToBase64(blob);
                    } catch (e) {
                        logger.warn("Failed to fetch Horde image blob, returning URL.", e);
                        return imgData; // Fallback to URL if fetch fails
                    }
                } else {
                    // It might be raw R2 output or base64 (less common now but possible)
                    return `data:image/webp;base64,${imgData}`; // Horde usually returns WebP
                }
            }
            throw new Error("AI Horde generation completed but no image data found.");
        }
        
        if (statusJson.faulted) {
            throw new Error("AI Horde generation faulted/failed on worker.");
        }
        
        if (statusJson.wait_time > 0) {
             logger.debug(`Horde queue position: ${statusJson.queue_position}, Est. wait: ${statusJson.wait_time}s`);
        }
    }
    
    throw new Error("AI Horde generation timed out.");
};


// --- Gemini Service ---

const buildSystemInstruction = (character: Character, allParticipants: Character[] = []): string => {
    let instruction = `You are an AI character named ${character.name}.\n\n`;

    if (allParticipants.length > 1) {
        const otherParticipantNames = allParticipants
            .filter(p => p.id !== character.id)
            .map(p => p.name)
            .join(', ');
        instruction += `You are in a group conversation with: ${otherParticipantNames}. Interact with them naturally based on your persona.\n\n`;
    }

    instruction += "== CORE IDENTITY ==\n";
    if (character.description) instruction += `Description: ${character.description}\n`;
    if (character.physicalAppearance) instruction += `Physical Appearance: ${character.physicalAppearance}\n`;
    if (character.personalityTraits) instruction += `Personality Traits: ${character.personalityTraits}\n`;
    instruction += "\n";

    if (character.personality) {
        instruction += "== ROLE INSTRUCTION ==\n";
        instruction += `${character.personality}\n\n`;
    }

    if (character.memory) {
        instruction += "== MEMORY (Recent Events) ==\n";
        instruction += `${character.memory}\n\n`;
    }

    if (character.lore && character.lore.length > 0 && character.lore.some(l => l.trim() !== '')) {
        instruction += "== LORE (Key Facts) ==\n";
        instruction += character.lore.filter(fact => fact.trim() !== '').map(fact => `- ${fact}`).join('\n') + '\n\n';
    }

    instruction += "== TOOLS ==\n";
    instruction += "You have the ability to generate images. To do so, include a special command in your response: [generate_image: A detailed description of the image you want to create]. You can place this command anywhere in your response. The system will detect it, generate the image, and display it alongside your text.\n\n";
    
    instruction += "Engage in conversation based on this complete persona. Do not break character. Respond to the user's last message.";

    return instruction;
};

const normalizeGeminiHistory = (history: Message[]) => {
    const relevantMessages = history.filter(msg => msg.role === 'user' || msg.role === 'model' || msg.role === 'narrator');
    if (relevantMessages.length === 0) return [];

    const mapped = relevantMessages.map(msg => {
        // Treat narrator messages as user inputs so the AI can react to them
        const role = msg.role === 'model' ? 'model' : 'user';
        const content = msg.role === 'narrator' ? `[NARRATOR]: ${msg.content}` : msg.content;
        return { role, parts: [{ text: content }] };
    });

    const merged = [];
    if (mapped.length > 0) {
        merged.push(mapped[0]);
        for (let i = 1; i < mapped.length; i++) {
            const prev = merged[merged.length - 1];
            const curr = mapped[i];
            if (prev.role === curr.role) {
                // Merge consecutive messages of the same role
                prev.parts[0].text += `\n\n${curr.parts[0].text}`;
            } else {
                merged.push(curr);
            }
        }
    }
    
    if (merged.length > 0 && merged[merged.length - 1].role === 'model') {
        logger.debug("Last message was from model, changing role to user for API compatibility.");
        merged[merged.length - 1].role = 'user';
    }

    return merged;
};

const streamGeminiChatResponse = async (
    character: Character,
    systemInstruction: string,
    history: Message[],
    onChunk: (chunk: string) => void
): Promise<void> => {
    try {
        const customApiKey = character.apiConfig?.service === 'gemini' ? character.apiConfig.apiKey : undefined;
        if (customApiKey) {
            logger.log(`Using custom Gemini API key for character: ${character.name}`);
        }

        const ai = getAiClient(customApiKey);
        
        const contents = normalizeGeminiHistory(history);
        if (contents.length === 0) {
            logger.warn("streamGeminiChatResponse was called with an empty effective history. Aborting.");
            return;
        }

        const responseStream: AsyncIterable<GenerateContentResponse> = await withRetry(() => ai.models.generateContentStream({
            model: 'gemini-2.5-flash',
            contents: contents,
            config: { systemInstruction: systemInstruction }
        }));

        for await (const chunk of responseStream) {
            onChunk(chunk.text);
        }
    } catch (error) {
        logger.error("Error generating Gemini content stream:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        onChunk(`Sorry, an error occurred with the Gemini API: ${errorMessage}`);
    }
};

const generateGeminiImage = async (prompt: string, settings: { [key: string]: any }): Promise<string> => {
    const ai = getAiClient(settings?.apiKey);
    const fullPrompt = buildImagePrompt(prompt, settings);
    logger.log("Generating Gemini image with full prompt:", { fullPrompt });

    // Use gemini-2.5-flash-image for general image generation as default
    try {
        const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [{ text: fullPrompt }],
            },
            config: {
                imageConfig: {
                    aspectRatio: "1:1",
                }
            }
        }));

        const candidates = response.candidates;
        if (!candidates || candidates.length === 0) {
             throw new Error("No candidates returned from Gemini API.");
        }

        const parts = candidates[0].content?.parts || [];
        
        // Priority 1: Check for Image data
        for (const part of parts) {
            if (part.inlineData) {
                const base64EncodeString: string = part.inlineData.data;
                return `data:image/png;base64,${base64EncodeString}`;
            }
        }

        // Priority 2: Check for refusal text if no image found
        for (const part of parts) {
            if (part.text) {
                // Capture this as the error reason
                throw new Error(`Model refused or failed to generate image. Response: ${part.text}`);
            }
        }
        
        throw new Error("No image data found in response.");

    } catch (error) {
        logger.error("Error generating image with gemini-2.5-flash-image:", error);
        throw error;
    }
};


// --- Orchestrator Functions ---

export const streamChatResponse = async (
    character: Character,
    allParticipants: Character[],
    history: Message[],
    onChunk: (chunk: string) => void,
    systemInstructionOverride?: string
): Promise<void> => {
    const config = character.apiConfig || { service: 'default' };
    
    // Rate Limiting
    const rateLimit = config.rateLimit;
    if (rateLimit && rateLimit > 0) {
        const characterId = character.id;
        const lastRequestTime = lastRequestTimestamps.get(characterId) || 0;
        const now = Date.now();
        const elapsed = now - lastRequestTime;

        if (elapsed < rateLimit) {
            const delay = rateLimit - elapsed;
            logger.log(`Rate limiting character "${character.name}". Delaying for ${delay}ms.`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        lastRequestTimestamps.set(characterId, Date.now());
    }

    let systemInstruction = buildSystemInstruction(character, allParticipants);

    if (systemInstructionOverride) {
        systemInstruction += `\n\n[ADDITIONAL INSTRUCTIONS FOR THIS RESPONSE ONLY]:\n${systemInstructionOverride}`;
        logger.log("Applying system instruction override for next response.");
    }

    if (config.service === 'openai') {
        logger.log(`Using OpenAI-compatible API for character: ${character.name}`, { endpoint: config.apiEndpoint, model: config.model });
        if (!config.apiEndpoint) {
            onChunk("Error: OpenAI-compatible API endpoint is not configured for this character.");
            return;
        }
        await streamOpenAIChatResponse(config, systemInstruction, history, onChunk);
    } else { // Defaulting to Gemini
        logger.log(`Using Gemini API for character: ${character.name}`);
        await streamGeminiChatResponse(character, systemInstruction, history, onChunk);
    }
};

export const generateImageFromPrompt = async (prompt: string, settings?: { [key: string]: any }): Promise<string> => {
    try {
        const safeSettings = settings || {};
        // Rate Limiting for image generation
        const rateLimit = safeSettings.rateLimit;
        if (rateLimit && rateLimit > 0) {
            const pluginId = 'default-image-generator';
            const lastRequestTime = lastRequestTimestamps.get(pluginId) || 0;
            const now = Date.now();
            const elapsed = now - lastRequestTime;

            if (elapsed < rateLimit) {
                const delay = rateLimit - elapsed;
                logger.log(`Rate limiting image generation. Delaying for ${delay}ms.`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
            lastRequestTimestamps.set(pluginId, Date.now());
        }

        const service = safeSettings.service || 'default';
        
        switch (service) {
            case 'openai':
            case 'imagerouter': // ImageRouter usually supports OpenAI format or specific POST. Use OpenAI handler.
                if (!safeSettings.apiEndpoint) {
                    throw new Error(`${service} requires a configured API endpoint.`);
                }
                return await generateOpenAIImage(prompt, safeSettings);
            
            case 'pollinations':
                return await generatePollinationsImage(prompt, safeSettings);
            
            case 'huggingface':
                return await generateHuggingFaceImage(prompt, safeSettings);
            
            case 'stability':
                return await generateStabilityImage(prompt, safeSettings);
                
            case 'aihorde':
                return await generateAIHordeImage(prompt, safeSettings);

            case 'gemini':
            case 'default':
            default:
                // Default fallback to Gemini
                return await generateGeminiImage(prompt, safeSettings);
        }

    } catch (error) {
        logger.error("Error in generateImageFromPrompt:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        throw new Error(`Image generation failed. Please check the plugin settings (API key, endpoint) and logs. Details: ${errorMessage}`);
    }
};

export const generateContent = async (prompt: string, apiKey?: string): Promise<string> => {
  try {
    const ai = getAiClient(apiKey);
    const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    }));
    return response.text;
  } catch (error) {
    logger.error("Error in generateContent:", error);
    throw error;
  }
};

export const streamGenericResponse = async (
    systemInstruction: string,
    prompt: string,
    onChunk: (chunk: string) => void,
    apiKey?: string
): Promise<void> => {
    try {
        const ai = getAiClient(apiKey);
        const responseStream: AsyncIterable<GenerateContentResponse> = await withRetry(() => ai.models.generateContentStream({
            model: 'gemini-2.5-flash',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: { systemInstruction: systemInstruction }
        }));

        for await (const chunk of responseStream) {
            onChunk(chunk.text);
        }
    } catch (error) {
        logger.error("Error generating generic content stream:", error);
        onChunk("Sorry, an error occurred while responding.");
    }
};