import { Users, Gift, Zap } from 'lucide-react';

const BOT_URL = 'https://t.me/gstdaibot';

export default function ReferralPanel() {
    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="relative glass-card p-8 bg-gradient-to-br from-violet-600/10 to-transparent border-violet-500/20">
                <div className="absolute top-0 right-0 w-64 h-64 bg-violet-500/5 rounded-full blur-[80px] -mr-32 -mt-32" />
                <div className="relative z-10 flex flex-col items-start gap-6">
                    <div className="p-3 rounded-2xl bg-violet-500/10 border border-violet-500/20 text-violet-400">
                        <Users className="w-8 h-8" />
                    </div>
                    <div>
                        <h2 className="text-3xl font-black text-white mb-2 tracking-tight">Invite Friends</h2>
                        <p className="text-gray-400 text-sm max-w-xl">
                            Referral rewards are tracked through the GSTD Telegram bot. Open the bot, link your
                            wallet, and share your personal invite link from there.
                        </p>
                    </div>
                    <a
                        href={BOT_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-6 py-3 bg-white text-black rounded-xl font-bold uppercase text-xs tracking-widest hover:bg-violet-400 hover:text-white transition-all"
                    >
                        Open @gstdaibot
                    </a>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="glass-card p-6 border-white/5">
                    <div className="flex items-center gap-4 mb-3">
                        <div className="p-3 rounded-full bg-emerald-500/20 text-emerald-400">
                            <Gift size={20} />
                        </div>
                        <h3 className="text-sm font-black text-gray-300 uppercase tracking-widest">You Earn</h3>
                    </div>
                    <p className="text-2xl font-black text-white">1.0 GSTD</p>
                    <p className="text-xs text-gray-500 mt-1">Per friend who links a wallet through your invite link.</p>
                </div>
                <div className="glass-card p-6 border-white/5">
                    <div className="flex items-center gap-4 mb-3">
                        <div className="p-3 rounded-full bg-cyan-500/20 text-cyan-400">
                            <Zap size={20} />
                        </div>
                        <h3 className="text-sm font-black text-gray-300 uppercase tracking-widest">They Earn</h3>
                    </div>
                    <p className="text-2xl font-black text-white">+0.2 GSTD</p>
                    <p className="text-xs text-gray-500 mt-1">Extra welcome bonus on top of the standard 0.5 GSTD.</p>
                </div>
            </div>

            <div className="glass-card p-6 bg-white/[0.02] border-white/5">
                <p className="text-xs text-gray-500 leading-relaxed max-w-2xl">
                    In the bot, send <code>/start</code>, link your TON wallet, then use <code>/wallet</code> to see
                    it again anytime. Your personal invite link looks like
                    <code className="mx-1">t.me/gstdaibot?start=ref_&lt;your_telegram_id&gt;</code>
                    and is shown once your wallet is linked.
                </p>
            </div>
        </div>
    );
}
