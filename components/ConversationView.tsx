import React, { useEffect, useState, useRef } from 'react';
// FIX: Remove `LiveSession` as it is not an exported member.
import { LiveServerMessage } from '@google/genai';
import { X, Mic, Volume2 } from 'lucide-react';
import { startVoiceSession, decode, decodeAudioData, createBlob } from '../services/ai';
import { TranscriptEntry } from '../types';
import { useTranslation } from '../hooks/useTranslation';

interface ConversationViewProps {
  onClose: () => void;
}

type ConnectionState = 'connecting' | 'connected' | 'error' | 'closed';

export const ConversationView: React.FC<ConversationViewProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // FIX: Use `ReturnType` to infer the session promise type without importing `LiveSession`.
  const sessionPromiseRef = useRef<ReturnType<typeof startVoiceSession> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const outputSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);

  const processAudioMessage = async (message: LiveServerMessage) => {
    const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
    if (base64Audio) {
      if (!outputAudioContextRef.current) {
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
      let newTranscript = [...prev];
      if (message.serverContent?.inputTranscription) {
        // FIX: The `Transcription` object does not have an `isFinal` property.
        const { text } = message.serverContent.inputTranscription;
        const lastEntry = newTranscript[newTranscript.length - 1];
        if (lastEntry && lastEntry.speaker === 'user' && !lastEntry.isFinal) {
          lastEntry.text += text;
        } else {
          // FIX: Set `isFinal` to `false` for new entries. `turnComplete` will mark it as final.
          newTranscript.push({ id: crypto.randomUUID(), speaker: 'user', text, isFinal: false });
        }
      }
      if (message.serverContent?.outputTranscription) {
        // FIX: The `Transcription` object does not have an `isFinal` property.
        const { text } = message.serverContent.outputTranscription;
        const lastEntry = newTranscript[newTranscript.length - 1];
        if (lastEntry && lastEntry.speaker === 'ai' && !lastEntry.isFinal) {
          lastEntry.text += text;
        } else {
          // FIX: Set `isFinal` to `false` for new entries. `turnComplete` will mark it as final.
          newTranscript.push({ id: crypto.randomUUID(), speaker: 'ai', text, isFinal: false });
        }
      }
       if (message.serverContent?.turnComplete) {
         // Finalize the last entry if needed
         if (newTranscript.length > 0) {
           newTranscript[newTranscript.length-1].isFinal = true;
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

  const cleanup = () => {
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
    sessionPromiseRef.current?.then(session => session.close());
  };

  useEffect(() => {
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
              sessionPromiseRef.current?.then(session => session.sendRealtimeInput({ media: pcmBlob }));
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
        setConnectionState('error');
      },
      onClose: () => {
        setConnectionState('closed');
        cleanup();
      },
    });

    return () => {
      cleanup();
    };
  }, [t]);

  const getStatusIndicator = () => {
    switch(connectionState) {
        case 'connecting':
            return <div className="text-sm text-yellow-500">{t('connecting')}</div>
        case 'connected':
            return isSpeaking 
              ? <Volume2 size={32} className="text-blue-400" />
              : <Mic size={32} className="text-green-400 animate-pulse" />;
        case 'error':
            return <div className="text-sm text-red-500">Connection Error</div>;
        case 'closed':
             return <div className="text-sm text-slate-400">Connection Closed</div>;
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-slate-50/90 backdrop-blur-md flex flex-col font-sans">
      <div className="flex-grow flex flex-col items-center justify-center p-4">
        {/* Status Orb */}
        <div className="w-48 h-48 rounded-full bg-white shadow-xl flex flex-col items-center justify-center text-center p-4 mb-8">
            <h2 className="font-bold text-slate-700">{t('guideTitle')}</h2>
            <p className="text-xs text-slate-500 mb-4">{t('guideSubtitle')}</p>
            {getStatusIndicator()}
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
