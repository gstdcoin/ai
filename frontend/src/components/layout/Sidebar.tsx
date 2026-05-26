import React, { useState } from 'react';
import { useTranslation } from 'next-i18next';
import {
    Home, Server, ListTodo, MessageSquare, BarChart3, HelpCircle,
    X, Menu, Cpu, ArrowRightLeft, Bot, Download, Users, Globe, FileText,
} from 'lucide-react';
import { Tab } from '../../types/tabs';

interface SidebarProps {
    activeTab: Tab;
    onTabChange: (tab: Tab) => void;
}

export default function Sidebar({ activeTab, onTabChange }: SidebarProps) {
    const { t } = useTranslation('common');
    const [isOpen, setIsOpen] = useState(false);

    const mainTabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
        { id: 'home',  label: t('tab_home',  'Home'),  icon: <Home     size={18} /> },
        { id: 'tasks', label: t('tab_tasks', 'Tasks'), icon: <ListTodo size={18} /> },
        { id: 'nodes', label: t('tab_nodes', 'Nodes'), icon: <Server   size={18} /> },
    ];

    // Pages that exist and work
    const tools: Array<{ label: string; icon: React.ReactNode; href: string }> = [
        { label: t('chat',    'Chat'),    icon: <MessageSquare  size={18} />, href: '/chat'    },
        { label: t('bridge',  'Bridge'),  icon: <ArrowRightLeft size={18} />, href: '/bridge'  },
        { label: t('agents',  'Agents'),  icon: <Bot            size={18} />, href: '/agents'  },
        { label: t('agent',   'My Agent'),icon: <Cpu            size={18} />, href: '/agent'   },
        { label: t('stats',   'Stats'),   icon: <BarChart3      size={18} />, href: '/stats'   },
        { label: t('network', 'Network'), icon: <Globe          size={18} />, href: '/network' },
    ];

    const info: Array<{ label: string; icon: React.ReactNode; href: string }> = [
        { label: t('downloads',  'Downloads'),  icon: <Download  size={18} />, href: '/downloads'  },
        { label: t('referrals',  'Referrals'),  icon: <Users     size={18} />, href: '/referrals'  },
        { label: t('docs',       'Docs'),        icon: <FileText  size={18} />, href: '/docs'       },
        { label: t('help_center','Help'),        icon: <HelpCircle size={18} />, href: '/about'     },
    ];

    const close = () => setIsOpen(false);

    const linkClass = 'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] text-gray-500 hover:text-gray-200 hover:bg-white/[0.04] transition-all';

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-white/5 text-white"
                aria-label={t('menu', 'Menu')}
            >
                <Menu size={22} />
            </button>

            {isOpen && (
                <div
                    className="lg:hidden fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
                    onClick={close}
                />
            )}

            <aside
                className={`fixed lg:static inset-y-0 left-0 z-50 w-52 transform transition-transform duration-300
                    ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
                style={{
                    background: 'rgba(8, 8, 26, 0.95)',
                    backdropFilter: 'blur(20px)',
                    borderRight: '1px solid rgba(255,255,255,0.06)',
                }}
            >
                <div className="flex flex-col h-full overflow-y-auto">
                    {/* Logo */}
                    <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
                        <span style={{
                            fontWeight: 800,
                            fontSize: 18,
                            background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                        }}>
                            GSTD
                        </span>
                        <button
                            onClick={close}
                            className="lg:hidden p-1.5 rounded-lg hover:bg-white/5 text-gray-400"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    <nav className="flex-1 p-3 space-y-1">
                        {/* Main tabs (rendered by AppLayout's tab system) */}
                        <div className="text-[10px] font-bold text-gray-600 uppercase tracking-wider px-3 mb-2">
                            {t('menu', 'Menu')}
                        </div>
                        {mainTabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => { onTabChange(tab.id); close(); }}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] transition-all
                                    ${activeTab === tab.id
                                        ? 'bg-violet-500/10 text-white font-semibold border border-violet-500/15'
                                        : 'text-gray-400 hover:text-white hover:bg-white/[0.04] border border-transparent'
                                    }`}
                            >
                                {tab.icon}
                                <span>{tab.label}</span>
                            </button>
                        ))}

                        <div className="h-px bg-white/[0.04] my-3" />

                        {/* Tools */}
                        <div className="text-[10px] font-bold text-gray-600 uppercase tracking-wider px-3 mb-2">
                            {t('tools', 'Tools')}
                        </div>
                        {tools.map(link => (
                            <a key={link.href} href={link.href} onClick={close} className={linkClass}>
                                {link.icon}
                                <span>{link.label}</span>
                            </a>
                        ))}

                        <div className="h-px bg-white/[0.04] my-3" />

                        {/* Info */}
                        <div className="text-[10px] font-bold text-gray-600 uppercase tracking-wider px-3 mb-2">
                            {t('info', 'Info')}
                        </div>
                        {info.map(link => (
                            <a key={link.href} href={link.href} onClick={close} className={linkClass}>
                                {link.icon}
                                <span>{link.label}</span>
                            </a>
                        ))}
                    </nav>

                    {/* Footer */}
                    <div className="p-4 border-t border-white/[0.06]">
                        <a
                            href="https://github.com/gstdcoin"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-gray-600 hover:text-gray-400 transition-colors"
                        >
                            github.com/gstdcoin
                        </a>
                    </div>
                </div>
            </aside>
        </>
    );
}
