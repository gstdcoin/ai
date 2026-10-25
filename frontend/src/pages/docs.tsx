import Head from 'next/head';
import Link from 'next/link';
import { GetStaticProps } from 'next';
import { useRouter } from 'next/router';
import { getCommonStaticProps } from '../lib/i18n-static-props';

const COPY = {
  en: {
    title: 'Documentation',
    intro: 'GSTD is an early-stage network for AI inference on open models. Node operators serve requests and are paid in GSTD on TON. This page only describes what exists today.',
    sections: [
      {
        h: 'How a request flows',
        p: [
          'A client sends a chat request to the platform API.',
          'The platform picks an online node that supports the requested model and forwards the request.',
          'The node runs the model locally (Ollama) and returns the answer. If no node is online, the request fails with a clear error.',
        ],
      },
      {
        h: 'Running a node',
        p: [
          'Install the open-source node with Docker or the install script. Both are listed on the Nodes page.',
          'A node is identified by the TON wallet address you configure.',
          'Rewards are paid for completed and accepted tasks only and are not guaranteed.',
        ],
      },
      {
        h: 'Public API',
        p: [
          'GET /api/v1/health — service status.',
          'GET /api/v1/network/stats — nodes, tasks and price.',
          'GET /api/v1/nodes/list — registered nodes and whether they are online.',
        ],
      },
      {
        h: 'What is not available yet',
        p: [
          'Fine-tuning is disabled until isolated worker sandboxing is ready.',
          'There are no fixed earning rates; the network has not processed paid tasks yet.',
        ],
      },
    ],
    links: 'Links',
    items: [
      ['Nodes', '/nodes'],
      ['Network statistics', '/stats'],
      ['Source code (GitHub)', 'https://github.com/gstdcoin'],
      ['Telegram channel', 'https://t.me/gstdtoken'],
      ['Main site', 'https://gstdtoken.com'],
    ],
  },
  ru: {
    title: 'Документация',
    intro: 'GSTD — сеть для ИИ-инференса на открытых моделях на раннем этапе. Операторы нод обрабатывают запросы и получают оплату в GSTD на TON. Здесь описано только то, что существует сегодня.',
    sections: [
      {
        h: 'Как проходит запрос',
        p: [
          'Клиент отправляет чат-запрос в API платформы.',
          'Платформа выбирает онлайн-ноду, поддерживающую нужную модель, и пересылает запрос.',
          'Нода запускает модель локально (Ollama) и возвращает ответ. Если нод онлайн нет, запрос завершается понятной ошибкой.',
        ],
      },
      {
        h: 'Запуск ноды',
        p: [
          'Установите ноду с открытым кодом через Docker или скрипт установки. Оба способа есть на странице «Ноды».',
          'Нода определяется адресом кошелька TON, который вы настроили.',
          'Вознаграждение платится только за выполненные и принятые задания и не гарантируется.',
        ],
      },
      {
        h: 'Публичный API',
        p: [
          'GET /api/v1/health — состояние сервиса.',
          'GET /api/v1/network/stats — ноды, задания и цена.',
          'GET /api/v1/nodes/list — зарегистрированные ноды и их статус.',
        ],
      },
      {
        h: 'Чего пока нет',
        p: [
          'Дообучение отключено, пока не будет готова изоляция воркеров.',
          'Фиксированных ставок вознаграждения нет; платных заданий сеть пока не обработала.',
        ],
      },
    ],
    links: 'Ссылки',
    items: [
      ['Ноды', '/nodes'],
      ['Статистика сети', '/stats'],
      ['Исходный код (GitHub)', 'https://github.com/gstdcoin'],
      ['Канал в Telegram', 'https://t.me/gstdtoken'],
      ['Основной сайт', 'https://gstdtoken.com'],
    ],
  },
} as const;

export default function Docs() {
  const { locale } = useRouter();
  const c = locale === 'ru' ? COPY.ru : COPY.en;

  return (
    <div className="min-h-screen bg-[#030014] text-white">
      <Head>
        <title>{c.title} — GSTD</title>
      </Head>
      <main className="max-w-3xl mx-auto px-6 pt-16 pb-24">
        <h1 className="text-4xl font-black mb-4">{c.title}</h1>
        <p className="text-gray-400 leading-relaxed mb-10">{c.intro}</p>

        {c.sections.map((s) => (
          <section key={s.h} className="mb-8">
            <h2 className="text-xl font-bold mb-3">{s.h}</h2>
            <ul className="space-y-2 text-gray-300 text-sm leading-relaxed list-disc pl-5">
              {s.p.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        ))}

        <section>
          <h2 className="text-xl font-bold mb-3">{c.links}</h2>
          <ul className="space-y-2 text-sm">
            {c.items.map(([label, href]) => (
              <li key={href}>
                {href.startsWith('/') ? (
                  <Link href={href} className="text-cyan-300 hover:text-cyan-200">{label}</Link>
                ) : (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="text-cyan-300 hover:text-cyan-200">{label}</a>
                )}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: await getCommonStaticProps(locale),
});
