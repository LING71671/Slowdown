import React, { useState, useEffect, useRef } from 'react';
import { Wind, Sparkles, BookOpen, BrainCircuit, Music, Music2, Globe, Maximize, Minimize, KeyRound } from 'lucide-react';
import { GameState, Echo, PlayerStats, Language } from './types';
import { generateSoulEcho } from './services/ai';
import { Background } from './components/Background';
import { EchoCard } from './components/EchoCard';
import { ConversationView } from './components/ConversationView';
import { useTranslation } from './hooks/useTranslation';
import { playGlimmerSound } from './utils/audio';


const STORAGE_KEY = 'mindful_echoes_save_v1';
const FOCUS_COST = 100;
// A short, silent, looping base64 encoded mp3 for ambient music
const AMBIENT_MUSIC_SRC = "data:audio/mpeg;base64,SUQzBAAAAAABEVRYWFgAAAAtAAADY29tbWVudABCaWdTb3VuZEJhbmsuY29tIC8gTGFTb25vdGhlcXVlLm9yZwBURU5DAAAAHQAAA1N3aXRjaCBQbHVzIMKpIE5DSCBTb2Z0d2FyZQBUSUNSAAAACgAAADNOZXcgWXVsaWEgVExFTgAAAA8AAAAAMzc3ODU5ODg5MDI3NDk3AE9OTAAAADMAAAAdVGhpc0F1ZGlvSXNGcmVlR2VuZXJhdGVkAAAAAABUNLZAAAAA8AAAAnNpbmcgSW5mbwAAAnAA/+AUgAAAAANIAAAAAExBTUUzLjk5LjVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV";

type ApiKeyStatus = 'checking' | 'present' | 'missing';

const App: React.FC = () => {
  const { t, lang, setLang } = useTranslation();
  
  // --- State ---
  const [stats, setStats] = useState<PlayerStats>({
    focus: 0,
    maxFocus: 100,
    level: 1,
    echoesCollected: 0,
  });
  
  const [collection, setCollection] = useState<Echo[]>([]);
  const [gameState, setGameState] = useState<GameState>(GameState.IDLE);
  const [currentEcho, setCurrentEcho] = useState<Echo | null>(null);
  const [isMusicOn, setIsMusicOn] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isConversing, setIsConversing] = useState(false);
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus>('checking');
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);

  // --- Initialization & Persistence ---
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setStats(parsed.stats);
        setCollection(parsed.collection);
        if (parsed.lang) setLang(parsed.lang);
      } catch (e) { console.error("Failed to load save", e); }
    }

    const checkApiKey = async () => {
      // Ensure window.aistudio is available before calling it
      if (window.aistudio) {
        if (await window.aistudio.hasSelectedApiKey()) {
          setApiKeyStatus('present');
        } else {
          setApiKeyStatus('missing');
        }
      } else {
        // Retry if aistudio is not immediately available
        setTimeout(checkApiKey, 200);
      }
    };
    checkApiKey();
  }, [setLang]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ stats, collection, lang, music: isMusicOn }));
  }, [stats, collection, lang, isMusicOn]);

  // --- Game Loop (Idle Gain) ---
  useEffect(() => {
    const interval = setInterval(() => {
      if (gameState === GameState.IDLE && stats.focus < stats.maxFocus) {
        setStats(prev => ({ ...prev, focus: Math.min(prev.focus + 0.5, prev.maxFocus) }));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [gameState, stats.maxFocus, stats.focus]);

  // --- Audio Control ---
  useEffect(() => {
    if (audioRef.current) {
        if (isMusicOn) {
            audioRef.current.play().catch(e => console.error("Audio play failed:", e));
        } else {
            audioRef.current.pause();
        }
    }
  }, [isMusicOn]);
  
    // --- Fullscreen Control ---
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // --- Core Game Logic ---
  const reflectLogic = async () => {
    if (stats.focus < FOCUS_COST || gameState !== GameState.IDLE) return;

    setGameState(GameState.GENERATING);
    setStats(prev => ({ ...prev, focus: prev.focus - FOCUS_COST }));

    try {
      const data = await generateSoulEcho(stats.level);
      
      // The API call returns a fallback on error. If we get the fallback, it means something went wrong.
      if (data.title === "Quiet Moment") {
        throw new Error("AI returned fallback data, indicating a possible API key or network issue.");
      }
      
      const newEcho: Echo = { id: crypto.randomUUID(), dateCollected: new Date().toISOString(), ...data };

      setCollection(prev => [newEcho, ...prev]);
      setCurrentEcho(newEcho);
      setStats(prev => ({ ...prev, level: prev.level + 1, echoesCollected: prev.echoesCollected + 1 }));
      setGameState(GameState.REVEAL);
    } catch (e) {
      console.error("Reflection Error:", e);
      alert("There was an error generating your Soul Echo. It's likely an issue with your selected API key. Please ensure it's from a project with billing enabled and try again.");
      // If the API call fails, assume the key is invalid and prompt the user to select one again.
      setApiKeyStatus('missing');
      setGameState(GameState.IDLE); // Reset game state to allow another attempt
    }
  };

  // --- Interactions ---
  const handleBreathe = () => {
    if (gameState !== GameState.IDLE) return;
    playGlimmerSound();
    setStats(prev => ({ ...prev, focus: Math.min(prev.focus + 5, prev.maxFocus) }));
  };

  const handleSelectKey = async () => {
    if (window.aistudio) {
        await window.aistudio.openSelectKey();
        // Per platform guidelines, assume success after the dialog is closed.
        setApiKeyStatus('present');
        setIsApiKeyModalOpen(false);
    }
  };

  const toggleLanguage = () => setLang(lang === 'en' ? 'zh' : 'en');
  const toggleMusic = () => setIsMusicOn(prev => !prev);
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
      });
    } else {
      document.exitFullscreen();
    }
  };


  // --- UI Helpers ---
  const progressPercent = (stats.focus / stats.maxFocus) * 100;
  const canReflect = stats.focus >= FOCUS_COST;

  const ApiKeyModal = () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-sm p-6 text-center bg-white rounded-2xl shadow-lg">
        <KeyRound size={32} className="mx-auto mb-4 text-yellow-500" />
        <h2 className="text-xl font-bold text-slate-800">API Key Required</h2>
        <p className="mt-2 text-sm text-slate-500">
          To generate unique "Soul Echoes", this app needs a Gemini API key from a Google Cloud project with billing enabled.
          <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline"> Learn More</a>
        </p>
        <div className="mt-6 space-y-2">
           <button 
             onClick={handleSelectKey} 
             className="w-full px-4 py-2 font-semibold text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors">
               Select API Key
           </button>
           <button 
             onClick={() => setIsApiKeyModalOpen(false)} 
             className="w-full px-4 py-2 font-semibold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
               Cancel
           </button>
        </div>
      </div>
    </div>
  );
  
  const renderReflectButton = () => {
    switch (apiKeyStatus) {
        case 'checking':
            return (
                <button disabled className="w-full py-4 rounded-xl text-white font-bold text-lg tracking-wide shadow-lg flex items-center justify-center gap-3 bg-slate-300 cursor-not-allowed">
                    <Sparkles size={24} className="animate-spin" />
                    <span>Checking Key...</span>
                </button>
            );
        case 'missing':
            return (
                <button onClick={() => setIsApiKeyModalOpen(true)} className="w-full py-4 rounded-xl text-yellow-800 font-bold text-lg tracking-wide shadow-lg flex items-center justify-center gap-3 bg-gradient-to-r from-yellow-400 to-amber-500 hover:shadow-yellow-500/30 hover:-translate-y-1">
                    <KeyRound size={24} />
                    <span>Setup API Key</span>
                </button>
            );
        case 'present':
            return (
                <button onClick={reflectLogic} disabled={!canReflect || gameState === GameState.GENERATING} className={`w-full py-4 rounded-xl text-white font-bold text-lg tracking-wide shadow-lg transition-all flex items-center justify-center gap-3 ${canReflect ? 'bg-gradient-to-r from-indigo-500 to-purple-600 hover:shadow-indigo-500/30 hover:-translate-y-1' : 'bg-slate-300 cursor-not-allowed grayscale'}`}>
                    <Sparkles size={24} />
                    <span>{t('findEpiphany')}</span>
                </button>
            );
    }
  };

  return (
    <div className="relative min-h-screen font-sans text-slate-800 selection:bg-purple-200">
      <Background />
      <audio ref={audioRef} src={AMBIENT_MUSIC_SRC} loop />
      
      <header className="fixed top-0 left-0 right-0 p-4 z-10 flex justify-between items-center backdrop-blur-md bg-white/30 border-b border-white/20">
        <div className="flex items-center gap-3">
          <button onClick={() => setIsConversing(true)} className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 shadow-inner hover:bg-indigo-200 transition-colors">
            <BrainCircuit size={20} />
          </button>
          <div>
            <h1 className="font-bold text-sm text-slate-700 uppercase tracking-wider">{t('level')} {stats.level}</h1>
            <p className="text-xs text-slate-500">{t('seekerOfCalm')}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
            <button onClick={toggleMusic} className="p-2 bg-white/50 hover:bg-white rounded-full transition-all shadow-sm text-slate-700">
                {isMusicOn ? <Music size={16} /> : <Music2 size={16} />}
            </button>
            <button onClick={toggleLanguage} className="p-2 bg-white/50 hover:bg-white rounded-full transition-all shadow-sm text-slate-700">
                <Globe size={16} />
            </button>
            <button onClick={toggleFullscreen} className="p-2 bg-white/50 hover:bg-white rounded-full transition-all shadow-sm text-slate-700">
              {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
            </button>
            <button 
                onClick={() => setGameState(GameState.COLLECTION)}
                className="flex items-center gap-2 bg-white/50 hover:bg-white px-4 py-2 rounded-full transition-all shadow-sm text-slate-700 text-sm font-medium"
            >
                <BookOpen size={16} />
                <span>{t('journal')} ({collection.length})</span>
            </button>
        </div>
      </header>

      <main className="flex flex-col items-center justify-center min-h-screen px-4 pb-20 pt-20">
        <div className="relative group">
          <div className="absolute -inset-4 rounded-full bg-gradient-to-r from-blue-200 to-purple-200 opacity-30 blur-xl group-hover:blur-2xl transition-all duration-1000"></div>
          <button onClick={handleBreathe} disabled={gameState === GameState.GENERATING} className={`relative w-64 h-64 rounded-full flex flex-col items-center justify-center bg-white shadow-2xl transition-all duration-300 transform ${gameState === GameState.GENERATING ? 'animate-pulse scale-95' : 'hover:scale-105 active:scale-95'} border-8 border-white`}>
            <svg className="absolute top-0 left-0 w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="46" fill="none" stroke="#f1f5f9" strokeWidth="4" />
              <circle cx="50" cy="50" r="46" fill="none" stroke="#818cf8" strokeWidth="4" strokeDasharray="289" strokeDashoffset={289 - (289 * progressPercent) / 100} className="transition-all duration-500 ease-out" strokeLinecap="round" />
            </svg>
            <div className="z-10 text-center pointer-events-none select-none p-6">
              {gameState === GameState.GENERATING ? (
                <>
                  <Sparkles className="w-12 h-12 text-purple-400 animate-spin mx-auto mb-2" />
                  <p className="text-purple-500 font-medium">{t('listeningToUniverse')}</p>
                </>
              ) : (
                <>
                  <Wind className="w-12 h-12 text-blue-400 mx-auto mb-2 opacity-80" />
                  <span className="block text-3xl font-light text-slate-600">{t('breathe')}</span>
                  <span className="text-xs text-slate-400 mt-2 block">{t('tapToClearFog')}</span>
                </>
              )}
            </div>
          </button>
        </div>

        <div className="mt-12 w-full max-w-md">
          <div className="flex justify-between text-sm text-slate-500 mb-2 px-2">
            <span>{t('mentalClarity')}</span>
            <span>{Math.floor(stats.focus)} / {stats.maxFocus}</span>
          </div>
          <div className="h-2 bg-white/50 rounded-full overflow-hidden mb-6">
            <div className="h-full bg-gradient-to-r from-blue-400 to-indigo-500 transition-all duration-300" style={{ width: `${progressPercent}%` }}></div>
          </div>
          {renderReflectButton()}
          {apiKeyStatus === 'present' && <p className="text-center text-xs text-slate-400 mt-3">{t('requiresClarity', {cost: FOCUS_COST})}</p>}
        </div>
      </main>

      {isApiKeyModalOpen && <ApiKeyModal />}
      {isConversing && <ConversationView onClose={() => setIsConversing(false)} />}

      {gameState === GameState.REVEAL && currentEcho && (<EchoCard echo={currentEcho} isNew={true} onClose={() => setGameState(GameState.IDLE)} />)}
      {gameState === GameState.COLLECTION && (
        <div className="fixed inset-0 z-40 bg-slate-50 backdrop-blur-md overflow-y-auto">
          <div className="max-w-4xl mx-auto px-4 py-8">
            <div className="flex justify-between items-center mb-8 sticky top-0 bg-slate-50/90 py-4 backdrop-blur-sm z-10">
              <h2 className="text-3xl font-bold text-slate-800 font-serif">{t('yourJournal')}</h2>
              <button onClick={() => setGameState(GameState.IDLE)} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded-full text-slate-700 font-medium transition-colors">{t('close')}</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {collection.length === 0 ? (
                <div className="col-span-full text-center py-20 text-slate-400">
                  <p>{t('noEchoes')}</p>
                  <p className="text-sm">{t('noEchoesSub')}</p>
                </div>
              ) : (
                collection.map((echo) => (
                  <div key={echo.id} onClick={() => { setCurrentEcho(echo); setGameState(GameState.REVEAL); }} className={`cursor-pointer group relative p-6 rounded-2xl ${echo.color} border border-white/50 hover:shadow-xl transition-all hover:-translate-y-1`}>
                    <div className="text-4xl mb-4 group-hover:scale-110 transition-transform">{echo.icon}</div>
                    <h3 className="font-bold text-slate-800 mb-1">{echo.title}</h3>
                    <p className="text-sm text-slate-600 line-clamp-2">{echo.description}</p>
                    <div className="mt-4 flex justify-between items-center text-xs text-slate-500 opacity-60">
                      <span>{echo.rarity}</span>
                      <span>{new Date(echo.dateCollected).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;