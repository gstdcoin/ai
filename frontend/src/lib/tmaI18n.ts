import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { getTelegramUser } from './telegram';

/**
 * Client-side overlay for the Telegram Mini App so users whose Telegram language is not
 * en/ru still get a localized interface without adding Next.js locales (which would
 * multiply prerendered pages). Missing keys fall back to the regular en/ru catalog.
 */
type Dict = Record<string, string>;

const KEYS = [
  'dashboard', 'trade', 'cta_worker', 'hire_agents', 'loading', 'connection_status', 'online',
  'idle', 'stat_tasks', 'welcome_guide', 'step1_connect', 'bw_title', 'bw_desc', 'bw_start',
  'bw_stop', 'bw_done', 'bw_error', 'bw_need_wallet', 'bw_unsupported', 'open_in_telegram',
  'ticker_nodes_online', 'ticker_tasks_done', 'ticker_queue', 'ticker_paid',
  'ticker_unavailable', 'swap_open', 'platform', 'connect_wallet_first', 'tier_rewards',
  'start_node', 'stop_node', 'node_active', 'node_stopped', 'per_task',
] as const;

const make = (values: string[]): Dict =>
  Object.fromEntries(KEYS.map((k, i) => [k, values[i]]));

const DICTS: Record<string, Dict> = {
  es: make([
    'Panel', 'Comprar/Canjear', 'Activar nodo', 'Agentes IA', 'Cargando...', 'Conexión', 'En línea',
    'Inactivo', 'Tareas (24h)', 'Bienvenido a GSTD', 'Paso 1: conecta tu billetera', 'Trabajador de cómputo',
    'Verifica resultados con tu teléfono mientras esta pantalla esté abierta. Las recompensas se pagan solo por tareas completadas y aceptadas de campañas financiadas; no hay tarifa garantizada.',
    'Iniciar trabajador', 'Detener trabajador', 'Tareas completadas en esta sesión', 'Sin conexión con la red, reintentando…',
    'Conecta primero una billetera.', 'Este navegador no admite la criptografía requerida (Ed25519).', 'Abre en Telegram para la experiencia completa',
    'Nodos en línea', 'Tareas completadas', 'Cola', 'GSTD pagados', 'Estadísticas de red no disponibles temporalmente',
    'Canjear en', 'Plataforma', 'Conecta primero una billetera', 'Niveles', 'Iniciar nodo', 'Detener nodo', 'Nodo activo', 'Detenido', 'por tarea',
  ]),
  pt: make([
    'Painel', 'Comprar/Trocar', 'Ativar nó', 'Agentes de IA', 'Carregando...', 'Conexão', 'Online',
    'Inativo', 'Tarefas (24h)', 'Bem-vindo ao GSTD', 'Passo 1: conecte sua carteira', 'Trabalhador de computação',
    'Verifique resultados com seu celular enquanto esta tela estiver aberta. As recompensas são pagas apenas por tarefas concluídas e aceitas de campanhas financiadas; não há taxa garantida.',
    'Iniciar trabalhador', 'Parar trabalhador', 'Tarefas concluídas nesta sessão', 'Sem conexão com a rede, tentando novamente…',
    'Conecte uma carteira primeiro.', 'Este navegador não suporta a criptografia necessária (Ed25519).', 'Abra no Telegram para a experiência completa',
    'Nós online', 'Tarefas concluídas', 'Fila', 'GSTD pagos', 'Estatísticas da rede indisponíveis no momento',
    'Trocar em', 'Plataforma', 'Conecte uma carteira primeiro', 'Níveis', 'Iniciar nó', 'Parar nó', 'Nó ativo', 'Parado', 'por tarefa',
  ]),
  tr: make([
    'Panel', 'Al/Takas', 'Düğümü başlat', 'Yapay zekâ ajanları', 'Yükleniyor...', 'Bağlantı', 'Çevrimiçi',
    'Boşta', 'Görevler (24s)', 'GSTD\'ye hoş geldiniz', 'Adım 1: cüzdanını bağla', 'Hesaplama çalışanı',
    'Bu ekran açıkken telefonunuzla sonuçları doğrulayın. Ödüller yalnızca fonlanmış kampanyalardaki tamamlanmış ve kabul edilmiş görevler için verilir; garanti edilen bir oran yoktur.',
    'Çalışanı başlat', 'Çalışanı durdur', 'Bu oturumda tamamlanan görevler', 'Ağa ulaşılamadı, yeniden deneniyor…',
    'Önce bir cüzdan bağlayın.', 'Bu tarayıcı gerekli şifrelemeyi (Ed25519) desteklemiyor.', 'Tam deneyim için Telegram\'da açın',
    'Çevrimiçi düğümler', 'Tamamlanan görevler', 'Kuyruk', 'Ödenen GSTD', 'Ağ istatistikleri geçici olarak kullanılamıyor',
    'Takas et:', 'Platform', 'Önce cüzdan bağlayın', 'Seviyeler', 'Düğümü başlat', 'Düğümü durdur', 'Düğüm aktif', 'Durduruldu', 'görev başına',
  ]),
  uk: make([
    'Панель', 'Купити/Обміняти', 'Запустити вузол', 'ШІ-агенти', 'Завантаження...', 'З\'єднання', 'Онлайн',
    'Очікує', 'Завдання (24 год)', 'Ласкаво просимо до GSTD', 'Крок 1: підключіть гаманець', 'Обчислювальний воркер',
    'Перевіряйте результати зі свого телефона, поки цей екран відкритий. Винагороди виплачуються лише за виконані та прийняті завдання профінансованих кампаній; гарантованої ставки немає.',
    'Запустити воркер', 'Зупинити воркер', 'Завдань виконано за сесію', 'Немає зв\'язку з мережею, повторюємо…',
    'Спершу підключіть гаманець.', 'Цей браузер не підтримує потрібну криптографію (Ed25519).', 'Відкрийте в Telegram для повного досвіду',
    'Вузлів онлайн', 'Виконано завдань', 'Черга', 'Виплачено GSTD', 'Статистика мережі тимчасово недоступна',
    'Обміняти на', 'Платформа', 'Спершу підключіть гаманець', 'Рівні', 'Запустити вузол', 'Зупинити вузол', 'Вузол активний', 'Зупинено', 'за завдання',
  ]),
  id: make([
    'Dasbor', 'Beli/Tukar', 'Aktifkan node', 'Agen AI', 'Memuat...', 'Koneksi', 'Online',
    'Siaga', 'Tugas (24j)', 'Selamat datang di GSTD', 'Langkah 1: hubungkan dompet', 'Pekerja komputasi',
    'Verifikasi hasil dengan ponsel Anda selama layar ini terbuka. Hadiah hanya dibayar untuk tugas selesai dan diterima dari kampanye yang didanai; tidak ada tarif yang dijamin.',
    'Mulai pekerja', 'Hentikan pekerja', 'Tugas selesai pada sesi ini', 'Tidak dapat terhubung ke jaringan, mencoba lagi…',
    'Hubungkan dompet terlebih dahulu.', 'Browser ini tidak mendukung kriptografi yang diperlukan (Ed25519).', 'Buka di Telegram untuk pengalaman penuh',
    'Node online', 'Tugas selesai', 'Antrean', 'GSTD dibayar', 'Statistik jaringan sementara tidak tersedia',
    'Tukar di', 'Platform', 'Hubungkan dompet terlebih dahulu', 'Tingkat', 'Mulai node', 'Hentikan node', 'Node aktif', 'Berhenti', 'per tugas',
  ]),
  de: make([
    'Übersicht', 'Kaufen/Tauschen', 'Node starten', 'KI-Agenten', 'Lädt...', 'Verbindung', 'Online',
    'Leerlauf', 'Aufgaben (24h)', 'Willkommen bei GSTD', 'Schritt 1: Wallet verbinden', 'Rechen-Worker',
    'Prüfe Ergebnisse mit deinem Handy, solange dieser Bildschirm offen ist. Belohnungen gibt es nur für abgeschlossene, akzeptierte Aufgaben finanzierter Kampagnen; es gibt keine garantierte Rate.',
    'Worker starten', 'Worker stoppen', 'In dieser Sitzung abgeschlossene Aufgaben', 'Netzwerk nicht erreichbar, neuer Versuch…',
    'Verbinde zuerst eine Wallet.', 'Dieser Browser unterstützt die benötigte Kryptografie (Ed25519) nicht.', 'Für das volle Erlebnis in Telegram öffnen',
    'Nodes online', 'Abgeschlossene Aufgaben', 'Warteschlange', 'GSTD ausgezahlt', 'Netzwerkstatistiken vorübergehend nicht verfügbar',
    'Tauschen auf', 'Plattform', 'Verbinde zuerst eine Wallet', 'Stufen', 'Node starten', 'Node stoppen', 'Node aktiv', 'Gestoppt', 'pro Aufgabe',
  ]),
  fr: make([
    'Tableau de bord', 'Acheter/Échanger', 'Activer le nœud', 'Agents IA', 'Chargement...', 'Connexion', 'En ligne',
    'Inactif', 'Tâches (24h)', 'Bienvenue sur GSTD', 'Étape 1 : connectez votre portefeuille', 'Travailleur de calcul',
    'Vérifiez des résultats avec votre téléphone tant que cet écran est ouvert. Les récompenses ne sont versées que pour des tâches terminées et acceptées de campagnes financées ; aucun taux n\'est garanti.',
    'Démarrer le travailleur', 'Arrêter le travailleur', 'Tâches terminées durant cette session', 'Réseau injoignable, nouvelle tentative…',
    'Connectez d\'abord un portefeuille.', 'Ce navigateur ne prend pas en charge la cryptographie requise (Ed25519).', 'Ouvrez dans Telegram pour l\'expérience complète',
    'Nœuds en ligne', 'Tâches terminées', 'File d\'attente', 'GSTD versés', 'Statistiques réseau temporairement indisponibles',
    'Échanger sur', 'Plateforme', 'Connectez d\'abord un portefeuille', 'Niveaux', 'Démarrer le nœud', 'Arrêter le nœud', 'Nœud actif', 'Arrêté', 'par tâche',
  ]),
  zh: make([
    '概览', '购买/兑换', '启动节点', 'AI 代理', '加载中...', '连接', '在线',
    '空闲', '任务（24小时）', '欢迎使用 GSTD', '第 1 步：连接钱包', '计算工作器',
    '保持此屏幕打开时，可用手机验证结果。仅对已获资助活动中完成并被接受的任务发放奖励，不保证固定收益。',
    '启动工作器', '停止工作器', '本次会话已完成任务', '无法连接网络，正在重试…',
    '请先连接钱包。', '此浏览器不支持所需的加密算法（Ed25519）。', '请在 Telegram 中打开以获得完整体验',
    '在线节点', '已完成任务', '队列', '已支付 GSTD', '网络统计暂时不可用',
    '前往兑换：', '平台', '请先连接钱包', '等级', '启动节点', '停止节点', '节点运行中', '已停止', '每个任务',
  ]),
};

export function resolveTmaLang(code?: string): string | null {
  const base = (code || '').toLowerCase().split('-')[0];
  return DICTS[base] ? base : null;
}

/** Drop-in replacement for useTranslation('common') inside the mini app. */
export function useTmaTranslation() {
  const { t, i18n } = useTranslation('common');
  const [lang, setLang] = useState<string | null>(null);

  useEffect(() => {
    // Only override when Telegram's language has no en/ru catalog.
    const code = getTelegramUser()?.language_code || (typeof navigator !== 'undefined' ? navigator.language : '');
    setLang(resolveTmaLang(code));
  }, []);

  const tt = useCallback((key: string, fallback?: string): string => {
    if (lang && DICTS[lang][key]) return DICTS[lang][key];
    return t(key, fallback ?? key) as string;
  }, [lang, t]);

  return { t: tt, i18n, lang };
}
