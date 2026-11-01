import Link from 'next/link';
import { useTranslation } from 'next-i18next';
interface SmartTaskWidgetProps { onTaskCreated?: () => void; }
/** Use the working chat flow; never prepare a transfer through retired task APIs. */
export default function SmartTaskWidget(_props: SmartTaskWidgetProps) {
    const { i18n }=useTranslation('common');
    const ru=i18n.language?.startsWith('ru');
    return <section className="glass-panel p-6 rounded-xl space-y-3">
        <h3 className="text-lg font-semibold">{ru?'Запрос к ИИ-сети':'Ask the AI network'}</h3>
        <p className="text-sm text-gray-400">{ru
            ?'Выберите доступную модель в чате. Для платной работы стоимость показывается до отправки; баланс резервируется, а при сбое возвращается.'
            :'Choose an available model in chat. Paid work shows its price before sending, reserves your balance and refunds failed execution.'}</p>
        <Link href="/chat" className="inline-block rounded-lg bg-purple-600 px-4 py-2">{ru?'Открыть чат':'Open chat'}</Link>
        <a className="ml-4 text-sm underline" href="https://gstdtoken.com/developers">{ru?'API оплачиваемых задач':'Funded task API'}</a>
    </section>;
}
