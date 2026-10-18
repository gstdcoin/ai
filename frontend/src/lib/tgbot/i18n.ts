export const LANGS = ['en', 'ru', 'uk', 'es', 'tr', 'zh'] as const;
export type Lang = typeof LANGS[number];

export const LANG_NAMES: Record<Lang, string> = {
    en: '🇬🇧 English', ru: '🇷🇺 Русский', uk: '🇺🇦 Українська',
    es: '🇪🇸 Español', tr: '🇹🇷 Türkçe', zh: '🇨🇳 中文',
};

type Dict = Record<string, string>;

const en: Dict = {
    welcome: '🐝 <b>GSTD — decentralized AI compute</b>\n\nHi, {name}! Ask the AI, or turn your phone/PC into a node and earn GSTD for accepted work.\n\n{wallet}',
    wallet_none: '🔗 Wallet not linked — send your TON address.',
    wallet_linked: '🔗 Wallet: <code>{wallet}</code>',
    menu_title: '🐝 <b>Main menu</b>',
    btn_ai: '🤖 AI chat', btn_earn: '🖥 Earn', btn_wallet: '💎 Wallet', btn_invite: '👥 Invite',
    btn_network: '🌐 Network', btn_settings: '⚙️ Language', btn_help: '❓ Help', btn_claim: '🎁 Claim',
    btn_node: '🖥 My nodes', btn_menu: '⬅️ Menu', btn_app: '📱 Open app',
    wallet_prompt: '🔗 <b>Link your wallet</b>\n\nSend your TON address (starts with EQ or UQ). You need 0 GSTD to start.\n\nNo wallet? <a href="https://tonkeeper.com">Tonkeeper</a> · <a href="https://mytonwallet.io">MyTonWallet</a>',
    wallet_ok: '✅ <b>Wallet linked</b>\n<code>{wallet}</code>\n\nNext: run a node to earn → /earn',
    wallet_fail: '❌ Could not link the wallet right now. Try again in a minute.',
    balance: '💎 <b>Balance</b>\n\n{wallet}\n💰 <b>{balance} GSTD</b>\n⏳ Claimable: <b>{pending} GSTD</b>',
    earn: '🖥 <b>Earn GSTD with your compute</b>\n\n{step1}\n2️⃣ Run a node with one command:\n<code>{cmd}</code>\n3️⃣ Track it here: /node\n\n<i>Rewards are paid only for completed, accepted tasks and depend on network demand. No guaranteed rates.</i>',
    step_wallet_ok: '1️⃣ ✅ Wallet linked', step_wallet_todo: '1️⃣ /wallet — link your wallet',
    need_wallet: '🔗 Link your TON wallet first → /wallet',
    node_none: '🖥 <b>No node found for your wallet.</b>\nMake sure GSTD_WALLET_ADDRESS on the node equals your linked wallet.\n\nStart one → /earn',
    node_list: '🖥 <b>Your nodes</b> ({count})\n\n{lines}\n\n💰 Claimable: <b>{pending} GSTD</b>',
    node_line: '{dot} <b>{name}</b> v{version}\n   tasks: {tasks} · earned: {earned} GSTD',
    claim_ok: '✅ Claimed <b>{amount} GSTD</b> to your balance.', claim_none: 'Nothing to claim yet.',
    error: '❌ Something went wrong. Try again later.',
    network: '🌐 <b>Live network</b>\n\n🟢 Nodes online: <b>{online}</b> / {total}\n✅ Tasks completed: <b>{tasks}</b>\n📥 Queue: <b>{queue}</b>\n💸 GSTD paid out: <b>{paid}</b>\n\n<i>Numbers come straight from the platform registry.</i>',
    invite: '👥 <b>Invite friends</b>\n\nYour link:\n{link}\n\nInvited: <b>{count}</b>\nA referral reward is paid once the friend links a wallet.',
    invite_share: 'Join GSTD — decentralized AI compute. Ask AI and earn by sharing your device:',
    ai_hint: '🤖 Just send any question — the GSTD node network will answer.',
    ai_offline: '🐝 No nodes are online right now, so I cannot answer. You can fix that: run a node → /earn',
    ai_limit: '⏳ Daily AI limit reached ({limit} messages). Run a node to support the network → /earn',
    ai_slow: '⏳ Please wait a few seconds between messages.',
    ai_empty: '🐝 No response from the network. Try again.',
    reset: '🔄 Conversation reset.',
    lang_pick: '🌍 Choose language:', lang_set: '✅ Language set.',
    help: '❓ <b>Commands</b>\n\n/menu — main menu\n/earn — run a node\n/node — your nodes\n/wallet — link wallet\n/balance — balance & claim\n/network — live stats\n/invite — referral link\n/lang — language\n/new — reset AI chat\n\nAny other text goes to the AI.',
};

const ru: Dict = {
    welcome: '🐝 <b>GSTD — децентрализованные ИИ-вычисления</b>\n\nПривет, {name}! Задавайте вопросы ИИ или превратите телефон/ПК в ноду и получайте GSTD за принятую работу.\n\n{wallet}',
    wallet_none: '🔗 Кошелёк не привязан — отправьте адрес TON.',
    wallet_linked: '🔗 Кошелёк: <code>{wallet}</code>',
    menu_title: '🐝 <b>Главное меню</b>',
    btn_ai: '🤖 ИИ-чат', btn_earn: '🖥 Заработок', btn_wallet: '💎 Кошелёк', btn_invite: '👥 Пригласить',
    btn_network: '🌐 Сеть', btn_settings: '⚙️ Язык', btn_help: '❓ Помощь', btn_claim: '🎁 Забрать',
    btn_node: '🖥 Мои ноды', btn_menu: '⬅️ Меню', btn_app: '📱 Открыть приложение',
    wallet_prompt: '🔗 <b>Привяжите кошелёк</b>\n\nОтправьте адрес TON (начинается с EQ или UQ). Для старта GSTD не нужны.\n\nНет кошелька? <a href="https://tonkeeper.com">Tonkeeper</a> · <a href="https://mytonwallet.io">MyTonWallet</a>',
    wallet_ok: '✅ <b>Кошелёк привязан</b>\n<code>{wallet}</code>\n\nДалее: запустите ноду → /earn',
    wallet_fail: '❌ Не удалось привязать кошелёк. Попробуйте через минуту.',
    balance: '💎 <b>Баланс</b>\n\n{wallet}\n💰 <b>{balance} GSTD</b>\n⏳ К получению: <b>{pending} GSTD</b>',
    earn: '🖥 <b>Зарабатывайте GSTD вычислениями</b>\n\n{step1}\n2️⃣ Запустите ноду одной командой:\n<code>{cmd}</code>\n3️⃣ Следите здесь: /node\n\n<i>Награда платится только за выполненные и принятые задачи и зависит от спроса в сети. Гарантированных ставок нет.</i>',
    step_wallet_ok: '1️⃣ ✅ Кошелёк привязан', step_wallet_todo: '1️⃣ /wallet — привяжите кошелёк',
    need_wallet: '🔗 Сначала привяжите кошелёк TON → /wallet',
    node_none: '🖥 <b>Для вашего кошелька нод не найдено.</b>\nПроверьте, что GSTD_WALLET_ADDRESS на ноде совпадает с привязанным кошельком.\n\nЗапустить → /earn',
    node_list: '🖥 <b>Ваши ноды</b> ({count})\n\n{lines}\n\n💰 К получению: <b>{pending} GSTD</b>',
    node_line: '{dot} <b>{name}</b> v{version}\n   задач: {tasks} · заработано: {earned} GSTD',
    claim_ok: '✅ На баланс зачислено <b>{amount} GSTD</b>.', claim_none: 'Пока нечего забирать.',
    error: '❌ Что-то пошло не так. Попробуйте позже.',
    network: '🌐 <b>Сеть сейчас</b>\n\n🟢 Нод онлайн: <b>{online}</b> / {total}\n✅ Задач выполнено: <b>{tasks}</b>\n📥 В очереди: <b>{queue}</b>\n💸 Выплачено GSTD: <b>{paid}</b>\n\n<i>Цифры берутся напрямую из реестра платформы.</i>',
    invite: '👥 <b>Пригласите друзей</b>\n\nВаша ссылка:\n{link}\n\nПриглашено: <b>{count}</b>\nНаграда за реферала начисляется, когда друг привяжет кошелёк.',
    invite_share: 'Присоединяйся к GSTD — децентрализованные ИИ-вычисления. Спрашивай ИИ и зарабатывай мощностью устройства:',
    ai_hint: '🤖 Просто отправьте вопрос — ответит сеть нод GSTD.',
    ai_offline: '🐝 Сейчас нет нод онлайн, ответить не могу. Это можно исправить: запустите ноду → /earn',
    ai_limit: '⏳ Дневной лимит ИИ исчерпан ({limit} сообщений). Запустите ноду и поддержите сеть → /earn',
    ai_slow: '⏳ Подождите пару секунд между сообщениями.',
    ai_empty: '🐝 Сеть не ответила. Попробуйте ещё раз.',
    reset: '🔄 Диалог сброшен.',
    lang_pick: '🌍 Выберите язык:', lang_set: '✅ Язык установлен.',
    help: '❓ <b>Команды</b>\n\n/menu — главное меню\n/earn — запустить ноду\n/node — ваши ноды\n/wallet — привязать кошелёк\n/balance — баланс и награда\n/network — статистика сети\n/invite — реферальная ссылка\n/lang — язык\n/new — сбросить диалог с ИИ\n\nЛюбой другой текст уходит ИИ.',
};

const uk: Dict = {
    welcome: '🐝 <b>GSTD — децентралізовані ШІ-обчислення</b>\n\nПривіт, {name}! Ставте запитання ШІ або перетворіть телефон/ПК на ноду й отримуйте GSTD за прийняту роботу.\n\n{wallet}',
    wallet_none: '🔗 Гаманець не прив’язано — надішліть адресу TON.',
    wallet_linked: '🔗 Гаманець: <code>{wallet}</code>',
    menu_title: '🐝 <b>Головне меню</b>',
    btn_ai: '🤖 ШІ-чат', btn_earn: '🖥 Заробіток', btn_wallet: '💎 Гаманець', btn_invite: '👥 Запросити',
    btn_network: '🌐 Мережа', btn_settings: '⚙️ Мова', btn_help: '❓ Допомога', btn_claim: '🎁 Забрати',
    btn_node: '🖥 Мої ноди', btn_menu: '⬅️ Меню', btn_app: '📱 Відкрити застосунок',
    wallet_prompt: '🔗 <b>Прив’яжіть гаманець</b>\n\nНадішліть адресу TON (починається з EQ або UQ). Для старту GSTD не потрібні.\n\nНемає гаманця? <a href="https://tonkeeper.com">Tonkeeper</a> · <a href="https://mytonwallet.io">MyTonWallet</a>',
    wallet_ok: '✅ <b>Гаманець прив’язано</b>\n<code>{wallet}</code>\n\nДалі: запустіть ноду → /earn',
    wallet_fail: '❌ Не вдалося прив’язати гаманець. Спробуйте за хвилину.',
    balance: '💎 <b>Баланс</b>\n\n{wallet}\n💰 <b>{balance} GSTD</b>\n⏳ До отримання: <b>{pending} GSTD</b>',
    earn: '🖥 <b>Заробляйте GSTD обчисленнями</b>\n\n{step1}\n2️⃣ Запустіть ноду однією командою:\n<code>{cmd}</code>\n3️⃣ Стежте тут: /node\n\n<i>Винагорода платиться лише за виконані та прийняті завдання й залежить від попиту в мережі. Гарантованих ставок немає.</i>',
    step_wallet_ok: '1️⃣ ✅ Гаманець прив’язано', step_wallet_todo: '1️⃣ /wallet — прив’яжіть гаманець',
    need_wallet: '🔗 Спершу прив’яжіть гаманець TON → /wallet',
    node_none: '🖥 <b>Для вашого гаманця нод не знайдено.</b>\nПеревірте, що GSTD_WALLET_ADDRESS на ноді збігається з прив’язаним гаманцем.\n\nЗапустити → /earn',
    node_list: '🖥 <b>Ваші ноди</b> ({count})\n\n{lines}\n\n💰 До отримання: <b>{pending} GSTD</b>',
    node_line: '{dot} <b>{name}</b> v{version}\n   завдань: {tasks} · зароблено: {earned} GSTD',
    claim_ok: '✅ На баланс зараховано <b>{amount} GSTD</b>.', claim_none: 'Поки нічого забирати.',
    error: '❌ Щось пішло не так. Спробуйте пізніше.',
    network: '🌐 <b>Мережа зараз</b>\n\n🟢 Нод онлайн: <b>{online}</b> / {total}\n✅ Завдань виконано: <b>{tasks}</b>\n📥 У черзі: <b>{queue}</b>\n💸 Виплачено GSTD: <b>{paid}</b>\n\n<i>Цифри беруться напряму з реєстру платформи.</i>',
    invite: '👥 <b>Запросіть друзів</b>\n\nВаше посилання:\n{link}\n\nЗапрошено: <b>{count}</b>\nНагорода за реферала нараховується, коли друг прив’яже гаманець.',
    invite_share: 'Приєднуйся до GSTD — децентралізовані ШІ-обчислення. Питай ШІ та заробляй потужністю пристрою:',
    ai_hint: '🤖 Просто надішліть запитання — відповість мережа нод GSTD.',
    ai_offline: '🐝 Зараз немає нод онлайн, відповісти не можу. Це можна виправити: запустіть ноду → /earn',
    ai_limit: '⏳ Денний ліміт ШІ вичерпано ({limit} повідомлень). Запустіть ноду й підтримайте мережу → /earn',
    ai_slow: '⏳ Зачекайте кілька секунд між повідомленнями.',
    ai_empty: '🐝 Мережа не відповіла. Спробуйте ще раз.',
    reset: '🔄 Діалог скинуто.',
    lang_pick: '🌍 Оберіть мову:', lang_set: '✅ Мову встановлено.',
    help: '❓ <b>Команди</b>\n\n/menu — головне меню\n/earn — запустити ноду\n/node — ваші ноди\n/wallet — прив’язати гаманець\n/balance — баланс і нагорода\n/network — статистика мережі\n/invite — реферальне посилання\n/lang — мова\n/new — скинути діалог із ШІ\n\nБудь-який інший текст іде ШІ.',
};

const es: Dict = {
    welcome: '🐝 <b>GSTD — cómputo de IA descentralizado</b>\n\n¡Hola, {name}! Pregunta a la IA o convierte tu móvil/PC en un nodo y gana GSTD por el trabajo aceptado.\n\n{wallet}',
    wallet_none: '🔗 Billetera no vinculada — envía tu dirección TON.',
    wallet_linked: '🔗 Billetera: <code>{wallet}</code>',
    menu_title: '🐝 <b>Menú principal</b>',
    btn_ai: '🤖 Chat IA', btn_earn: '🖥 Ganar', btn_wallet: '💎 Billetera', btn_invite: '👥 Invitar',
    btn_network: '🌐 Red', btn_settings: '⚙️ Idioma', btn_help: '❓ Ayuda', btn_claim: '🎁 Reclamar',
    btn_node: '🖥 Mis nodos', btn_menu: '⬅️ Menú', btn_app: '📱 Abrir app',
    wallet_prompt: '🔗 <b>Vincula tu billetera</b>\n\nEnvía tu dirección TON (empieza por EQ o UQ). No necesitas GSTD para empezar.\n\n¿Sin billetera? <a href="https://tonkeeper.com">Tonkeeper</a> · <a href="https://mytonwallet.io">MyTonWallet</a>',
    wallet_ok: '✅ <b>Billetera vinculada</b>\n<code>{wallet}</code>\n\nSiguiente: ejecuta un nodo → /earn',
    wallet_fail: '❌ No se pudo vincular la billetera. Inténtalo en un minuto.',
    balance: '💎 <b>Saldo</b>\n\n{wallet}\n💰 <b>{balance} GSTD</b>\n⏳ Reclamable: <b>{pending} GSTD</b>',
    earn: '🖥 <b>Gana GSTD con tu cómputo</b>\n\n{step1}\n2️⃣ Ejecuta un nodo con un comando:\n<code>{cmd}</code>\n3️⃣ Sigue aquí: /node\n\n<i>Las recompensas se pagan solo por tareas completadas y aceptadas y dependen de la demanda de la red. Sin tarifas garantizadas.</i>',
    step_wallet_ok: '1️⃣ ✅ Billetera vinculada', step_wallet_todo: '1️⃣ /wallet — vincula tu billetera',
    need_wallet: '🔗 Primero vincula tu billetera TON → /wallet',
    node_none: '🖥 <b>No hay nodos para tu billetera.</b>\nComprueba que GSTD_WALLET_ADDRESS en el nodo coincide con tu billetera vinculada.\n\nIniciar uno → /earn',
    node_list: '🖥 <b>Tus nodos</b> ({count})\n\n{lines}\n\n💰 Reclamable: <b>{pending} GSTD</b>',
    node_line: '{dot} <b>{name}</b> v{version}\n   tareas: {tasks} · ganado: {earned} GSTD',
    claim_ok: '✅ Se acreditaron <b>{amount} GSTD</b> a tu saldo.', claim_none: 'Aún no hay nada que reclamar.',
    error: '❌ Algo salió mal. Inténtalo más tarde.',
    network: '🌐 <b>Red en vivo</b>\n\n🟢 Nodos en línea: <b>{online}</b> / {total}\n✅ Tareas completadas: <b>{tasks}</b>\n📥 En cola: <b>{queue}</b>\n💸 GSTD pagado: <b>{paid}</b>\n\n<i>Las cifras vienen directamente del registro de la plataforma.</i>',
    invite: '👥 <b>Invita a tus amigos</b>\n\nTu enlace:\n{link}\n\nInvitados: <b>{count}</b>\nLa recompensa se paga cuando el amigo vincula una billetera.',
    invite_share: 'Únete a GSTD — cómputo de IA descentralizado. Pregunta a la IA y gana compartiendo tu dispositivo:',
    ai_hint: '🤖 Envía cualquier pregunta: la red de nodos GSTD responderá.',
    ai_offline: '🐝 No hay nodos en línea ahora, no puedo responder. Puedes arreglarlo: ejecuta un nodo → /earn',
    ai_limit: '⏳ Límite diario de IA alcanzado ({limit} mensajes). Ejecuta un nodo para apoyar la red → /earn',
    ai_slow: '⏳ Espera unos segundos entre mensajes.',
    ai_empty: '🐝 La red no respondió. Inténtalo de nuevo.',
    reset: '🔄 Conversación reiniciada.',
    lang_pick: '🌍 Elige idioma:', lang_set: '✅ Idioma establecido.',
    help: '❓ <b>Comandos</b>\n\n/menu — menú principal\n/earn — ejecutar un nodo\n/node — tus nodos\n/wallet — vincular billetera\n/balance — saldo y reclamo\n/network — estadísticas\n/invite — enlace de referido\n/lang — idioma\n/new — reiniciar chat IA\n\nCualquier otro texto va a la IA.',
};

const tr: Dict = {
    welcome: '🐝 <b>GSTD — merkeziyetsiz yapay zekâ hesaplaması</b>\n\nMerhaba {name}! Yapay zekâya soru sor ya da telefonunu/PC’ni düğüme çevirip kabul edilen işler için GSTD kazan.\n\n{wallet}',
    wallet_none: '🔗 Cüzdan bağlı değil — TON adresini gönder.',
    wallet_linked: '🔗 Cüzdan: <code>{wallet}</code>',
    menu_title: '🐝 <b>Ana menü</b>',
    btn_ai: '🤖 YZ sohbet', btn_earn: '🖥 Kazan', btn_wallet: '💎 Cüzdan', btn_invite: '👥 Davet et',
    btn_network: '🌐 Ağ', btn_settings: '⚙️ Dil', btn_help: '❓ Yardım', btn_claim: '🎁 Al',
    btn_node: '🖥 Düğümlerim', btn_menu: '⬅️ Menü', btn_app: '📱 Uygulamayı aç',
    wallet_prompt: '🔗 <b>Cüzdanını bağla</b>\n\nTON adresini gönder (EQ veya UQ ile başlar). Başlamak için GSTD gerekmez.\n\nCüzdanın yok mu? <a href="https://tonkeeper.com">Tonkeeper</a> · <a href="https://mytonwallet.io">MyTonWallet</a>',
    wallet_ok: '✅ <b>Cüzdan bağlandı</b>\n<code>{wallet}</code>\n\nSıradaki: düğüm çalıştır → /earn',
    wallet_fail: '❌ Cüzdan şu an bağlanamadı. Bir dakika sonra dene.',
    balance: '💎 <b>Bakiye</b>\n\n{wallet}\n💰 <b>{balance} GSTD</b>\n⏳ Alınabilir: <b>{pending} GSTD</b>',
    earn: '🖥 <b>İşlem gücünle GSTD kazan</b>\n\n{step1}\n2️⃣ Tek komutla düğüm çalıştır:\n<code>{cmd}</code>\n3️⃣ Buradan takip et: /node\n\n<i>Ödüller yalnızca tamamlanan ve kabul edilen görevler için verilir ve ağ talebine bağlıdır. Garanti edilen oran yoktur.</i>',
    step_wallet_ok: '1️⃣ ✅ Cüzdan bağlı', step_wallet_todo: '1️⃣ /wallet — cüzdanını bağla',
    need_wallet: '🔗 Önce TON cüzdanını bağla → /wallet',
    node_none: '🖥 <b>Cüzdanın için düğüm bulunamadı.</b>\nDüğümdeki GSTD_WALLET_ADDRESS değerinin bağlı cüzdanınla aynı olduğundan emin ol.\n\nBaşlat → /earn',
    node_list: '🖥 <b>Düğümlerin</b> ({count})\n\n{lines}\n\n💰 Alınabilir: <b>{pending} GSTD</b>',
    node_line: '{dot} <b>{name}</b> v{version}\n   görev: {tasks} · kazanılan: {earned} GSTD',
    claim_ok: '✅ Bakiyene <b>{amount} GSTD</b> eklendi.', claim_none: 'Henüz alınacak bir şey yok.',
    error: '❌ Bir şeyler ters gitti. Daha sonra dene.',
    network: '🌐 <b>Canlı ağ</b>\n\n🟢 Çevrimiçi düğüm: <b>{online}</b> / {total}\n✅ Tamamlanan görev: <b>{tasks}</b>\n📥 Kuyruk: <b>{queue}</b>\n💸 Ödenen GSTD: <b>{paid}</b>\n\n<i>Rakamlar doğrudan platform kaydından gelir.</i>',
    invite: '👥 <b>Arkadaşlarını davet et</b>\n\nBağlantın:\n{link}\n\nDavet edilen: <b>{count}</b>\nArkadaşın cüzdan bağlayınca referans ödülü verilir.',
    invite_share: 'GSTD’ye katıl — merkeziyetsiz yapay zekâ hesaplaması. Yapay zekâya sor, cihazını paylaşarak kazan:',
    ai_hint: '🤖 Bir soru gönder — GSTD düğüm ağı cevaplar.',
    ai_offline: '🐝 Şu an çevrimiçi düğüm yok, cevap veremiyorum. Sen düzeltebilirsin: düğüm çalıştır → /earn',
    ai_limit: '⏳ Günlük YZ limiti doldu ({limit} mesaj). Ağı desteklemek için düğüm çalıştır → /earn',
    ai_slow: '⏳ Mesajlar arasında birkaç saniye bekle.',
    ai_empty: '🐝 Ağdan cevap gelmedi. Tekrar dene.',
    reset: '🔄 Sohbet sıfırlandı.',
    lang_pick: '🌍 Dil seç:', lang_set: '✅ Dil ayarlandı.',
    help: '❓ <b>Komutlar</b>\n\n/menu — ana menü\n/earn — düğüm çalıştır\n/node — düğümlerin\n/wallet — cüzdan bağla\n/balance — bakiye ve ödül\n/network — ağ istatistikleri\n/invite — davet bağlantısı\n/lang — dil\n/new — YZ sohbetini sıfırla\n\nDiğer tüm metinler yapay zekâya gider.',
};

const zh: Dict = {
    welcome: '🐝 <b>GSTD — 去中心化 AI 算力网络</b>\n\n你好，{name}！向 AI 提问，或把手机/电脑变成节点，为被接受的任务赚取 GSTD。\n\n{wallet}',
    wallet_none: '🔗 未绑定钱包 — 请发送你的 TON 地址。',
    wallet_linked: '🔗 钱包：<code>{wallet}</code>',
    menu_title: '🐝 <b>主菜单</b>',
    btn_ai: '🤖 AI 聊天', btn_earn: '🖥 赚取', btn_wallet: '💎 钱包', btn_invite: '👥 邀请',
    btn_network: '🌐 网络', btn_settings: '⚙️ 语言', btn_help: '❓ 帮助', btn_claim: '🎁 领取',
    btn_node: '🖥 我的节点', btn_menu: '⬅️ 菜单', btn_app: '📱 打开应用',
    wallet_prompt: '🔗 <b>绑定钱包</b>\n\n发送你的 TON 地址（以 EQ 或 UQ 开头）。开始时无需持有 GSTD。\n\n还没有钱包？<a href="https://tonkeeper.com">Tonkeeper</a> · <a href="https://mytonwallet.io">MyTonWallet</a>',
    wallet_ok: '✅ <b>钱包已绑定</b>\n<code>{wallet}</code>\n\n下一步：运行节点 → /earn',
    wallet_fail: '❌ 暂时无法绑定钱包，请一分钟后重试。',
    balance: '💎 <b>余额</b>\n\n{wallet}\n💰 <b>{balance} GSTD</b>\n⏳ 可领取：<b>{pending} GSTD</b>',
    earn: '🖥 <b>用算力赚取 GSTD</b>\n\n{step1}\n2️⃣ 一条命令运行节点：\n<code>{cmd}</code>\n3️⃣ 在这里查看：/node\n\n<i>仅对已完成并被接受的任务支付奖励，取决于网络需求，不保证固定收益。</i>',
    step_wallet_ok: '1️⃣ ✅ 钱包已绑定', step_wallet_todo: '1️⃣ /wallet — 绑定钱包',
    need_wallet: '🔗 请先绑定 TON 钱包 → /wallet',
    node_none: '🖥 <b>未找到与你的钱包对应的节点。</b>\n请确认节点上的 GSTD_WALLET_ADDRESS 与已绑定钱包一致。\n\n启动节点 → /earn',
    node_list: '🖥 <b>你的节点</b>（{count}）\n\n{lines}\n\n💰 可领取：<b>{pending} GSTD</b>',
    node_line: '{dot} <b>{name}</b> v{version}\n   任务：{tasks} · 已赚：{earned} GSTD',
    claim_ok: '✅ 已将 <b>{amount} GSTD</b> 计入你的余额。', claim_none: '暂无可领取的奖励。',
    error: '❌ 出错了，请稍后再试。',
    network: '🌐 <b>实时网络</b>\n\n🟢 在线节点：<b>{online}</b> / {total}\n✅ 已完成任务：<b>{tasks}</b>\n📥 队列：<b>{queue}</b>\n💸 已支付 GSTD：<b>{paid}</b>\n\n<i>数据直接来自平台注册表。</i>',
    invite: '👥 <b>邀请好友</b>\n\n你的链接：\n{link}\n\n已邀请：<b>{count}</b>\n好友绑定钱包后发放推荐奖励。',
    invite_share: '加入 GSTD — 去中心化 AI 算力网络。向 AI 提问，并通过共享设备赚取收益：',
    ai_hint: '🤖 直接发送任何问题，GSTD 节点网络会回答。',
    ai_offline: '🐝 目前没有在线节点，无法回答。你可以改变这一点：运行节点 → /earn',
    ai_limit: '⏳ 今日 AI 额度已用完（{limit} 条）。运行节点支持网络 → /earn',
    ai_slow: '⏳ 请在两条消息之间等待几秒。',
    ai_empty: '🐝 网络没有响应，请重试。',
    reset: '🔄 对话已重置。',
    lang_pick: '🌍 选择语言：', lang_set: '✅ 语言已设置。',
    help: '❓ <b>命令</b>\n\n/menu — 主菜单\n/earn — 运行节点\n/node — 你的节点\n/wallet — 绑定钱包\n/balance — 余额与领取\n/network — 网络统计\n/invite — 邀请链接\n/lang — 语言\n/new — 重置 AI 对话\n\n其他文字将发送给 AI。',
};

export const DICTS: Record<Lang, Dict> = { en, ru, uk, es, tr, zh };

export function resolveLang(code?: string | null): Lang {
    const base = (code || '').toLowerCase().split('-')[0];
    if (base === 'be') return 'ru';
    return (LANGS as readonly string[]).includes(base) ? (base as Lang) : 'en';
}

export function t(lang: Lang, key: string, vars: Record<string, string | number> = {}): string {
    const tpl = DICTS[lang]?.[key] ?? en[key] ?? key;
    return tpl.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

export interface ParsedCommand { cmd: string; args: string }

// "/start@gstdaibot ref_123" -> { cmd: 'start', args: 'ref_123' }
export function parseCommand(text: string): ParsedCommand | null {
    const m = /^\/([a-zA-Z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/.exec(text.trim());
    return m ? { cmd: m[1].toLowerCase(), args: (m[2] || '').trim() } : null;
}

export function parseReferrer(args: string): string | null {
    const m = /^ref_(\d{1,15})$/.exec(args);
    return m ? m[1] : null;
}
