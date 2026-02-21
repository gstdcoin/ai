import React, { useState, useEffect } from 'react';
import { wsClient } from '../../lib/websocket';
import { Megaphone, X, Sparkles } from 'lucide-react';
import { apiGet } from '../../lib/apiClient';

interface Announcement {
    type: string;
    message: string;
    payload?: any;
    timestamp: string | number;
}

export const VoiceBanner: React.FC = () => {
    const [announcement, setAnnouncement] = useState<Announcement | null>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        // 1. Load latest bulletin from Hive Memory
        const loadLatest = async () => {
            try {
                const bulletins = await apiGet<any[]>('/knowledge/search', { topic: 'bulletin', limit: 1 });
                if (bulletins && bulletins.length > 0) {
                    const latest = bulletins[0];
                    setAnnouncement({
                        type: 'bulletin',
                        message: latest.content,
                        timestamp: latest.created_at
                    });
                    setVisible(true);
                }
            } catch (err) {
                console.warn('Failed to load initial bulletin', err);
            }
        };

        loadLatest();

        // 2. Listen for live announcements
        const handleAnnouncement = (data: any) => {
            setAnnouncement(data);
            setVisible(true);
            // Auto hide after 30 seconds if it's a transient message
            if (data.type !== 'critical') {
                setTimeout(() => setVisible(false), 30000);
            }
        };

        const unsubscribe = wsClient.subscribe('system_announcement', handleAnnouncement);
        return () => unsubscribe();
    }, []);

    if (!visible || !announcement) return null;

    return (
        <div className="relative group animate-in slide-in-from-top-4 duration-500 mb-8">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-violet-600 to-cyan-500 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
            <div className="relative px-6 py-4 bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl flex items-center gap-4">
                <div className="p-2 bg-violet-500/10 rounded-xl border border-violet-500/20 text-violet-400">
                    <Megaphone className="w-5 h-5 animate-bounce" />
                </div>

                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-black text-violet-400 uppercase tracking-[0.2em]">The Voice of Creator</span>
                        <Sparkles className="w-3 h-3 text-cyan-400" />
                        <span className="text-[9px] text-gray-600 font-bold ml-auto">
                            {new Date(announcement.timestamp).toLocaleTimeString()}
                        </span>
                    </div>
                    <p className="text-sm font-medium text-white/90 leading-tight">
                        {announcement.message}
                    </p>
                </div>

                <button
                    onClick={() => setVisible(false)}
                    className="p-1 hover:bg-white/5 rounded-lg text-gray-500 hover:text-white transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
};
