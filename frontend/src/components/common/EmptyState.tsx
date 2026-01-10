import { ReactNode } from 'react';
import { useTranslation } from 'next-i18next';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 ${className}`}>
      {icon && <div className="mb-4 text-gray-400">{icon}</div>}
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      {description && <p className="text-sm text-gray-500 text-center max-w-md mb-4">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

interface EmptyStatePresetProps {
  type: 'tasks' | 'devices' | 'results' | 'no-data';
  action?: ReactNode;
}

export function EmptyStatePreset({ type, action }: EmptyStatePresetProps) {
  const { t } = useTranslation('common');

  const presets = {
    tasks: {
      icon: '📋',
      title: t('no_tasks') || 'No tasks',
      description: t('no_tasks_desc') || 'No tasks found. Create a new task to get started.',
    },
    devices: {
      icon: '📱',
      title: t('no_nodes') || 'No devices',
      description: t('no_nodes_desc') || 'Register your first computing node to start earning GSTD.',
    },
    results: {
      icon: '📊',
      title: 'No results',
      description: 'No results available yet.',
    },
    'no-data': {
      icon: '📭',
      title: 'No data',
      description: 'No data available at this time.',
    },
  };

  const preset = presets[type];

  return <EmptyState {...preset} action={action} />;
}
