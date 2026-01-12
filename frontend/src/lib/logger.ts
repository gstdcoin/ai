/**
 * Logger utility for production-safe logging
 * Only logs in development, sends to error tracking in production
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development';

  private shouldLog(level: LogLevel): boolean {
    if (this.isDevelopment) {
      return true;
    }
    // In production, only log errors and warnings
    return level === 'error' || level === 'warn';
  }

  private formatMessage(level: LogLevel, message: string, ...args: any[]): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog('debug')) {
      console.debug(this.formatMessage('debug', message), ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog('info')) {
      console.info(this.formatMessage('info', message), ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message), ...args);
    }
    // In production, send to error tracking service
    if (!this.isDevelopment) {
      // TODO: Integrate with Sentry or other error tracking
      // Sentry.captureMessage(message, 'warning');
    }
  }

  error(message: string, error?: Error | unknown, ...args: any[]): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message), error, ...args);
    }
    // In production, send to error tracking service
    if (!this.isDevelopment) {
      // TODO: Integrate with Sentry or other error tracking
      // if (error instanceof Error) {
      //   Sentry.captureException(error);
      // } else {
      //   Sentry.captureMessage(message, 'error');
      // }
    }
  }
}

export const logger = new Logger();
