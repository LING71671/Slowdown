// FIX: Removed non-exported member 'LiveSession' from import.
import { GoogleGenAI, Type, Blob, LiveCallbacks, Modality } from "@google/genai";
import { Echo } from '../types';

// Creates a new AI client instance.
// This function is designed to be called right before an API request
// to ensure the latest user-selected API key from the environment is used.
const createAiClient = (): GoogleGenAI => {
  try {
    // This will throw an error if process.env.API_KEY is not available,
    // which is caught by the calling functions (generateSoulEcho).
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
  } catch (error) {
    console.error("FATAL: Failed to initialize GoogleGenAI. Ensure the API_KEY is correctly set in your environment and exposed to the client-side build.", error);
    // Re-throw a more user-friendly error to be caught by UI components.
    throw new Error("AI Service could not be initialized. Please verify your API key configuration and ensure it's accessible to the application.");
  }
};

const fallbackEchoes: Omit<Echo, 'id' | 'dateCollected'>[] = [
    {
      title: "Quiet Moment",
      description: "Sometimes, silence is the loudest answer you need.",
      icon: "🍃",
      color: "bg-green-100",
      rarity: "Common"
    },
    {
      title: "Stream of Patience",
      description: "A river cuts through rock, not because of its power, but its persistence.",
      icon: "💧",
      color: "bg-blue-100",
      rarity: "Common"
    },
    {
      title: "Feather of Letting Go",
      description: "Allow your worries to be as light as a feather, and let the wind carry them away.",
      icon: "🪶",
      color: "bg-gray-100",
      rarity: "Common"
    },
    {
      title: "Seed of Potential",
      description: "Within you is the strength and resilience of a mighty tree, waiting to grow.",
      icon: "🌱",
      color: "bg-emerald-100",
      rarity: "Common"
    },
    {
      title: "Whisper of Courage",
      description: "Courage doesn't always roar. Sometimes it's the quiet voice at the end of the day that says 'I will try again tomorrow'.",
      icon: "💬",
      color: "bg-rose-100",
      rarity: "Rare"
    }
];

export const generateSoulEcho = async (playerLevel: number): Promise<Omit<Echo, 'id' | 'dateCollected'>> => {
  const prompt = `
    You are a wise psychological guide in a relaxation game. 
    Generate a unique "Soul Echo" - a metaphorical item that represents a piece of wisdom or a calming thought for a busy, stressed modern person.
    
    The player level is ${playerLevel}. Higher levels should yield more abstract or profound concepts.
    
    Return the response in JSON format.
  `;

  try {
    const client = createAiClient();
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
    // Fallback if AI fails, return a random pre-written echo
    return fallbackEchoes[Math.floor(Math.random() * fallbackEchoes.length)];
  }
};

// --- Live API Functions ---

// FIX: Implement encode function for audio data as per guidelines. Not exported.
function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// FIX: Implement and export decode function for audio data as per guidelines.
export function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// FIX: Implement and export decodeAudioData function as per guidelines.
export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

// FIX: Implement and export createBlob function as per guidelines.
export function createBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

// FIX: Implement and export startVoiceSession to connect to the Live API.
// FIX: Changed return type from Promise<LiveSession> to Promise<any> as LiveSession is not an exported type.
export const startVoiceSession = (systemInstruction: string, callbacks: LiveCallbacks): Promise<any> => {
  const client = createAiClient();
  return client.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-09-2025',
    callbacks: callbacks,
    config: {
      responseModalities: [Modality.AUDIO],
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
      },
      systemInstruction: systemInstruction,
    },
  });
};