import React, { useState, useEffect } from 'react';
import { useTranslation } from 'next-i18next';
import { wsClient } from '../../lib/websocket';
import { Activity, Zap, CheckCircle, Clock } from 'lucide-react';

interface NetworkEvent {
    id: string;
    type: 'task_created' | 'task_claimed' | 'task_completed';
    title: string;
    timestamp: number;
    payload?: any;
}

export const ActivityFeed: React.FC = () => {
    const { t } = useTranslation('common');
    const [events, setEvents] = useState<NetworkEvent[]>([]);

    useEffect(() => {
        const handleNewTask = (data: any) => {
            const newEvent: NetworkEvent = {
                id: Math.random().toString(36).substr(2, 9),
                type: 'task_created',
                title: `New Task: ${data.task_type}`,
                timestamp: Date.now(),
                payload: data
            };
            setEvents(prev => [newEvent, ...prev].slice(0, 10));
        };

        const handleClaim = (data: any) => {
            const newEvent: NetworkEvent = {
                id: Math.random().toString(36).substr(2, 9),
                type: 'task_claimed',
                title: `Task Claimed: ${data.task_id.substring(0, 8)}...`,
                timestamp: Date.now(),
                payload: data
            };
            setEvents(prev => [newEvent, ...prev].slice(0, 10));
        };

        const unsubscribeTask = wsClient.subscribe('task_notification', handleNewTask);
        const unsubscribeClaim = wsClient.subscribe('task_claimed', handleClaim);

        return () => {
            unsubscribeTask();
            unsubscribeClaim();
        };
    }, []);

    const getIcon = (type: string) => {
        switch (type) {
            case 'task_created': return <Zap className="w-3 h-3 text-blue-400" />;
            case 'task_claimed': return <Clock className="w-3 h-3 text-yellow-400" />;
            case 'task_completed': return <CheckCircle className="w-3 h-3 text-green-400" />;
            default: return <Activity className="w-3 h-3 text-gray-400" />;
        }
    };

    return (
        <div className="bg-gray-900/40 backdrop-blur-md rounded-2xl border border-gray-700/50 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-700/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-blue-400 animate-pulse" />
                    <span className="text-sm font-semibold text-white tracking-wider uppercase">{t('client.liveActivity')}</span>
                </div>
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
            </div>

            <div className="p-2 max-h-[320px] overflow-y-auto scrollbar-hide">
                {events.length === 0 ? (
                    <div className="py-8 text-center">
                        <p className="text-xs text-gray-500 italic">Listening for network events...</p>
                    </div>
                ) : (
                    <div className="space-y-1">
                        {events.map((event) => (
                            <div key={event.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors border border-transparent hover:border-white/5 group">
                                <div className="p-2 bg-gray-800 rounded-lg group-hover:scale-110 transition-transform">
                                    {getIcon(event.type)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-gray-300 truncate">{event.title}</p>
                                    <p className="text-[10px] text-gray-600 mt-0.5">
                                        {new Date(event.timestamp).toLocaleTimeString()}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
