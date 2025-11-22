import React, { useEffect, useState, useRef, useCallback } from 'react';
import { LiveServerMessage } from '@google/genai';
import { X, Mic, Volume2, KeyRound } from 'lucide-react';
import { startVoiceSession, decode, decodeAudioData, createBlob } from '../services/ai';
import { TranscriptEntry } from '../types';
import { useTranslation } from '../hooks/useTranslation';

// FIX: Change declaration of window.aistudio to use a named interface `AIStudio`
// to solve TypeScript declaration conflict error.
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    aistudio: AIStudio;
  }
}

interface ConversationViewProps {
  onClose: () => void;
}

type ConnectionState = 'connecting' | 'connected' | 'error' | 'closed';
type ApiKeyStatus = 'checking' | 'present' | 'missing';

export const ConversationView: React.FC<ConversationViewProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus>('checking');
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const sessionPromiseRef = useRef<ReturnType<typeof startVoiceSession> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const outputSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  
  const cleanup = useCallback(() => {
    if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (scriptProcessorRef.current) {
        scriptProcessorRef.current.disconnect();
    }
    if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
        inputAudioContextRef.current.close();
    }
    if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
        outputAudioContextRef.current.close();
    }
    sessionPromiseRef.current?.then(session => session.close()).catch(console.error);
    sessionPromiseRef.current = null;
  }, []);

  const initiateSession = useCallback(() => {
      setConnectionState('connecting');
      // Ensure any previous session is cleaned up before starting a new one
      cleanup();

      sessionPromiseRef.current = startVoiceSession(t('systemInstruction'), {
        onOpen: () => {
          setConnectionState('connected');
          navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
              streamRef.current = stream;
              inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
              const source = inputAudioContextRef.current.createMediaStreamSource(stream);
              scriptProcessorRef.current = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
              scriptProcessorRef.current.onaudioprocess = (event) => {
                const inputData = event.inputBuffer.getChannelData(0);
                const pcmBlob = createBlob(inputData);
                // Use the promise ref to ensure we're sending to an active session
                sessionPromiseRef.current?.then(session => session.sendRealtimeInput({ media: pcmBlob })).catch(console.error);
              };
              source.connect(scriptProcessorRef.current);
              scriptProcessorRef.current.connect(inputAudioContextRef.current.destination);
            })
            .catch(err => {
              console.error('Mic access error', err);
              setConnectionState('error');
            });
        },
        onMessage: async (message) => {
          processTranscriptMessage(message);
          await processAudioMessage(message);
        },
        onError: (e) => {
          console.error('Session error', e);
          // FIX: Per guidelines, reset API key status on auth error to re-prompt the user.
          if (e.message?.includes('Requested entity was not found')) {
            setApiKeyStatus('missing');
          }
          setConnectionState('error');
        },
        onClose: () => {
          setConnectionState('closed');
          cleanup();
        },
      });

      sessionPromiseRef.current.catch(err => {
          console.error("Failed to establish voice session:", err);
          // FIX: Per guidelines, reset API key status on auth error to re-prompt the user.
          if (err instanceof Error && err.message.includes('Requested entity was not found')) {
            setApiKeyStatus('missing');
          }
          setConnectionState('error');
      });
  }, [t, cleanup]);

  useEffect(() => {
    const checkApiKey = async () => {
      if (window.aistudio && await window.aistudio.hasSelectedApiKey()) {
        setApiKeyStatus('present');
      } else {
        setApiKeyStatus('missing');
      }
    };
    checkApiKey();
  }, []);

  useEffect(() => {
    if (apiKeyStatus === 'present') {
      initiateSession();
    }
    // This effect should only run when the API key status changes to 'present'.
    // The initiateSession function is wrapped in useCallback to be stable.
  }, [apiKeyStatus, initiateSession]);

  useEffect(() => {
    // Final cleanup on component unmount
    return () => {
      cleanup();
    };
  }, [cleanup]);
  
  const handleSelectKey = async () => {
      await window.aistudio.openSelectKey();
      // Per platform guidelines, assume success and attempt to connect.
      setApiKeyStatus('present');
  };

  const processAudioMessage = async (message: LiveServerMessage) => {
    const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
    if (base64Audio) {
      if (!outputAudioContextRef.current || outputAudioContextRef.current.state === 'closed') {
        outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      const outputAudioContext = outputAudioContextRef.current;
      nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputAudioContext.currentTime);
      const audioBuffer = await decodeAudioData(decode(base64Audio), outputAudioContext, 24000, 1);
      
      const source = outputAudioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(outputAudioContext.destination);
      
      source.addEventListener('ended', () => {
        outputSourcesRef.current.delete(source);
        if (outputSourcesRef.current.size === 0) {
          setIsSpeaking(false);
        }
      });

      setIsSpeaking(true);
      source.start(nextStartTimeRef.current);
      nextStartTimeRef.current += audioBuffer.duration;
      outputSourcesRef.current.add(source);
    }
    
    if (message.serverContent?.interrupted) {
      for (const source of outputSourcesRef.current.values()) {
        source.stop();
      }
      outputSourcesRef.current.clear();
      nextStartTimeRef.current = 0;
      setIsSpeaking(false);
    }
  };

  const processTranscriptMessage = (message: LiveServerMessage) => {
    setTranscript(prev => {
      const newTranscript = [...prev];

      const processEntry = (speaker: 'user' | 'ai', text: string) => {
        const lastEntry = newTranscript[newTranscript.length - 1];
        if (lastEntry?.speaker === speaker && !lastEntry.isFinal) {
          newTranscript[newTranscript.length - 1] = { ...lastEntry, text: lastEntry.text + text };
        } else {
          newTranscript.push({ id: crypto.randomUUID(), speaker, text, isFinal: false });
        }
      };

      if (message.serverContent?.inputTranscription?.text) {
        processEntry('user', message.serverContent.inputTranscription.text);
      }
      
      if (message.serverContent?.outputTranscription?.text) {
        processEntry('ai', message.serverContent.outputTranscription.text);
      }

      if (message.serverContent?.turnComplete) {
        const lastEntry = newTranscript[newTranscript.length - 1];
        if (lastEntry && !lastEntry.isFinal) {
          newTranscript[newTranscript.length - 1] = { ...lastEntry, isFinal: true };
        }
      }
      
      return newTranscript;
    });
  };

  useEffect(() => {
    const transcriptContainer = document.getElementById('transcript-container');
    if (transcriptContainer) {
      transcriptContainer.scrollTop = transcriptContainer.scrollHeight;
    }
  }, [transcript]);


  const getStatusIndicator = () => {
    switch(connectionState) {
        case 'connecting':
            return <div className="text-sm text-yellow-500">{t('connecting')}</div>
        case 'connected':
            return isSpeaking 
              ? <Volume2 size={32} className="text-blue-400" />
              : <Mic size={32} className="text-green-400 animate-pulse" />;
        case 'error':
            return <div className="text-sm text-red-500 text-center">Connection Error.<br/>Please ensure your selected API key is valid and from a project with billing enabled.</div>;
        case 'closed':
             return <div className="text-sm text-slate-400">Connection Closed</div>;
    }
  }
  
  const renderContent = () => {
      if (apiKeyStatus === 'checking') {
          return <p className="text-slate-500">Checking API Key...</p>;
      }
      if (apiKeyStatus === 'missing') {
          return (
              <div className="text-center">
                  <KeyRound size={32} className="text-yellow-500 mx-auto mb-2" />
                  <h2 className="font-bold text-slate-700">API Key Required</h2>
                  <p className="text-xs text-slate-500 mt-2 mb-4 max-w-xs">
                      This feature requires a Gemini API key from a Google Cloud project with billing enabled.
                      <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline"> Learn More</a>
                  </p>
                  <button onClick={handleSelectKey} className="px-4 py-2 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600 transition-colors">
                      Select API Key
                  </button>
              </div>
          );
      }
      return (
         <div className="text-center flex flex-col items-center justify-center">
            <h2 className="font-bold text-slate-700">{t('guideTitle')}</h2>
            <p className="text-xs text-slate-500 mb-4">{t('guideSubtitle')}</p>
            {getStatusIndicator()}
         </div>
      );
  }

  return (
    <div className="fixed inset-0 z-40 bg-slate-50/90 backdrop-blur-md flex flex-col font-sans">
      <div className="flex-grow flex flex-col items-center justify-center p-4">
        {/* Status Orb */}
        <div className="w-48 h-48 rounded-full bg-white shadow-xl flex flex-col items-center justify-center p-4 mb-8">
            {renderContent()}
        </div>

        {/* Transcript */}
        <div id="transcript-container" className="w-full max-w-2xl h-64 overflow-y-auto bg-white/50 rounded-lg p-4 space-y-4 scrollbar-hide">
          {transcript.map(entry => (
            <div key={entry.id} className={`flex ${entry.speaker === 'user' ? 'justify-end' : 'justify-start'}`}>
              <p className={`max-w-xs md:max-w-md p-3 rounded-xl ${entry.speaker === 'user' ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-800'}`}>
                {entry.text}
              </p>
            </div>
          ))}
        </div>
      </div>
      
      {/* Footer Controls */}
      <div className="flex-shrink-0 p-4 bg-white/30 border-t border-white/20 flex justify-center">
        <button
          onClick={onClose}
          className="px-6 py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-full transition-colors shadow-lg"
        >
          {t('endConversation')}
        </button>
      </div>

      <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-slate-200/50 hover:bg-slate-300 rounded-full">
          <X size={24} className="text-slate-600"/>
      </button>
    </div>
  );
};
