import React, { useState, useRef, useEffect, useCallback } from 'react';
import { SpinnerIcon } from './icons/SpinnerIcon';
import { ImageIcon } from './icons/ImageIcon';

interface ImageGenerationWindowProps {
  onGenerate: (prompt: string) => Promise<{ url?: string; error?: string }>;
  onClose: () => void;
}

export const ImageGenerationWindow: React.FC<ImageGenerationWindowProps> = ({ onGenerate, onClose }) => {
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [position, setPosition] = useState({ x: window.innerWidth - 470, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const windowRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Only drag by the header
    if (windowRef.current && (e.target as HTMLElement).closest('.drag-handle')) {
        setIsDragging(true);
        const rect = windowRef.current.getBoundingClientRect();
        setDragOffset({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        });
        e.preventDefault();
    }
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
      if (!isDragging) return;
      setPosition({
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y,
      });
  }, [isDragging, dragOffset]);

  const handleMouseUp = useCallback(() => {
      setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);


  const handleGenerateClick = async () => {
    if (!prompt.trim() || isLoading) return;
    setIsLoading(true);
    setImageUrl(null);
    setError(null);
    const result = await onGenerate(prompt);
    if (result.url) {
      setImageUrl(result.url);
    } else {
      setError(result.error || 'An unknown error occurred during image generation.');
    }
    setIsLoading(false);
  };

  return (
    <div
      ref={windowRef}
      className="fixed z-30 w-full max-w-md bg-background-secondary rounded-lg shadow-2xl flex flex-col border border-border-neutral"
      style={{ top: `${position.y}px`, left: `${position.x}px` }}
      onMouseDown={handleMouseDown}
    >
      <header className="drag-handle p-4 border-b border-border-neutral flex justify-between items-center cursor-move">
        <h2 className="text-lg font-bold text-text-primary">Image Generation</h2>
        <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors text-2xl font-bold leading-none p-1">&times;</button>
      </header>
      <div className="p-4 space-y-4">
        <div>
          <label htmlFor="image-prompt" className="block text-sm font-medium text-text-primary">Prompt</label>
          <textarea
            id="image-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            className="mt-1 block w-full bg-background-primary border border-border-strong rounded-md shadow-sm py-2 px-3 text-text-primary focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            placeholder="A robot holding a red skateboard..."
          />
        </div>
        <div className="h-64 bg-background-primary rounded-md flex items-center justify-center overflow-hidden">
          {isLoading && <SpinnerIcon className="w-10 h-10 animate-spin text-primary-500" />}
          {error && <p className="text-accent-red text-sm text-center p-4">{error}</p>}
          {imageUrl && <img src={imageUrl} alt="Generated Image" className="w-full h-full object-contain" />}
          {!isLoading && !error && !imageUrl && <ImageIcon className="w-16 h-16 text-text-secondary/50" />}
        </div>
      </div>
      <footer className="p-4 border-t border-border-neutral flex justify-end">
        <button
          onClick={handleGenerateClick}
          disabled={!prompt.trim() || isLoading}
          className="py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-text-accent bg-primary-600 hover:bg-primary-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background-secondary focus:ring-primary-500 disabled:opacity-50"
        >
          {isLoading ? 'Generating...' : 'Generate'}
        </button>
      </footer>
    </div>
  );
};