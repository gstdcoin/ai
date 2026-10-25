/**
 * Registers the Telegram webhook, localized command menus and bot descriptions.
 * Usage (token is read from the environment, never from a file):
 *   $env:TELEGRAM_BOT_TOKEN='<new token>'; node scripts/set-telegram-webhook.mjs
 */
import { createHash } from 'node:crypto';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) { console.error('Set TELEGRAM_BOT_TOKEN in the environment'); process.exit(1); }
const url = process.env.WEBHOOK_URL || 'https://app.gstdtoken.com/api/v1/telegram/webhook';
const tma = process.env.TMA_URL || 'https://app.gstdtoken.com/tma';
const secret = createHash('sha256').update(`gstd-tg-webhook:${token}`).digest('hex');

const call = async (method, body) => {
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const j = await r.json();
    console.log(method, body.language_code || '', j.ok ? 'ok' : j);
};

const L = {
    en: { short: 'Decentralized AI compute: ask AI, run a node, earn GSTD.', about: 'GSTD is a decentralized network for AI compute. Ask the AI, link a TON wallet and run a node on your phone or PC to earn GSTD for accepted tasks.',
        cmds: ['Main menu', 'Run a node and earn', 'Your nodes', 'Link wallet', 'Balance and claim', 'Live network stats', 'Invite friends', 'Language', 'Reset AI chat', 'Help'] },
    ru: { short: 'Децентрализованные ИИ-вычисления: спрашивайте ИИ, запускайте ноду, зарабатывайте GSTD.', about: 'GSTD — децентрализованная сеть ИИ-вычислений. Задавайте вопросы ИИ, привяжите кошелёк TON и запустите ноду на телефоне или ПК, чтобы получать GSTD за принятые задачи.',
        cmds: ['Главное меню', 'Запустить ноду и заработать', 'Ваши ноды', 'Привязать кошелёк', 'Баланс и награда', 'Статистика сети', 'Пригласить друзей', 'Язык', 'Сбросить диалог с ИИ', 'Помощь'] },
    uk: { short: 'Децентралізовані ШІ-обчислення: питайте ШІ, запускайте ноду, заробляйте GSTD.', about: 'GSTD — децентралізована мережа ШІ-обчислень. Ставте запитання ШІ, прив’яжіть гаманець TON і запустіть ноду на телефоні чи ПК, щоб отримувати GSTD за прийняті завдання.',
        cmds: ['Головне меню', 'Запустити ноду й заробити', 'Ваші ноди', 'Прив’язати гаманець', 'Баланс і нагорода', 'Статистика мережі', 'Запросити друзів', 'Мова', 'Скинути діалог із ШІ', 'Допомога'] },
    es: { short: 'Cómputo de IA descentralizado: pregunta a la IA, ejecuta un nodo, gana GSTD.', about: 'GSTD es una red descentralizada de cómputo de IA. Pregunta a la IA, vincula una billetera TON y ejecuta un nodo en tu móvil o PC para ganar GSTD por tareas aceptadas.',
        cmds: ['Menú principal', 'Ejecutar un nodo y ganar', 'Tus nodos', 'Vincular billetera', 'Saldo y reclamo', 'Estadísticas de la red', 'Invitar amigos', 'Idioma', 'Reiniciar chat IA', 'Ayuda'] },
    tr: { short: 'Merkeziyetsiz YZ hesaplaması: yapay zekâya sor, düğüm çalıştır, GSTD kazan.', about: 'GSTD merkeziyetsiz bir YZ hesaplama ağıdır. Yapay zekâya sor, TON cüzdanı bağla ve telefonunda ya da PC’nde düğüm çalıştırarak kabul edilen görevler için GSTD kazan.',
        cmds: ['Ana menü', 'Düğüm çalıştır ve kazan', 'Düğümlerin', 'Cüzdan bağla', 'Bakiye ve ödül', 'Ağ istatistikleri', 'Arkadaşlarını davet et', 'Dil', 'YZ sohbetini sıfırla', 'Yardım'] },
    zh: { short: '去中心化 AI 算力：向 AI 提问、运行节点、赚取 GSTD。', about: 'GSTD 是去中心化 AI 算力网络。向 AI 提问，绑定 TON 钱包，并在手机或电脑上运行节点，为被接受的任务赚取 GSTD。',
        cmds: ['主菜单', '运行节点并赚取', '你的节点', '绑定钱包', '余额与领取', '网络统计', '邀请好友', '语言', '重置 AI 对话', '帮助'] },
};
const NAMES = ['menu', 'earn', 'node', 'wallet', 'balance', 'network', 'invite', 'lang', 'new', 'help'];

await call('setWebhook', { url, secret_token: secret, allowed_updates: ['message', 'callback_query', 'inline_query'], drop_pending_updates: true });
for (const [code, d] of Object.entries(L)) {
    const lc = code === 'en' ? {} : { language_code: code };
    await call('setMyCommands', { ...lc, commands: NAMES.map((command, i) => ({ command, description: d.cmds[i] })) });
    await call('setMyShortDescription', { ...lc, short_description: d.short });
    await call('setMyDescription', { ...lc, description: d.about });
}
await call('setChatMenuButton', { menu_button: { type: 'web_app', text: 'GSTD', web_app: { url: tma } } });
