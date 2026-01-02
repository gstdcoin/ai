import { useTranslation } from 'next-i18next';

export default function HelpPanel() {
  const { t } = useTranslation('common');

  return (
    <div className="space-y-8 sm:space-y-12 max-w-4xl pb-20">
      {/* О платформе */}
      <section>
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">{t('about_platform')}</h2>
        <p className="text-base sm:text-lg text-gray-600 leading-relaxed mb-6">
          {t('platform_desc_long')}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          <div className="bg-indigo-50 p-6 rounded-xl border border-indigo-100">
            <h3 className="font-bold text-indigo-900 mb-2">⚡ 5s Latency</h3>
            <p className="text-sm text-indigo-700">{t('feature_latency')}</p>
          </div>
          <div className="bg-green-50 p-6 rounded-xl border border-green-100">
            <h3 className="font-bold text-green-900 mb-2">🛡️ E2E Encrypted</h3>
            <p className="text-sm text-green-700">{t('feature_security')}</p>
          </div>
          <div className="bg-purple-50 p-6 rounded-xl border border-purple-100">
            <h3 className="font-bold text-purple-900 mb-2">💎 Quality Depth</h3>
            <p className="text-sm text-purple-700">{t('feature_quality_desc')}</p>
          </div>
          <div className="bg-orange-50 p-6 rounded-xl border border-orange-100">
            <h3 className="font-bold text-orange-900 mb-2">🌐 Global Neutral</h3>
            <p className="text-sm text-orange-700">{t('feature_neutrality')}</p>
          </div>
        </div>
      </section>

      {/* Для заказчика */}
      <section>
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
          💼 {t('for_customers')}
        </h2>
        <div className="space-y-4 sm:space-y-6">
          <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="font-bold text-base sm:text-lg mb-3">{t('manual_creation')}</h3>
            <ol className="list-decimal list-inside space-y-2 text-sm sm:text-base text-gray-600">
              <li>{t('step_cust_1')}</li>
              <li>{t('step_cust_2')}</li>
              <li>{t('step_cust_3')}</li>
              <li>{t('step_cust_4')}</li>
            </ol>
          </div>
          <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="font-bold text-base sm:text-lg mb-3">🤖 {t('automated_api')}</h3>
            <p className="text-sm sm:text-base text-gray-600 mb-4">{t('api_desc')}</p>
            <div className="bg-gray-900 rounded-lg p-3 sm:p-4 font-mono text-xs sm:text-sm text-gray-300 overflow-x-auto">
              <p className="text-blue-400"># Create task via API</p>
              <p>curl -X POST https://app.gstdtoken.com/api/v1/tasks \</p>
              <p>  -H "Content-Type: application/json" \</p>
              <p>  -d &#123;</p>
              <p>    "requester_address": "YOUR_WALLET",</p>
              <p>    "task_type": "inference",</p>
              <p>    "labor_compensation_ton": 0.5</p>
              <p>  &#125;</p>
            </div>
          </div>
        </div>
      </section>

      {/* Для исполнителя */}
      <section>
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
          📱 {t('for_executors')}
        </h2>
        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="font-bold text-base sm:text-lg mb-3">{t('how_to_earn')}</h3>
          <ul className="space-y-4">
            <li className="flex gap-3">
              <span className="bg-primary-100 text-primary-700 w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">1</span>
              <div>
                <p className="font-semibold text-gray-900 text-sm sm:text-base">{t('step_exec_1_title')}</p>
                <p className="text-gray-600 text-xs sm:text-sm">{t('step_exec_1_desc')}</p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="bg-primary-100 text-primary-700 w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">2</span>
              <div>
                <p className="font-semibold text-gray-900 text-sm sm:text-base">{t('step_exec_2_title')}</p>
                <p className="text-gray-600 text-xs sm:text-sm">{t('step_exec_2_desc')}</p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="bg-primary-100 text-primary-700 w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">3</span>
              <div>
                <p className="font-semibold text-gray-900 text-sm sm:text-base">{t('step_exec_3_title')}</p>
                <p className="text-gray-600 text-xs sm:text-sm">{t('step_exec_3_desc')}</p>
              </div>
            </li>
          </ul>
        </div>
      </section>

      {/* How it Works - 3-step guide for Workers */}
      <section>
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
          ⚙️ {t('how_it_works') || 'How it Works'}
        </h2>
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 sm:p-6 rounded-xl shadow-sm border border-blue-100">
          <p className="text-sm sm:text-base text-gray-700 mb-6">
            {t('how_it_works_desc') || 'GSTD Platform connects Workers with computational tasks in a decentralized network. Here\'s how Workers participate:'}
          </p>
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-lg border border-blue-200">
              <div className="flex items-start gap-3">
                <span className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">1</span>
                <div>
                  <h4 className="font-bold text-gray-900 mb-1">{t('step_1_register') || 'Register Your Device'}</h4>
                  <p className="text-sm text-gray-600">
                    {t('step_1_register_desc') || 'Connect your device to the GSTD network. Your device becomes a Worker node that can process tasks.'}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-blue-200">
              <div className="flex items-start gap-3">
                <span className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">2</span>
                <div>
                  <h4 className="font-bold text-gray-900 mb-1">{t('step_2_execute') || 'Execute Tasks'}</h4>
                  <p className="text-sm text-gray-600">
                    {t('step_2_execute_desc') || 'Receive and execute computational tasks (AI inference, validation, etc.). Tasks are automatically assigned based on your device capabilities.'}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-blue-200">
              <div className="flex items-start gap-3">
                <span className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">3</span>
                <div>
                  <h4 className="font-bold text-gray-900 mb-1">{t('step_3_earn') || 'Earn Labor Compensation'}</h4>
                  <p className="text-sm text-gray-600">
                    {t('step_3_earn_desc') || 'Get paid in TON for successfully completed tasks. Labor compensation is automatically distributed via smart contracts.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Business Use Cases */}
      <section>
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
          💼 {t('business_use_cases') || 'Business Use Cases'}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="text-3xl mb-3">🤖</div>
            <h3 className="font-bold text-lg mb-2">{t('ai_verification') || 'AI Verification'}</h3>
            <p className="text-sm text-gray-600">
              {t('ai_verification_desc') || 'Distribute AI model inference across a decentralized network. Perfect for content moderation, image classification, and NLP tasks.'}
            </p>
          </div>
          <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="text-3xl mb-3">🏛️</div>
            <h3 className="font-bold text-lg mb-2">{t('govtech') || 'GovTech'}</h3>
            <p className="text-sm text-gray-600">
              {t('govtech_desc') || 'Government and public sector applications: document verification, citizen services automation, and transparent governance processes.'}
            </p>
          </div>
          <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="text-3xl mb-3">🌐</div>
            <h3 className="font-bold text-lg mb-2">{t('iot') || 'IoT & Edge Computing'}</h3>
            <p className="text-sm text-gray-600">
              {t('iot_desc') || 'Process data from IoT devices at the edge. Real-time sensor data analysis, smart city applications, and distributed monitoring.'}
            </p>
          </div>
        </div>
      </section>

      {/* GSTD Utility */}
      <section>
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
          💎 {t('gstd_utility') || 'GSTD Utility'}
        </h2>
        <div className="bg-gradient-to-br from-purple-50 to-indigo-50 p-4 sm:p-6 rounded-xl shadow-sm border border-purple-100">
          <p className="text-base sm:text-lg text-gray-700 mb-4 leading-relaxed">
            <strong>{t('gstd_utility_title') || 'GSTD (Guaranteed Service Time Depth)'}</strong> {t('gstd_utility_desc') || 'is a technical parameter that measures the certainty depth of computational results in the network.'}
          </p>
          <div className="space-y-3 mt-4">
            <div className="bg-white p-4 rounded-lg border border-purple-200">
              <h4 className="font-semibold text-gray-900 mb-2">{t('what_is_gstd') || 'What is GSTD?'}</h4>
              <p className="text-sm text-gray-600">
                {t('what_is_gstd_desc') || 'GSTD represents the guaranteed level of service quality and result validation. Higher GSTD means more validation layers and greater certainty in computational outputs.'}
              </p>
            </div>
            <div className="bg-white p-4 rounded-lg border border-purple-200">
              <h4 className="font-semibold text-gray-900 mb-2">{t('how_gstd_works') || 'How GSTD Works'}</h4>
              <p className="text-sm text-gray-600">
                {t('how_gstd_works_desc') || 'When you create a task, you specify a minimum GSTD requirement. The network ensures your task is validated by multiple Workers to meet this certainty depth. Higher GSTD requirements provide more reliable results but may take longer and cost more.'}
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

