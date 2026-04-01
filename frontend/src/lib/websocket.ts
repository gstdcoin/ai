import { toast } from 'sonner';
import { logger } from './logger';
import { WS_URL } from './config';

type MessageHandler = (data: any) => void;

class WebSocketClient {
    private ws: WebSocket | null = null;
    private url: string;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 10;
    private handlers: Map<string, Set<MessageHandler>> = new Map();
    private messageQueue: string[] = [];
    private _isConnected = false;
    private pingInterval: NodeJS.Timeout | null = null;
    private token: string | null = null;
    private lastEventTimestamp: number = 0;
    /** Avoid duplicate “connected” toasts on every reconnect. */
    private hasAnnouncedConnect = false;

    constructor(url: string) {
        this.url = url;
    }

    public setToken(token: string) {
        this.token = token;
        // If connected, reconnect with new token
        if (this._isConnected) {
            this.disconnect();
            this.connect();
        }
    }

    public connect() {
        if (this.ws?.readyState === WebSocket.OPEN) return;

        // Use token in query param if available
        const wsUrl = this.token
            ? `${this.url}?token=${encodeURIComponent(this.token)}`
            : this.url;

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                logger.info('WebSocket Connected');
                this._isConnected = true;
                this.reconnectAttempts = 0;
                this.flushQueue();
                this.startHeartbeat();

                // State Recovery: Request missed events since last disconnect
                if (this.lastEventTimestamp > 0) {
                    logger.info(`Requesting event replay since ${new Date(this.lastEventTimestamp).toISOString()}`);
                    this.send('replay_events', { since: this.lastEventTimestamp });
                }

                toast.dismiss('ws-error');
                if (!this.hasAnnouncedConnect) {
                    toast.success('Real-time connection established', { id: 'ws-connected', duration: 2500 });
                    this.hasAnnouncedConnect = true;
                }
                this.emit('connection_status', { status: 'connected' });
            };

            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    // Update timestamp for state recovery
                    this.lastEventTimestamp = Date.now();

                    // Handle heartbeat pong
                    if (message.type === 'pong') return;

                    this.emit(message.type, message.payload);
                } catch (e) {
                    logger.error('Failed to parse WS message:', e);
                }
            };

            this.ws.onclose = () => {
                this.handleDisconnect('Connection closed');
            };

            this.ws.onerror = (error) => {
                logger.error('WebSocket Error:', error);
                // Don't close here, onclose will trigger
            };

        } catch (e) {
            logger.error('WebSocket Connection Failed:', e);
            this.handleDisconnect('Connection failed');
        }
    }

    private handleDisconnect(reason: string) {
        const wasConnected = this._isConnected;
        this._isConnected = false;
        this.stopHeartbeat();
        if (wasConnected) {
            this.emit('connection_status', { status: 'disconnected', reason });
        }

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
            logger.info(`Reconnecting in ${delay}ms... (Attempt ${this.reconnectAttempts + 1})`);
            setTimeout(() => this.connect(), delay);
            this.reconnectAttempts++;
        } else {
            toast.error('Connection lost. Please refresh the page.', { id: 'ws-error', duration: Infinity });
        }
    }

    private startHeartbeat() {
        this.stopHeartbeat();
        this.pingInterval = setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: 'ping' }));
            }
        }, 30000);
    }

    private stopHeartbeat() {
        if (this.pingInterval) clearInterval(this.pingInterval);
    }

    public send(type: string, payload: any) {
        const msg = JSON.stringify({ type, payload });
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(msg);
        } else {
            this.messageQueue.push(msg);
        }
    }

    private flushQueue() {
        while (this.messageQueue.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
            const msg = this.messageQueue.shift();
            if (msg) this.ws.send(msg);
        }
    }

    public subscribe(type: string, handler: MessageHandler) {
        if (!this.handlers.has(type)) {
            this.handlers.set(type, new Set());
        }
        this.handlers.get(type)?.add(handler);
        return () => this.unsubscribe(type, handler);
    }

    public unsubscribe(type: string, handler: MessageHandler) {
        this.handlers.get(type)?.delete(handler);
    }

    private emit(type: string, data: any) {
        this.handlers.get(type)?.forEach(handler => handler(data));
        // Also emit to wildcard listeners if needed
    }

    public isConnected(): boolean {
        return this._isConnected;
    }

    public disconnect() {
        this.stopHeartbeat();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this._isConnected = false;
    }
}

const wsRoot = `${WS_URL.replace(/\/+$/, '')}/ws`;
export const wsClient = new WebSocketClient(wsRoot);
