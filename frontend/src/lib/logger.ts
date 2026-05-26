type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

class Logger {
    private fmt(level: LogLevel, message: string): string {
        return `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}`;
    }

    debug(message: string, ...args: unknown[]): void {
        if (!IS_PRODUCTION) console.debug(this.fmt('debug', message), ...args);
    }

    info(message: string, ...args: unknown[]): void {
        if (!IS_PRODUCTION) console.info(this.fmt('info', message), ...args);
    }

    warn(message: string, ...args: unknown[]): void {
        // warn goes to Vercel Logs in all envs — useful for quota/rate alerts
        console.warn(this.fmt('warn', message), ...args);
    }

    error(message: string, error?: Error | unknown, ...args: unknown[]): void {
        // errors always surface in Vercel Logs / Sentry
        console.error(this.fmt('error', message), error, ...args);
    }
}

export const logger = new Logger();
