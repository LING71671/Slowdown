import { GoogleGenAI, Type, LiveServerMessage, Modality } from "@google/genai";
import { Echo } from '../types';
import { createBlob, decode, decodeAudioData } from '../utils/audio';

// Lazily initialize the AI client to prevent startup crashes.
let ai: GoogleGenAI | null = null;
let aiInitializationError: Error | null = null;

const getAiClient = (): GoogleGenAI => {
  if (aiInitializationError) {
    throw aiInitializationError;
  }
  if (!ai) {
    try {
      // This will fail if process.env.API_KEY is not available in the browser.
      ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    } catch (error) {
      console.error("FATAL: Failed to initialize GoogleGenAI. Ensure the API_KEY is correctly set in your environment and exposed to the client-side build.", error);
      aiInitializationError = new Error("AI Service could not be initialized. Please verify your API key configuration and ensure it's accessible to the application.");
      throw aiInitializationError;
    }
  }
  return ai;
};

export const generateSoulEcho = async (playerLevel: number): Promise<Omit<Echo, 'id' | 'dateCollected'>> => {
  const prompt = `
    You are a wise psychological guide in a relaxation game. 
    Generate a unique "Soul Echo" - a metaphorical item that represents a piece of wisdom or a calming thought for a busy, stressed modern person.
    
    The player level is ${playerLevel}. Higher levels should yield more abstract or profound concepts.
    
    Return the response in JSON format.
  `;

  try {
    const client = getAiClient();
    const response = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "Name of the metaphorical item (e.g., 'Compass of Clarity', 'Jar of Silence')." },
            description: { type: Type.STRING, description: "A soothing, profound, or encouraging 1-2 sentence description suitable for a game tooltip." },
            icon: { type: Type.STRING, description: "A single emoji that best represents this item." },
            color: { type: Type.STRING, description: "A tailwind CSS color class for the background (e.g., 'bg-blue-100', 'bg-rose-200', 'bg-purple-100', 'bg-emerald-100'). Use pastel tones." },
            rarity: { type: Type.STRING, enum: ['Common', 'Rare', 'Epic', 'Legendary'], description: "Rarity based on how profound the thought is." }
          },
          required: ["title", "description", "icon", "color", "rarity"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No text returned from AI");
    
    return JSON.parse(text) as Omit<Echo, 'id' | 'dateCollected'>;
  } catch (error) {
    console.error("AI Generation Error:", error);
    // Fallback if AI fails
    return {
      title: "Quiet Moment",
      description: "Sometimes, silence is the loudest answer you need.",
      icon: "🍃",
      color: "bg-green-100",
      rarity: "Common"
    };
  }
};


// --- Live API for Voice Conversation ---

interface VoiceSessionCallbacks {
  onMessage: (message: LiveServerMessage) => Promise<void>;
  onOpen: () => void;
  onError: (error: ErrorEvent) => void;
  onClose: (event: CloseEvent) => void;
}

export const startVoiceSession = (
  systemInstruction: string,
  callbacks: VoiceSessionCallbacks
) => {
  try {
    const client = getAiClient();
    return client.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-09-2025',
      callbacks: {
        onopen: callbacks.onOpen,
        onmessage: callbacks.onMessage,
        onerror: callbacks.onError,
        onclose: callbacks.onClose,
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        systemInstruction,
      },
    });
  } catch (error) {
    // If getAiClient throws, we catch it here and return a rejected promise
    // to be handled by the calling component (ConversationView).
    return Promise.reject(error);
  }
};

export { decode, decodeAudioData, createBlob };