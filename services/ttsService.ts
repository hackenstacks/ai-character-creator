import { logger } from './loggingService';

let voices: SpeechSynthesisVoice[] = [];
let voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null;

let utteranceQueue: SpeechSynthesisUtterance[] = [];
let isCurrentlySpeaking = false;

const loadVoices = (): Promise<SpeechSynthesisVoice[]> => {
  return new Promise((resolve) => {
    let pollingInterval: number | undefined;

    const checkVoices = () => {
      if (voices.length > 0) return true;
      
      const voiceList = window.speechSynthesis.getVoices();
      if (voiceList.length > 0) {
        voices = voiceList.sort((a, b) => a.name.localeCompare(b.name));
        logger.log(`TTS voices loaded: ${voices.length} found.`);
        
        window.speechSynthesis.onvoiceschanged = null;
        if (pollingInterval) clearInterval(pollingInterval);
        resolve(voices);
        return true;
      }
      return false;
    };
    
    if (checkVoices()) return;
    
    window.speechSynthesis.onvoiceschanged = checkVoices;
    pollingInterval = window.setInterval(checkVoices, 500);

    setTimeout(() => {
        if (voices.length === 0) {
            clearInterval(pollingInterval);
            window.speechSynthesis.onvoiceschanged = null;
            logger.warn("TTS voices did not load after timeout. TTS may be unavailable.");
            resolve(voices);
        }
    }, 5000);
  });
};

export const getVoices = (): Promise<SpeechSynthesisVoice[]> => {
  if (!isSupported()) return Promise.resolve([]);
  if (!voicesPromise) voicesPromise = loadVoices();
  return voicesPromise;
};

export const isSupported = (): boolean => {
    return 'speechSynthesis' in window && window.speechSynthesis !== null;
};

const processUtteranceQueue = () => {
    if (utteranceQueue.length === 0 || isCurrentlySpeaking || !isSupported()) {
        return;
    }

    isCurrentlySpeaking = true;
    const utterance = utteranceQueue.shift()!;
    
    utterance.onend = () => {
        isCurrentlySpeaking = false;
        processUtteranceQueue();
    };

    utterance.onerror = (event) => {
        logger.error('TTS Utterance Error:', event.error || 'synthesis-failed');
        // FIX: If an utterance fails, cancel the entire queue to prevent a flood of subsequent errors,
        // which can happen if the browser's speech synthesis engine enters a bad state.
        cancel();
    };

    window.speechSynthesis.speak(utterance);
};

export const speak = async (text: string, voiceURI?: string) => {
    if (!isSupported() || !text?.trim()) return;

    // A fresh call to speak should interrupt the old queue.
    cancel();

    try {
        const availableVoices = await getVoices();
        const selectedVoice = voiceURI ? availableVoices.find(v => v.voiceURI === voiceURI) : undefined;
        if (voiceURI && !selectedVoice) {
            logger.warn(`TTS voice not found for URI: ${voiceURI}. Using default.`);
        }
        
        // Chunk the text into sentences to avoid hitting character limits of TTS engines.
        const sentences = text.match(/[^.!?]+[.!?]*|[^.!?]+$/g) || [];

        utteranceQueue = sentences
            .map(s => s.trim())
            .filter(s => s.length > 0)
            .map(sentence => {
                const utterance = new SpeechSynthesisUtterance(sentence);
                if (selectedVoice) {
                    utterance.voice = selectedVoice;
                }
                return utterance;
            });

        processUtteranceQueue();

    } catch (error) {
        logger.error('Failed to initiate TTS speak.', error);
    }
};

export const cancel = () => {
    if (isSupported()) {
        utteranceQueue = [];
        isCurrentlySpeaking = false;
        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
        }
    }
};

// Pre-warm the voices cache to start the loading process early.
if (isSupported()) {
    getVoices();
}