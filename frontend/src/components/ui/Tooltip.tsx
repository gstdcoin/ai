import React, { useState } from 'react';

interface TooltipProps {
    content: string;
    children: React.ReactNode;
    position?: 'top' | 'bottom' | 'left' | 'right';
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children, position = 'top' }) => {
    const [isVisible, setIsVisible] = useState(false);

    const positionClasses = {
        top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
        bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
        left: 'right-full top-1/2 -translate-y-1/2 mr-2',
        right: 'left-full top-1/2 -translate-y-1/2 ml-2',
    };

    return (
        <div
            className="relative inline-block"
            onMouseEnter={() => setIsVisible(true)}
            onMouseLeave={() => setIsVisible(false)}
        >
            {children}
            {isVisible && (
                <div className={`absolute z-50 px-3 py-2 text-xs font-medium text-white bg-gray-900 border border-gray-700 rounded-lg shadow-xl backdrop-blur-md opacity-0 animate-in fade-in zoom-in duration-200 pointer-events-none whitespace-nowrap ${positionClasses[position]}`} style={{ opacity: 1 }}>
                    {content}
                    {/* Arrow */}
                    <div className={`absolute w-2 h-2 bg-gray-900 border-gray-700 rotate-45 ${position === 'top' ? 'bottom-[-5px] left-1/2 -translate-x-1/2 border-r border-b' :
                            position === 'bottom' ? 'top-[-5px] left-1/2 -translate-x-1/2 border-l border-t' :
                                position === 'left' ? 'right-[-5px] top-1/2 -translate-y-1/2 border-r border-t' :
                                    'left-[-5px] top-1/2 -translate-y-1/2 border-l border-b'
                        }`} />
                </div>
            )}
        </div>
    );
};
