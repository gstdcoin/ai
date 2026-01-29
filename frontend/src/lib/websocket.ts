import { toast } from 'sonner';

type MessageHandler = (data: any) => void;

class WebSocketClient {
    private ws: WebSocket | null = null;
    private url: string;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 10;
    private handlers: Map<string, Set<MessageHandler>> = new Map();
    private messageQueue: string[] = [];
    private isConnected = false;
    private pingInterval: NodeJS.Timeout | null = null;
    private token: string | null = null;
    private lastEventTimestamp: number = 0;

    constructor(url: string) {
        this.url = url;
    }

    public setToken(token: string) {
        this.token = token;
        // If connected, reconnect with new token
        if (this.isConnected) {
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
                console.log('✅ WebSocket Connected');
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.flushQueue();
                this.startHeartbeat();

                // State Recovery: Request missed events since last disconnect
                if (this.lastEventTimestamp > 0) {
                    console.log(`📡 Requesting event replay since ${new Date(this.lastEventTimestamp).toISOString()}`);
                    this.send('replay_events', { since: this.lastEventTimestamp });
                }

                toast.dismiss('ws-error');
                toast.success('Real-time connection established');
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
                    console.error('Failed to parse WS message:', event.data);
                }
            };

            this.ws.onclose = () => {
                this.handleDisconnect('Connection closed');
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket Error:', error);
                // Don't close here, onclose will trigger
            };

        } catch (e) {
            console.error('WebSocket Connection Failed:', e);
            this.handleDisconnect('Connection failed');
        }
    }

    private handleDisconnect(reason: string) {
        if (!this.isConnected) return; // Already handling

        this.isConnected = false;
        this.stopHeartbeat();
        this.emit('connection_status', { status: 'disconnected', reason });

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
            console.log(`♻️ Reconnecting in ${delay}ms... (Attempt ${this.reconnectAttempts + 1})`);
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

    public disconnect() {
        this.stopHeartbeat();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
    }
}

// Singleton instance
// Use explicit URL or fallback to window.location
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'wss://app.gstdtoken.com/ws';
export const wsClient = new WebSocketClient(WS_URL);
