
export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

export interface LogEntry {
  id: number;
  timestamp: Date;
  level: LogLevel;
  message: string;
  details?: any;
}

type LogListener = (logs: LogEntry[]) => void;

class LoggingService {
  private logs: LogEntry[] = [];
  private listeners: Set<LogListener> = new Set();
  private nextId = 0;
  private readonly MAX_LOGS = 1000;

  private addLog(level: LogLevel, message: string, details?: any) {
    const newLog: LogEntry = {
      id: this.nextId++,
      timestamp: new Date(),
      level,
      message,
      details,
    };
    
    // Add new log and cap the total number of logs to prevent memory issues
    this.logs = [...this.logs, newLog].slice(-this.MAX_LOGS);
    
    // Also log to console for developers
    const detailsToLog = details ? (details instanceof Error ? details : (typeof details === 'object' ? details : String(details))) : undefined;
    
    switch(level) {
        case 'INFO': console.log(`[INFO] ${message}`, detailsToLog || ''); break;
        case 'WARN': console.warn(`[WARN] ${message}`, detailsToLog || ''); break;
        case 'ERROR': console.error(`[ERROR] ${message}`, detailsToLog || ''); break;
        case 'DEBUG': console.debug(`[DEBUG] ${message}`, detailsToLog || ''); break;
    }
    
    this.notifyListeners();
  }

  public log = (message: string, details?: any) => this.addLog('INFO', message, details);
  public warn = (message: string, details?: any) => this.addLog('WARN', message, details);
  public error = (message: string, details?: any) => this.addLog('ERROR', message, details);
  public debug = (message: string, details?: any) => this.addLog('DEBUG', message, details);

  public getLogs = (): LogEntry[] => this.logs;

  public clearLogs = () => {
    this.logs = [];
    this.notifyListeners();
    this.log("Logs cleared by user.");
  };

  public subscribe = (listener: LogListener): (() => void) => {
    this.listeners.add(listener);
    listener(this.logs); // Immediately provide current logs
    return () => {
      this.listeners.delete(listener);
    };
  };

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.logs));
  }
}

export const logger = new LoggingService();
