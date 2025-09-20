import React, { useState, useEffect, useRef } from 'react';
import { logger, LogEntry, LogLevel } from '../services/loggingService.ts';
import { TrashIcon } from './icons/TrashIcon.tsx';

interface LogViewerProps {
  onClose: () => void;
}

const levelClasses: Record<LogLevel, { text: string; bg: string }> = {
  INFO: { text: 'text-blue-300', bg: 'bg-blue-900/50' },
  WARN: { text: 'text-yellow-300', bg: 'bg-yellow-900/50' },
  ERROR: { text: 'text-red-300', bg: 'bg-red-900/50' },
  DEBUG: { text: 'text-gray-400', bg: 'bg-gray-700/50' },
};

const levelClassesLight: Record<LogLevel, { text: string; bg: string }> = {
  INFO: { text: 'text-blue-800', bg: 'bg-blue-100' },
  WARN: { text: 'text-yellow-800', bg: 'bg-yellow-100' },
  ERROR: { text: 'text-red-800', bg: 'bg-red-100' },
  DEBUG: { text: 'text-gray-600', bg: 'bg-gray-200' },
};


export const LogViewer: React.FC<LogViewerProps> = ({ onClose }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = logger.subscribe(setLogs);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const formatDetails = (details: any): string => {
    if (!details) return '';
    if (details instanceof Error) return details.stack || details.message;
    if (typeof details === 'object') return JSON.stringify(details, null, 2);
    return String(details);
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-nexus-gray-light-100 dark:bg-nexus-gray-800 rounded-lg shadow-xl w-full max-w-4xl h-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <header className="p-4 border-b border-nexus-gray-light-300 dark:border-nexus-gray-700 flex justify-between items-center flex-shrink-0">
          <h2 className="text-xl font-bold text-nexus-gray-900 dark:text-white">Application Logs</h2>
          <div className="flex items-center space-x-4">
            <button onClick={logger.clearLogs} className="flex items-center space-x-2 text-nexus-gray-700 dark:text-nexus-gray-400 hover:text-nexus-gray-900 dark:hover:text-white transition-colors">
              <TrashIcon className="w-5 h-5" />
              <span>Clear Logs</span>
            </button>
            <button onClick={onClose} className="text-nexus-gray-700 dark:text-nexus-gray-400 hover:text-nexus-gray-900 dark:hover:text-white transition-colors text-2xl font-bold leading-none p-1">&times;</button>
          </div>
        </header>
        <div ref={logContainerRef} className="flex-1 p-4 overflow-y-auto font-mono text-sm space-y-2">
          {logs.map(log => (
            <div key={log.id} className="border-b border-nexus-gray-light-300/50 dark:border-nexus-gray-700/50 pb-2">
              <div className="flex items-baseline flex-wrap">
                <span className="text-gray-500 dark:text-gray-500 mr-2">{log.timestamp.toLocaleTimeString('en-US', { hour12: false })}</span>
                <span className={`font-bold mr-2 px-2 py-0.5 rounded text-xs ${levelClassesLight[log.level].bg} ${levelClassesLight[log.level].text} dark:${levelClasses[log.level].bg} dark:${levelClasses[log.level].text}`}>{log.level}</span>
                <span className="text-nexus-gray-900 dark:text-nexus-gray-200 whitespace-pre-wrap">{log.message}</span>
              </div>
              {log.details && (
                <pre className="text-nexus-gray-800 dark:text-nexus-gray-400 text-xs bg-nexus-gray-light-200 dark:bg-nexus-dark p-2 rounded mt-1 whitespace-pre-wrap break-words">
                  {formatDetails(log.details)}
                </pre>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};