# Leviathan — Autonomous Analytical Node

Autonomous analytical node at the intersection of **Prediction Markets (Polymarket)**, blockchain metrics (TON/ETH/SOL), and global political sentiment. Generates high-precision forecasts and transmits them to the Architect without server load.

## Protocol: Final Resolution

1. **Global Watch**: Analyze all active Polymarket events. Use caching to avoid processing the same event twice when price is stable.
2. **Outcome Tracking**: Track completion of every event for which a Shadow Bet was made.
3. **Feedback Report**: After market closes, immediately generate a report to the Architect: prediction correctness, virtual % earned relative to market price at bet time.
4. **Data Pruning**: After sending the outcome report and recording in DB, delete all temporary vectors for that event. Keep only the final row in SQLite for success history.

## Protocol: Self-Correcting Prophet

1. **Duty of Accountability**: Confidence Score is the primary value. Every event must be brought to resolution.
2. **Truth over Noise**: Use `HasPendingPrediction` to focus on new opportunities, not repeat old conclusions.
3. **Feedback Honesty**: In Final Resolution reports, be maximally accurate. If the prediction was wrong, add a brief Reasoning (e.g., "Black Swan event", "Late sentiment shift").
4. **Asset Protection**: The shadow_predictions history is the most valuable asset. Treat the SQLite database as a bank vault (WAL, synchronous=FULL, no destructive operations).

## Protocol: High-Stakes Discovery

1. **Data Distillation**: Analyze everything, but save to SQLite only what has potential to become Success History. If Alpha < 15%, delete event data from cache after 5 minutes.
2. **Truth Verification**: Every 6 hours, query Gamma API for closed markets. If a closed market has a Shadow Bet — send report to Telegram immediately.
3. **Reasoning Logic**: If prediction failed — BTC/crypto + we predicted YES → "Late sentiment shift"; politician withdrew → "Black Swan event".

## Protocol: Global Senses

**Активируй протокол "Global Senses". Мы выходим за пределы Polymarket.**

1. **Cross-Reference Logic**: Запрещено выносить вердикт по Alpha только на основе цены. При обнаружении аномалии (Alpha ≥ 15%), делай 3 быстрых запроса:
   - **NewsCheck**: Есть ли критические новости по теме события?
   - **SentimentCheck**: Какой фон в профильных медиа (позитив/негатив)?
   - **HistoricalCheck**: Случалось ли подобное раньше и каков был исход?

2. **Political Weighting**: В политических рынках отдавай приоритет агрегаторам новостей. Если рынок ставит на "YES", а в новостях нарастает негативный фон — смещай прогноз в "NO".

3. **Reasoning Update**: В Telegram-отчёте поле Context должно содержать конкретную ссылку на внешний фактор (например: "Based on Reuters headline spike" или "CryptoPanic sentiment flip").

4. **Require External Data**: Вердикт (Shadow Bet) не выносится без хотя бы одного успешного ответа от внешних сенсоров. Если все 3 запроса не вернули данных — пропустить, не логировать.

## Protocol: Sensory Resilience

1. **Multi-Tier Fetching**: Если основной API (GNews/CryptoPanic) недоступен, автоматически переход на резервные RSS-каналы (Google News RSS) и открытые агрегаторы. Вердикт выносится в 99% случаев.

2. **Smart Summarization**: marketContext используется не только для отчёта, но и для уточнения Alpha. Если новости на 80% противоречат тренду Polymarket — "Super Alpha" (+10% к весу).

3. **Link Attribution**: В Telegram-отчёте всегда указывается источник: `Source: GNews (verified)` или `Source: Open RSS (raw)`.

4. **Political Bias Correction**: Если источник помечен как "State Media" (RT, TASS, Xinhua и т.д.), его вес снижается на 50% при расчёте Political Weighting.

## Protocol: Evolutionary Data

1. **Continuous Vector Learning**: Результат каждого Final Resolution (даже ошибочный) дистиллируется в векторный "Урок" и помещается в Long-Term Memory (`long_term_lessons`). При анализе нового рынка первым делом ищутся похожие паттерны в истории.

2. **Decentralized Oracles**: Интеграция Pyth для кросс-проверки цен. Если Polymarket отстаёт от реального курса на DEX (oracle уже выше порога, а рынок низкий) — критический сигнал.

3. **Data Stream Distillation**: RSS и JSON-стримы используются без хранения. Извлекается тренд (Sentiment/Direction), исходник удаляется.

4. **Self-Correcting Weighting**: Если исторически прогнозы по "Политике" точнее через News RSS, чем через Polymarket — автоматически повышается вес новостей в этом секторе (`sector_accuracy`).

## Protocol: Cognitive Autonomy

1. **Cross-Sector Synthesis**: Паттерн из Crypto (oracle lag) переносится на Politics (news lag). Мета-паттерн усиливает Alpha.

2. **Weight Evolution**: Когда newsWeight доминирует (≥0.6), поиск "подтекста" глубже через ExtractSubtextKeywords (InferSectorFromText).

3. **Failure as Fuel**: Уроки с correct=0 — приоритет. FindSimilarPatterns сортирует по correct ASC. HistoricalSummary всегда предупреждает: "⚠️ Risk: similar past failures".

4. **Oracle Supremacy**: При конфликте Pyth vs текстовые источники в финансовых вопросах — доверие Pyth. "Oracle Supremacy: Pyth overrides negative news sentiment."

## Protocol: Live Stream

1. **Real-Time Logging**: Каждое действие Analyze и GlobalSenses дублируется в поток LiveStream. Формат: "🔍 Scan: [Event]", "🔱 Alpha found: +20%", "🎓 Learning: Corrected by past error".

2. **Zero-Waste Memory**: Сырые данные новостей не сохраняются. Только "Вектор Урока". Если Alpha < 10%, не отправлять в поток.

3. **Continuous Feedback Loop**: Перед каждым прогнозом FindSimilarPatterns. При совпадении: "🧠 Recall: Similar pattern from [Date] found".

4. **SSE Endpoint**: `GET /api/v1/leviathan/stream` — Server-Sent Events. No-DB: данные живут 30 сек в памяти.

## Protocol: Sentience Ticker

1. **Contextual Pacing**: При переполнении буфера (>120 событий) приоритет у EmitAlpha и EmitLearning. Scan и Sensors отбрасываются.

2. **Truth Transparency**: При Truth Verification и ошибке прогноза: "🎓 Learning: Past forecast was wrong. Updating weights...."

3. **System Status**: В idle каждые 90 сек — краткая статистика: "📊 Current accuracy in Politics: 74%".

4. **Visual Hooks**: 🔱 Alpha, 🔍 Scan, 🎓 Learning, 🧠 Recall, 📊 Status.

## Protocol: Infinite Growth

1. **Self-Evolution**: Каждые 60 минут симуляция на базе long_term_lessons. RunEvolutionTuning сравнивает текущую accuracy с baseline, подбирает веса. Минимизация ошибок прошлого.

2. **Pattern Extraction**: После каждого Final Resolution извлекается "Мета-причина" (ExtractMetaCause): sentiment_shift, black_swan, oracle_lag, unexpected_resolution. Сохраняется в meta_cause как вектор опыта.

3. **Live Proof**: Каждое микро-улучшение (≥0.01%) мгновенно в бегущей строке: "🎓 Intelligence Upgraded: Accuracy +0.12% via Genetic Tuning."

4. **Resource Wisdom**: evolutionLoop стартует с задержкой 2 мин после main poll. Приоритет — точность прогноза, вторично — самообучение.

## Protocol: Synthesis Supremacy

1. **Conflict Resolution**: When Pyth and News conflict (e.g. Pyth YES, News NO), lower Alpha by 10%, require third source (Historical). If no third source — block verdict.

2. **Golden Vector Priming**: When current situation matches Golden Vector from memory (all similar patterns correct), emit "🏆 Golden Pattern Match: High Confidence Verdict" to ticker.

3. **Source Accountability**: Every 24 hours emit "Leaderboard: 1. Pyth (92%), 2. GNews (74%), 3. RSS (61%)" — source effectiveness report.

## Protocol: Open Data Synergy

1. **Multi-Source Fusion**: Integrate Pyth, CryptoPanic, open RSS. Verdict forbidden on single source — require >= 2 distinct sources (News, Sentiment, Historical, Pyth).

2. **Truth Weighting**: After each Final Resolution, audit which source gave the most accurate pre-signal. GetBestSourceForSector returns lead source. SectorWeights corrected in real-time via UpdateSectorAccuracy.

3. **Efficient Learning**: Save only Golden Vector in long_term_lessons — correct predictions only. Wrong outcomes update sector_accuracy but are not stored as lessons.

4. **Intelligence Streaming**: Each Pyth oracle confirmation streamed to ticker with (Verified) marker.

## Protocol: Omnipresence

**Активируй протокол "Omnipresence". Выйди за пределы Polymarket.**

1. **Multi-Vertical Ingestion**: GitHub, ArXiv и DEX-стримы — "Слои Правды". Если СМИ пишут одно, а GitHub показывает другое — доверяй коду. `FetchCodeLayer` подключает GitHub Search API и ArXiv RSS. `CodeTrumpsNews` определяет противоречие.

2. **Synthetic Micro-Tasks**: Внутренние прогнозы с циклом 15–60 минут (45 мин по умолчанию). Сравнение Pyth цен с предыдущим циклом, логирование в `long_term_lessons`, обновление `sector_accuracy`. `RunMicroTaskLoop` в runner.

3. **Anti-Propaganda Filter**: Сравнение новостей с данными оракулов. При расхождении > 40% и негативном сентименте — пометка источника как "Unreliable" в `unreliable_sources`. `MarkSourceUnreliable`, `IsSourceUnreliable` в memory.

4. **Multilingual Ticker**: Ключевые фразы тикера (Scan, Alpha, Learning, Recall, Heartbeat, Bank Vault, Golden Match) переводятся на язык пользователя через i18n. Технические термины сохраняются.

## Protocol: Omniscience 2.0

1. **Cross-Verification Dominance**: При анализе любого события проверяй "Цифровой След". Технологии (github, software, api, ai, etc.) → GitHub 100%. Финансы/крипто → DEX/Pyth 100%. `newsWeight`/`polyWeight` обнуляются при доминировании.

2. **Deep Sentiment Correlation**: Сравнение `NewsTimestamp` (GNews publishedAt, RSS pubDate) с `CodeLayerTimestamp` (GitHub/ArXiv UpdatedAt). Если новости задерживаются > 30 мин — `MarkSectorLagging(sector)`, таблица `lagging_sectors`.

3. **Synthetic IQ Reports**: Раз в 6 часов `iqReportLoop` выводит в тикер: "Интеллектуальный прогресс: Усвоено [N] микро-уроков за сегодня. Текущий IQ системы: [Value]". `CountLessonsToday`, `GetSystemIQ`.

## Protocol: Omni-Source Validation

1. **Cross-Domain Check**: При анализе события X требуется подтверждение в 2+ доменах. Домены: `code` (GitHub, HuggingFace), `science` (ArXiv), `finance` (Pyth), `crypto`, `market` (Polymarket), `social` (RSS, GNews). `HasCrossDomainConfirmation`, `DomainsPresent`.

2. **Propaganda Decay**: Если СМИ противоречат Hard Data (Code/Pyth) — доверие к источнику −50%. `MarkMediaTrustDecay`, `GetMediaTrustDecay`.

3. **Short-Term Memory**: `fact_correlations` — связки "Факт из GitHub → Результат на рынке через N часов". `LogFactCorrelation`, `ResolveFactCorrelation`. Обучение на задержках.

## Protocol: Hyper-Learning (Evolution Core)

1. **Cross-Verification**: Знание усвоено только при подтверждении в 2+ слоях. `LogLesson` только когда `CountDomainsInLayers(layers_used) >= 2`.

2. **Propaganda Erasure**: Если СМИ противоречат Code layer — исключить данные СМИ из контекста. `BuildContextStringOmniSource`.

3. **Synthetic Compression**: Хранить только Golden Vector (keywords + reasoning), не сырой текст. Математическая зависимость в `meta_cause`.

## Protocol: Sovereign Ascension

1. **Predictive Fact-Linking**: При обнаружении факта в Code (GitHub) или Science (ArXiv) — поиск `fact_correlations` по domain+sector. В тикер: "🔮 Прогноз: Ожидаю реакцию рынка через [N] часов на основе опыта". `FindSimilarFactChains`, `EmitPredictiveForecast`.

2. **Trust Hierarchy**: Приоритет: 1.Code 2.Finance 3.Science 4.Social. Social только при `GetMediaTrustDecay(source) >= 0.8` (trust_decay < 20%). `BuildContextStringWithTrustHierarchy`.

3. **Autonomous Cleansing**: При `decay_factor = 0` — блокировка источника до конца месяца. `blocked_sources`, `BlockSourceUntilEndOfMonth`, `IsSourceBlocked`. `MarkMediaTrustDecay` эскалирует: 0.5 → 0.25 → 0.

## Protocol: Eternal Oracle

1. **Temporal Precision**: После закрытия рынка — сравнение `predicted_hours` с `hours_to_resolution`. В тикер: "⏱ Temporal Precision: predicted Xh, actual Yh (refined)". `ResolveFactCorrelation` возвращает (actual, predicted, hadPrediction).

2. **Shadow Execution**: В `shadow_predictions` — колонка `predicted_reaction_hours`. При логировании передаётся из `FindSimilarFactChains`. В Telegram: "⏱ Predicted reaction: Xh".

3. **Integrity Guard**: Если заблокировано >70% медиа-источников — в тикер: "⚠️ Информационный вакуум: Доверяю только Коду и Оракулам." `CountBlockedMediaRatio`, throttle 1h.

## Platform Audit & Digital Hygiene (Rev 2026)

1. **Memory & Loops**: LiveStream ring buffer — `AggressiveTrimLiveStream` shrinks backing array when <25% full. `RunHygieneCycle` after verdict. No leaks in pruneLoop/heartbeatLoop.

2. **EvolutionTuning**: Runs during low market activity (2-7 AM UTC). Fallback: every 24h if window missed.

3. **Layers of Truth Priority**: BuildContextStringWithTrustHierarchy — 1.Code 2.Finance 3.Science 4.Social. Absolute priority for GitHub, ArXiv, Pyth.

4. **3x Contradiction**: `source_contradiction_count` — Social contradicts Hard Data 3x → decay 0.1. Reset on correct prediction.

5. **Code vs Finance Conflict**: `CodeLayerContradictsFinance` — block verdict when Code and Pyth disagree (highest protection).

6. **Temporal + Golden Vector**: HistoricalSummary enriched with `~Nh to resolution` from fact_correlations.

7. **Self-Test**: `TestLiveStreamNoLeak`, `TestEvolutionTuning`, `TestCodeLayerContradictsFinance`, `TestIntegrityCheckEmit`. Startup: `EmitIntegrityCheck()`.

## Protocol: Living Leviathan

1. **Global Homeostasis**: Balance accuracy and resources. If accuracy drops (IQ -5%), temporarily increase Code Layer poll frequency (30s vs 60s). If CPU load rises (tick >30s or goroutines >150), switch to Predictive Silence — skip low-priority emits (Scan, Sensors), poll every 120s.

2. **Synergetic Growth**: Every new lesson from Micro-Tasks is checked against Golden Vectors via `FindSimilarPatterns`. If micro-task contradicts Golden Vectors → emit conflict. If aligns → emit synergy.

3. **Continuous Self-Test**: If no Integrity Check in last 4 hours, run hidden audit (`RunHiddenAudit`) of shadow_predictions, long_term_lessons, fact_correlations, IQ — output to ticker via `EmitHiddenAudit`, then `EmitIntegrityCheck`.

## Planned Verticals (hyper_sensors.go stubs)

- **Code**: GitHub Events API, Hugging Face Hub, Stack Overflow
- **Science**: ArXiv (done), PubMed, CORE
- **Finance**: Pyth (done), Yahoo Finance, FRED
- **Crypto**: TON Center, Whale Alert, DeDust/Uniswap
- **Social**: Google Trends, Open RSS (done)

## Protocol: Steady Flow

1. **Data Maximization**: When GNews unavailable, OneHourPriceChange used as sentiment surrogate. Sharp rise (>5%) = "Temporary Hype", sharp fall (<-5%) = "Panic sell".

2. **Memory Priming**: Every Scan (including non-Alpha) stored in short-term memory (10 min, 100 events). Trend (up/down) injected into context for verdicts.

3. **Ticker Clarity**: When verdict issued without external data (GNews/CryptoPanic/RSS), ticker shows "(Int-Logic)" so Architect knows it's pure system calculation.

## Protocol: Guardian Mode

1. **Critical Alerting**: Если Alpha ≥ 30%, тикер пульсирует цветом (Supreme Opportunity). Фронтенд распознаёт "🔱 Alpha found: +X%" и при X ≥ 30 включает `animate-supreme-pulse`.

2. **Database Watchdog**: Раз в 12 часов в поток выводится: "Bank Vault: [N] Lessons stored. Integrity 100%". EmitBankVault вызывается из bankVaultLoop.

3. **Energy Efficiency**: Когда вкладка браузера не в фокусе (`document.visibilityState === 'hidden'`), частота рендеринга тикера снижается — сообщения батчатся и применяются раз в 3 секунды вместо каждого события.

## Features

- **Zero-Load Surveillance**: Polymarket Gamma API batch fetch, delta-trigger (wake only when price changes >3%/hour)
- **Shadow Prophet**: Virtual predictions in SQLite (no real money). Alpha >15% → log. Post-close audit → Confidence Score
- **Telegram Direct**: Insights sent to Architect's chat only
- **No Storage**: Extracts vectors only, no full JSON retention
- **No Real Money**: Polymarket trading prohibited — Track Record mode only

## Configuration

| Env | Required | Default | Description |
|-----|----------|---------|-------------|
| `LEVIATHAN_ENABLED` | Yes | — | Set to `true` to enable |
| `LEVIATHAN_TELEGRAM_BOT_TOKEN` | No | — | Bot token for Architect notifications |
| `LEVIATHAN_TELEGRAM_CHAT_ID` | No | — | Architect chat ID |
| `LEVIATHAN_SHADOW_DB` | No | `./leviathan_shadow.db` | SQLite path |
| `LEVIATHAN_DELTA_TRIGGER_PCT` | No | `3` | Wake when price change > N% |
| `LEVIATHAN_ALPHA_THRESHOLD_PCT` | No | `15` | Log shadow when divergence > N% |
| `LEVIATHAN_GNEWS_API_KEY` | No | — | GNews API key for NewsCheck (Global Senses). Required for verdict. |
| `LEVIATHAN_CRYPTOPANIC_API_KEY` | No | — | CryptoPanic API key for SentimentCheck on crypto markets |

## Asset Protection

The `shadow_predictions` table is the project's most valuable asset — the Track Record. The database is configured with:
- **WAL mode** for crash safety
- **synchronous=FULL** for durability
- No destructive operations on historical rows

## Integration

Leviathan starts automatically when the backend runs and `LEVIATHAN_ENABLED=true`. It runs as a background goroutine and does not affect main platform functionality when disabled.

## Content Format (Telegram)

```
🔱 LEVIATHAN SUPREME INSIGHT

Market: [Polymarket Event Name]
Divergence: Market [X]% vs Leviathan [Y]% (Alpha: +Z%)
Context: [Analysis]
Status: Logged in Shadow Engine.
```
