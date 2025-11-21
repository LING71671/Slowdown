export enum GameState {
  IDLE = 'IDLE',
  GENERATING = 'GENERATING',
  REVEAL = 'REVEAL',
  COLLECTION = 'COLLECTION'
}

export interface Echo {
  id: string;
  title: string;
  description: string;
  icon: string; // Lucide icon name or emoji
  color: string;
  rarity: 'Common' | 'Rare' | 'Epic' | 'Legendary';
  dateCollected: string;
}

export interface PlayerStats {
  focus: number;
  level: number;
  maxFocus: number;
  echoesCollected: number;
}
