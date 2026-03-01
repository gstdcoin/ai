import React from 'react';

export const ROICalculator: React.FC = () => {
    return (
        <div className="mt-12 p-6 bg-gray-900 rounded-2xl border border-gray-700">
            <h3 className="text-xl font-bold text-white">{t('roi_calculator_disabled_for_maintenance', 'ROI Calculator (Disabled for Maintenance)')}</h3>
        </div>
    );
};
