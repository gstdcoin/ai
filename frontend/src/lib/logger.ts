type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

class Logger {
    private fmt(level: LogLevel, message: string): string {
        return `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}`;
    }

    debug(message: string, ...args: unknown[]): void {
        if (!IS_PRODUCTION) console.debug('%s', this.fmt('debug', message), ...args);
    }

    info(message: string, ...args: unknown[]): void {
        if (!IS_PRODUCTION) console.info('%s', this.fmt('info', message), ...args);
    }

    warn(message: string, ...args: unknown[]): void {
        // Warnings are emitted in all environments for quota and rate alerts.
        console.warn('%s', this.fmt('warn', message), ...args);
    }

    error(message: string, error?: Error | unknown, ...args: unknown[]): void {
        // Errors are always emitted for runtime logs and Sentry.
        console.error('%s', this.fmt('error', message), error, ...args);
    }
}

export const logger = new Logger();
