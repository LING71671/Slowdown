import { GoogleGenAI, Type } from "@google/genai";
import { Echo } from '../types';

// We wrap this in a function to ensure we use the latest env key if needed,
// though typically process.env is static in this context.
const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateSoulEcho = async (playerLevel: number): Promise<Omit<Echo, 'id' | 'dateCollected'>> => {
  const ai = getAI();
  
  const prompt = `
    You are a wise psychological guide in a relaxation game. 
    Generate a unique "Soul Echo" - a metaphorical item that represents a piece of wisdom or a calming thought for a busy, stressed modern person.
    
    The player level is ${playerLevel}. Higher levels should yield more abstract or profound concepts.
    
    Return the response in JSON format.
  `;

  try {
    const response = await ai.models.generateContent({
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