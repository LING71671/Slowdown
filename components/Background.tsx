import React from 'react';

export const Background: React.FC = () => {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-gradient-to-b from-blue-50 to-purple-100">
      {/* Sun/Moon Glow */}
      <div className="absolute top-10 right-10 w-32 h-32 bg-yellow-200 rounded-full blur-3xl opacity-40 animate-pulse"></div>
      
      {/* Floating Clouds */}
      <div className="absolute top-[10%] left-0 w-48 h-16 bg-white rounded-full blur-xl opacity-60 animate-drift-slow" style={{ animationDelay: '0s' }}></div>
      <div className="absolute top-[30%] left-0 w-64 h-24 bg-white rounded-full blur-xl opacity-50 animate-drift-medium" style={{ animationDelay: '5s' }}></div>
      <div className="absolute top-[60%] left-0 w-56 h-20 bg-white rounded-full blur-xl opacity-40 animate-drift-slow" style={{ animationDelay: '2s' }}></div>
      
      {/* Fog Layers */}
      <div className="absolute bottom-0 w-full h-64 bg-gradient-to-t from-white/80 to-transparent"></div>
    </div>
  );
};