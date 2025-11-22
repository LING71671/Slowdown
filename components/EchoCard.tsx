import React from 'react';
import { Echo } from '../types';
import { Share2, X } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';

interface EchoCardProps {
  echo: Echo;
  onClose: () => void;
  isNew?: boolean;
}

const rarityStyles: Record<Echo['rarity'], string> = {
  Common: 'bg-gray-200 text-gray-800',
  Rare: 'bg-blue-200 text-blue-800',
  Epic: 'bg-purple-200 text-purple-800',
  Legendary: 'bg-yellow-200 text-yellow-800'
};

export const EchoCard: React.FC<EchoCardProps> = ({ echo, onClose, isNew = false }) => {
  const { t } = useTranslation();

  const handleShare = () => {
    const text = `I found "${echo.title}" in Mindful Echoes: ${echo.description}`;
    navigator.clipboard.writeText(text);
    alert(t('copied'));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm">
      <div className={`relative w-full max-w-md p-8 rounded-3xl shadow-2xl ${echo.color} border-4 border-white transform transition-all animate-float`}>
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-500 hover:text-gray-800 transition-colors bg-white/50 rounded-full"
        >
          <X size={20} />
        </button>

        {isNew && (
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-yellow-400 text-white px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest shadow-lg">
            {t('newDiscovery')}
          </div>
        )}

        <div className="flex flex-col items-center text-center space-y-6">
          <div className="text-8xl filter drop-shadow-md transform transition-transform hover:scale-110 duration-500">
            {echo.icon}
          </div>
          
          <div className="space-y-2">
            <h2 className="text-3xl font-serif font-bold text-gray-800 tracking-wide">
              {echo.title}
            </h2>
            <span className={`inline-block px-3 py-1 text-xs font-semibold rounded-full border border-gray-400/30 ${rarityStyles[echo.rarity]}`}>
              {echo.rarity}
            </span>
          </div>

          <p className="text-lg text-gray-700 leading-relaxed italic font-serif">
            "{echo.description}"
          </p>

          <button 
            onClick={handleShare}
            className="flex items-center gap-2 px-6 py-3 mt-4 bg-white/80 hover:bg-white text-gray-800 rounded-xl font-medium shadow-sm hover:shadow-md transition-all"
          >
            <Share2 size={18} />
            <span>{t('shareWisdom')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
