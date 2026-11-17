import { useEffect, useState, type FormEvent } from 'react';
import type { GetStaticProps } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { getCommonStaticProps } from '../lib/i18n-static-props';

const messages = {
    en: {
        title: 'Verified GPU offers', gpu: 'GPU model', vram: 'Minimum VRAM (MiB)', model: 'Exact inference model',
        search: 'Filter offers', loading: 'Loading offers…', empty: 'No verified offers match these filters.',
        error: 'Offer data is unavailable. Retry in a moment.', limits: 'Request limits',
        tokens: 'output tokens', bytes: 'input bytes', price: 'Total per request',
        note: 'Prices include compute, protocol and reserve shares. The final GSTD amount is fixed in the request quote.',
        verified: 'Hardware checked', operator: 'Manage your offers',
    },
    ru: {
        title: 'Предложения проверенных GPU', gpu: 'Модель GPU', vram: 'Минимум VRAM (МиБ)', model: 'Точная модель инференса',
        search: 'Показать предложения', loading: 'Загружаем предложения…', empty: 'По этим фильтрам нет проверенных предложений.',
        error: 'Каталог недоступен. Повторите запрос позже.', limits: 'Лимиты запроса',
        tokens: 'выходных токенов', bytes: 'байт на входе', price: 'Полная цена за запрос',
        note: 'В цену входят доли исполнителя, протокола и резерва. Итоговая сумма в GSTD фиксируется в котировке запроса.',
        verified: 'Оборудование проверено', operator: 'Управление предложениями',
    },
};

type Offer = {
    node_id: string; model: string; gpu: string; vram_mib: number; hardware_checked_at: number;
    max_tokens: number; max_input_bytes: number; price_gstd: string; price_usd: string;
};

export default function HostOffers() {
    const { locale } = useRouter();
    const t = messages[locale === 'ru' ? 'ru' : 'en'];
    const [query, setQuery] = useState({ params: '', revision: 0 });
    const [offers, setOffers] = useState<Offer[] | null>(null);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        const controller = new AbortController();
        setOffers(null);
        setFailed(false);
        fetch('/api/v1/economics/host-catalog' + query.params, { signal: controller.signal })
            .then(async response => {
                if (!response.ok) throw new Error('host_catalog_unavailable');
                const body = await response.json();
                if (!controller.signal.aborted) setOffers(body.offers);
            })
            .catch(() => { if (!controller.signal.aborted) setFailed(true); });
        return () => controller.abort();
    }, [query]);

    function search(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const params = new URLSearchParams();
        for (const [key, value] of new FormData(event.currentTarget)) {
            const filter = String(value).trim();
            if (filter) params.set(key, filter);
        }
        setQuery(current => ({ params: '?' + params.toString(), revision: current.revision + 1 }));
    }

    const input = 'mt-1 block w-full rounded border border-white/20 bg-black/30 p-2';
    return <main className="mx-auto max-w-4xl space-y-6 px-5 py-12 text-white">
        <h1 className="text-3xl font-semibold">{t.title}</h1>
        <p>{t.note}</p>
        <form onSubmit={search} className="grid items-end gap-3 sm:grid-cols-3">
            <label>{t.gpu}<input className={input} name="gpu" maxLength={80} /></label>
            <label>{t.vram}<input className={input} name="min_vram_mib" type="number" min={1} max={2097152} step={1} /></label>
            <label>{t.model}<input className={input} name="model" maxLength={160} /></label>
            <button className="rounded bg-violet-600 px-4 py-2 sm:justify-self-start">{t.search}</button>
        </form>
        <div aria-live="polite" className="space-y-3">
            {failed ? <p>{t.error}</p> : offers === null ? <p>{t.loading}</p> : !offers.length ? <p>{t.empty}</p> : offers.map(offer =>
                <article key={offer.node_id + '/' + offer.model} className="space-y-2 rounded-xl border border-white/20 p-4">
                    <h2 className="text-xl font-semibold">{offer.model}</h2>
                    <p>{offer.gpu} · {offer.vram_mib.toLocaleString(locale)} MiB</p>
                    <p>{t.price} · {offer.price_gstd} GSTD · {offer.price_usd} USD</p>
                    <p>{t.limits} · {offer.max_tokens} {t.tokens} · {offer.max_input_bytes} {t.bytes}</p>
                    <p className="text-sm text-gray-400">{t.verified} · {new Date(offer.hardware_checked_at).toLocaleDateString(locale)}</p>
                </article>)}
        </div>
        <Link href="/node-economics" className="underline">{t.operator}</Link>
    </main>;
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({ props: await getCommonStaticProps(locale) });
