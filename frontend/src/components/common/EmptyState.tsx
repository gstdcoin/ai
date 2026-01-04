import React, { memo } from 'react';
import { useTranslation } from 'next-i18next';
import { Inbox, Plus } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

const EmptyState = memo(function EmptyState({ 
  icon, 
  title, 
  description, 
  actionLabel, 
  onAction 
}: EmptyStateProps) {
  const { t } = useTranslation('common');

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="glass-card mb-6 p-6 rounded-full">
        {icon || <Inbox className="text-gray-400" size={48} />}
      </div>
      <h3 className="text-xl font-bold text-white mb-2 font-display">{title}</h3>
      <p className="text-gray-400 mb-6 max-w-md">{description}</p>
      {onAction && actionLabel && (
        <button
          onClick={onAction}
          className="glass-button-gold"
        >
          <Plus size={20} />
          <span>{actionLabel}</span>
        </button>
      )}
    </div>
  );
});

export default EmptyState;
