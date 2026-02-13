/**
 * Ascension Protocol: Zero-Leakage Production Logger
 * In production: NO console output. All logging suppressed.
 * Development: Full logging.
 */
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

class Logger {
  private formatMessage(level: LogLevel, message: string): string {
    return `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}`;
  }

  debug(_message: string, ..._args: any[]): void {
    if (!IS_PRODUCTION) {
      // eslint-disable-next-line no-console
      console.debug(this.formatMessage('debug', _message), ..._args);
    }
  }

  info(_message: string, ..._args: any[]): void {
    if (!IS_PRODUCTION) {
      // eslint-disable-next-line no-console
      console.info(this.formatMessage('info', _message), ..._args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (!IS_PRODUCTION) {
      // eslint-disable-next-line no-console
      console.warn(this.formatMessage('warn', message), ...args);
    }
  }

  error(message: string, error?: Error | unknown, ...args: any[]): void {
    if (!IS_PRODUCTION) {
      // eslint-disable-next-line no-console
      console.error(this.formatMessage('error', message), error, ...args);
    }
  }
}

export const logger = new Logger();
