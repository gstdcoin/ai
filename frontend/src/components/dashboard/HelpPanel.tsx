import { useTranslation } from 'next-i18next';
import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export default function HelpPanel() {
  const { t } = useTranslation('common');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    platform: true,
    customers: true,
    executors: true,
    howItWorks: true,
    useCases: true,
    gstd: true,
  });

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <div className="space-y-8 sm:space-y-12 max-w-4xl pb-20">
      {/* О платформе */}
      <section>
        <button
          onClick={() => toggleSection('platform')}
          className="w-full flex items-center justify-between text-2xl sm:text-3xl font-bold text-white mb-4 hover:text-gold-900 transition-colors"
        >
          <span>{t('about_platform')}</span>
          {expandedSections.platform ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
        </button>
        {expandedSections.platform && (
          <>
            <p className="text-base sm:text-lg text-gray-300 leading-relaxed mb-6">
              {t('platform_desc_long')}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              <div className="glass-card border-indigo-500/30 bg-indigo-500/10 p-6 rounded-xl">
                <h3 className="font-bold text-indigo-400 mb-2">⚡ 5s Latency</h3>
                <p className="text-sm text-gray-300">{t('feature_latency')}</p>
              </div>
              <div className="glass-card border-green-500/30 bg-green-500/10 p-6 rounded-xl">
                <h3 className="font-bold text-green-400 mb-2">🛡️ E2E Encrypted</h3>
                <p className="text-sm text-gray-300">{t('feature_security')}</p>
              </div>
              <div className="glass-card border-purple-500/30 bg-purple-500/10 p-6 rounded-xl">
                <h3 className="font-bold text-purple-400 mb-2">💎 Quality Depth</h3>
                <p className="text-sm text-gray-300">{t('feature_quality_desc')}</p>
              </div>
              <div className="glass-card border-orange-500/30 bg-orange-500/10 p-6 rounded-xl">
                <h3 className="font-bold text-orange-400 mb-2">🌐 Global Neutral</h3>
                <p className="text-sm text-gray-300">{t('feature_neutrality')}</p>
              </div>
            </div>
          </>
        )}
      </section>

      {/* Для заказчика */}
      <section>
        <button
          onClick={() => toggleSection('customers')}
          className="w-full flex items-center justify-between text-xl sm:text-2xl font-bold text-white mb-6 hover:text-gold-900 transition-colors"
        >
          <span className="flex items-center gap-2">💼 {t('for_customers')}</span>
          {expandedSections.customers ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
        {expandedSections.customers && (
          <div className="space-y-4 sm:space-y-6">
            <div className="glass-card p-4 sm:p-6 rounded-xl">
              <h3 className="font-bold text-base sm:text-lg text-white mb-3">{t('manual_creation')}</h3>
              <ol className="list-decimal list-inside space-y-2 text-sm sm:text-base text-gray-300">
                <li>{t('step_cust_1')}</li>
                <li>{t('step_cust_2')}</li>
                <li>{t('step_cust_3')}</li>
                <li>{t('step_cust_4')}</li>
              </ol>
            </div>
            <div className="glass-card p-4 sm:p-6 rounded-xl">
              <h3 className="font-bold text-base sm:text-lg text-white mb-3">🤖 {t('automated_api')}</h3>
              <p className="text-sm sm:text-base text-gray-300 mb-4">{t('api_desc')}</p>
              <div className="bg-black/50 rounded-lg p-3 sm:p-4 font-mono text-xs sm:text-sm text-gray-300 overflow-x-auto border border-white/10">
                <p className="text-green-400"># Create task via API</p>
                <p className="text-gray-300">curl -X POST https://app.gstdtoken.com/api/v1/tasks/create \</p>
                <p className="text-gray-300">  -H "Content-Type: application/json" \</p>
                <p className="text-gray-300">  -d &#123;</p>
                <p className="text-yellow-300">    "type": "AI_INFERENCE",</p>
                <p className="text-yellow-300">    "budget": 10.5,</p>
                <p className="text-yellow-300">    "payload": &#123;"input": "data"&#125;</p>
                <p className="text-gray-300">  &#125;</p>
                <p className="text-gray-500 mt-2"># Add ?wallet_address=YOUR_WALLET to URL</p>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Для исполнителя */}
      <section>
        <button
          onClick={() => toggleSection('executors')}
          className="w-full flex items-center justify-between text-xl sm:text-2xl font-bold text-white mb-6 hover:text-gold-900 transition-colors"
        >
          <span className="flex items-center gap-2">📱 {t('for_executors')}</span>
          {expandedSections.executors ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
        {expandedSections.executors && (
          <div className="glass-card p-4 sm:p-6 rounded-xl">
            <h3 className="font-bold text-base sm:text-lg text-white mb-3">{t('how_to_earn')}</h3>
            <ul className="space-y-4">
              <li className="flex gap-3">
                <span className="bg-gold-900/30 text-gold-900 border border-gold-900/50 w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">1</span>
                <div>
                  <p className="font-semibold text-white text-sm sm:text-base">{t('step_exec_1_title')}</p>
                  <p className="text-gray-300 text-xs sm:text-sm">{t('step_exec_1_desc')}</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="bg-gold-900/30 text-gold-900 border border-gold-900/50 w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">2</span>
                <div>
                  <p className="font-semibold text-white text-sm sm:text-base">{t('step_exec_2_title')}</p>
                  <p className="text-gray-300 text-xs sm:text-sm">{t('step_exec_2_desc')}</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="bg-gold-900/30 text-gold-900 border border-gold-900/50 w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">3</span>
                <div>
                  <p className="font-semibold text-white text-sm sm:text-base">{t('step_exec_3_title')}</p>
                  <p className="text-gray-300 text-xs sm:text-sm">{t('step_exec_3_desc')}</p>
                </div>
              </li>
            </ul>
          </div>
        )}
      </section>

      {/* How it Works - 3-step guide for Workers */}
      <section>
        <button
          onClick={() => toggleSection('howItWorks')}
          className="w-full flex items-center justify-between text-xl sm:text-2xl font-bold text-white mb-6 hover:text-gold-900 transition-colors"
        >
          <span className="flex items-center gap-2">⚙️ {t('how_it_works') || 'How it Works'}</span>
          {expandedSections.howItWorks ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
        {expandedSections.howItWorks && (
          <div className="glass-card border-blue-500/30 bg-blue-500/10 p-4 sm:p-6 rounded-xl">
            <p className="text-sm sm:text-base text-gray-300 mb-6">
              {t('how_it_works_desc') || 'GSTD Platform connects Workers with computational tasks in a decentralized network. Here\'s how Workers participate:'}
            </p>
            <div className="space-y-4">
              <div className="glass-card border-blue-500/20 bg-blue-500/5 p-4 rounded-lg">
                <div className="flex items-start gap-3">
                  <span className="bg-blue-500/30 text-blue-400 border border-blue-500/50 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">1</span>
                  <div>
                    <h4 className="font-bold text-white mb-1">{t('step_1_register') || 'Register Your Device'}</h4>
                    <p className="text-sm text-gray-300">
                      {t('step_1_register_desc') || 'Connect your device to the GSTD network. Your device becomes a Worker node that can process tasks.'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="glass-card border-blue-500/20 bg-blue-500/5 p-4 rounded-lg">
                <div className="flex items-start gap-3">
                  <span className="bg-blue-500/30 text-blue-400 border border-blue-500/50 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">2</span>
                  <div>
                    <h4 className="font-bold text-white mb-1">{t('step_2_execute') || 'Execute Tasks'}</h4>
                    <p className="text-sm text-gray-300">
                      {t('step_2_execute_desc') || 'Receive and execute computational tasks (AI inference, validation, etc.). Tasks are automatically assigned based on your device capabilities.'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="glass-card border-blue-500/20 bg-blue-500/5 p-4 rounded-lg">
                <div className="flex items-start gap-3">
                  <span className="bg-blue-500/30 text-blue-400 border border-blue-500/50 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">3</span>
                  <div>
                    <h4 className="font-bold text-white mb-1">{t('step_3_earn') || 'Earn Labor Compensation'}</h4>
                    <p className="text-sm text-gray-300">
                      {t('step_3_earn_desc') || 'Get paid in TON for successfully completed tasks. Labor compensation is automatically distributed via smart contracts.'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Business Use Cases */}
      <section>
        <button
          onClick={() => toggleSection('useCases')}
          className="w-full flex items-center justify-between text-xl sm:text-2xl font-bold text-white mb-6 hover:text-gold-900 transition-colors"
        >
          <span className="flex items-center gap-2">💼 {t('business_use_cases') || 'Business Use Cases'}</span>
          {expandedSections.useCases ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
        {expandedSections.useCases && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
            <div className="glass-card p-4 sm:p-6 rounded-xl">
              <div className="text-3xl mb-3">🤖</div>
              <h3 className="font-bold text-lg text-white mb-2">{t('ai_verification') || 'AI Verification'}</h3>
              <p className="text-sm text-gray-300">
                {t('ai_verification_desc') || 'Distribute AI model inference across a decentralized network. Perfect for content moderation, image classification, and NLP tasks.'}
              </p>
            </div>
            <div className="glass-card p-4 sm:p-6 rounded-xl">
              <div className="text-3xl mb-3">🏛️</div>
              <h3 className="font-bold text-lg text-white mb-2">{t('govtech') || 'GovTech'}</h3>
              <p className="text-sm text-gray-300">
                {t('govtech_desc') || 'Government and public sector applications: document verification, citizen services automation, and transparent governance processes.'}
              </p>
            </div>
            <div className="glass-card p-4 sm:p-6 rounded-xl">
              <div className="text-3xl mb-3">🌐</div>
              <h3 className="font-bold text-lg text-white mb-2">{t('iot') || 'IoT & Edge Computing'}</h3>
              <p className="text-sm text-gray-300">
                {t('iot_desc') || 'Process data from IoT devices at the edge. Real-time sensor data analysis, smart city applications, and distributed monitoring.'}
              </p>
            </div>
          </div>
        )}
      </section>

      {/* GSTD Utility */}
      <section>
        <button
          onClick={() => toggleSection('gstd')}
          className="w-full flex items-center justify-between text-xl sm:text-2xl font-bold text-white mb-6 hover:text-gold-900 transition-colors"
        >
          <span className="flex items-center gap-2">💎 {t('gstd_utility') || 'GSTD Utility'}</span>
          {expandedSections.gstd ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
        {expandedSections.gstd && (
          <div className="glass-card border-purple-500/30 bg-purple-500/10 p-4 sm:p-6 rounded-xl">
            <p className="text-base sm:text-lg text-gray-300 mb-4 leading-relaxed">
              <strong className="text-white">{t('gstd_utility_title') || 'GSTD (Guaranteed Service Time Depth)'}</strong> {t('gstd_utility_desc') || 'is a technical parameter that measures the certainty depth of computational results in the network.'}
            </p>
            <div className="space-y-3 mt-4">
              <div className="glass-card border-purple-500/20 bg-purple-500/5 p-4 rounded-lg">
                <h4 className="font-semibold text-white mb-2">{t('what_is_gstd') || 'What is GSTD?'}</h4>
                <p className="text-sm text-gray-300">
                  {t('what_is_gstd_desc') || 'GSTD represents the guaranteed level of service quality and result validation. Higher GSTD means more validation layers and greater certainty in computational outputs.'}
                </p>
              </div>
              <div className="glass-card border-purple-500/20 bg-purple-500/5 p-4 rounded-lg">
                <h4 className="font-semibold text-white mb-2">{t('how_gstd_works') || 'How GSTD Works'}</h4>
                <p className="text-sm text-gray-300">
                  {t('how_gstd_works_desc') || 'When you create a task, you specify a minimum GSTD requirement. The network ensures your task is validated by multiple Workers to meet this certainty depth. Higher GSTD requirements provide more reliable results but may take longer and cost more.'}
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Contact & Support */}
      <section className="mt-8">
        <h2 className="text-xl sm:text-2xl font-bold text-white mb-6 flex items-center gap-2">
          📞 {t('help_contact') || 'Contact & Support'}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <a
            href="https://t.me/goldstandardcoin"
            target="_blank"
            rel="noopener noreferrer"
            className="glass-card border-blue-500/30 bg-blue-500/10 p-6 rounded-xl hover:bg-blue-500/20 transition-all group"
          >
            <div className="text-3xl mb-3">💬</div>
            <h3 className="font-bold text-lg text-white mb-2 group-hover:text-blue-400 transition-colors">Telegram</h3>
            <p className="text-sm text-gray-300">@goldstandardcoin</p>
            <p className="text-xs text-gray-500 mt-2">Community chat & support</p>
          </a>
          <a
            href="https://twitter.com/gstdtoken"
            target="_blank"
            rel="noopener noreferrer"
            className="glass-card border-gray-500/30 bg-gray-500/10 p-6 rounded-xl hover:bg-gray-500/20 transition-all group"
          >
            <div className="text-3xl mb-3">𝕏</div>
            <h3 className="font-bold text-lg text-white mb-2 group-hover:text-gray-300 transition-colors">X (Twitter)</h3>
            <p className="text-sm text-gray-300">@gstdtoken</p>
            <p className="text-xs text-gray-500 mt-2">News & announcements</p>
          </a>
          <a
            href="https://github.com/gstdcoin"
            target="_blank"
            rel="noopener noreferrer"
            className="glass-card border-violet-500/30 bg-violet-500/10 p-6 rounded-xl hover:bg-violet-500/20 transition-all group"
          >
            <div className="text-3xl mb-3">🐙</div>
            <h3 className="font-bold text-lg text-white mb-2 group-hover:text-violet-400 transition-colors">GitHub</h3>
            <p className="text-sm text-gray-300">@gstdcoin</p>
            <p className="text-xs text-gray-500 mt-2">SDKs, agents & documentation</p>
          </a>
        </div>
        <div className="mt-6 p-4 glass-card border-emerald-500/30 bg-emerald-500/10 rounded-xl">
          <p className="text-sm text-gray-300">
            <span className="font-bold text-emerald-400">Official Website:</span>{' '}
            <a href="https://gstdtoken.com" target="_blank" rel="noopener noreferrer" className="text-emerald-300 hover:underline">
              gstdtoken.com
            </a>
          </p>
        </div>
      </section>
    </div>
  );
}

