# Animate — оживление интерьеров через Google Veo 3.1 (image-to-video)

Документ фичи: новая вкладка **Video** + кнопка **🎬 Animate** в Batch. Цель — короткие "живые" видео интерьеров с обоями для Pinterest-пинов и трафика на сайт/Etsy. Обои — продаваемый товар: узор/цвет не должны меняться при анимации.

## Ключевые решения

| Вопрос | Решение |
|---|---|
| Модель | **Veo 3.1 Fast** (`veo-3.1-fast-generate-preview`) по умолчанию, Standard — переключатель |
| Разрешение | **720p** (осознанно; Pinterest рекомендует 1080p — при необходимости Topaz-апскейл отдельным шагом) |
| Длительность | **4/6/8 сек, по умолчанию 6** → ~$0.60/видео на Fast |
| Формат | 9:16 (Batch) / 16:9 (standalone). Veo другие не поддерживает — на карточках 4:3/2:3 кнопка disabled |
| Механика | **Фото комнаты = первый кадр (`image`), БЕЗ `referenceImages`** — SDK явно запрещает совмещать их (genai.d.ts:3381-3386). Обои в первом кадре уже точные 1:1 |
| Защита обоев | Промпт (позитивные приказы) + `negativePrompt` (все запреты) + фиксированный `seed` |
| Биллинг | Серверный ключ `GEMINI_VEO_API_KEY` (Vercel env). Подписка Google AI Pro к API НЕ применима — только платный биллинг. Fast: $0.10/сек (720p), $0.12 (1080p); Standard: $0.40/сек |
| Подтверждение | Двухшаговая кнопка Generate с ценой — каждая генерация платная |

## Промпт-стратегия (защита обоев)

По Veo prompt guide отрицания ("no", "don't") в основном промпте модель может игнорировать — все запреты уходят в `negativePrompt`:

**Основной промпт (позитивные приказы):**
> Static locked-off camera shot, the camera remains completely still. The wallpaper mural on the wall stays perfectly identical, crisp and unchanged throughout the entire video — exact same pattern, exact same colors, exact same position, as in the first frame. Subtle natural ambient motion only: soft daylight shifting gently, faint air movement in fabrics. Everything in the room keeps its exact appearance and position.

**Negative prompt (запреты):**
> changing wallpaper pattern, different wall color, morphing wall texture, warped walls, shifting print, repainted wall, new wall art appearing, camera movement, zoom, pan, dolly, camera shake, scene change, furniture moving, objects appearing or disappearing, text, watermark

## Архитектура

```
VideoTool.tsx ──▶ veoService.ts ──▶ POST /api/animate  ──▶ Gemini API generateVideos → { operationName }
                     │  poll loop ──▶ GET /api/animate/poll?name=... ──▶ getVideosOperation
                     │                  └─ done: скачивает видео + put() в Vercel Blob → { videoUrl }
                     └─ data:-фото → /api/upload (Vercel Blob client upload)
```

- Паттерн submit+poll скопирован с `services/replicateService.ts` + `api/upscale.ts`/`api/upscale/poll.ts` (весь wait на клиенте, функции быстрые).
- Серверный ключ — по прецеденту `api/qwen.ts` (env, не BYOK).
- Готовое видео Google не отдаёт без ключа в URL → poll-эндпоинт перезаливает его в Vercel Blob (`BLOB_READ_WRITE_TOKEN`), клиент получает публичную ссылку.
- Телеметрия: события start/done/error в `/api/log-event` (паттерн `geminiService.ts` + `sessionTracker.ts`).

## Файлы

| Файл | Что |
|---|---|
| `types.ts` | `ViewMode + 'video'`, `VeoModel`, `VeoAspectRatio`, `VeoDuration`, `VideoJobSettings`, `VideoToolPayload`, `VideoGenerationState` |
| `constants.ts` | `VEO_MODEL_OPTIONS`, `VEO_PRICING_PER_SECOND_USD`, `VEO_DEFAULT_*` (duration/seed/промпты) |
| `services/veoService.ts` (new) | `ensurePublicUrl`, `startVeoAnimation`, `pollVeoOperation`, `animateWithVeo` |
| `api/animate.ts` (new) | POST submit → `generateVideos` → `{ operationName }` |
| `api/animate/poll.ts` (new) | GET poll → при готовности перезаливка видео в Blob → `{ videoUrl }`; идемпотентен |
| `components/VideoTool.tsx` (new) | Вкладка Video: аплоад/предзагрузка, настройки, цена, прогресс, `<video>` + Download |
| `App.tsx` | `videoPayload` state, `handleSendToVideo`, таб Video, рендер-блок |
| `components/BatchGenerator.tsx` | Кнопка 🎬 Animate (9:16 — активна; 4:3/2:3 — disabled + tooltip) |
| `vercel.json` | `functions`: `api/animate.ts` maxDuration 30, `api/animate/poll.ts` maxDuration 60 |

## Env

- **`GEMINI_VEO_API_KEY`** — новый, server-only (Vercel project env, без `VITE_`-префикса). Ключ Gemini API с включённым платным биллингом.
- `BLOB_READ_WRITE_TOKEN` — уже настроен, переиспользуется.

## Pinterest (публикация — ручной процесс)

- 9:16 — официальная рекомендация Pinterest для видео; 6-8 сек ок (минимум 4 сек).
- Видео-пин даёт охват, статичный пин — клики: **публиковать парой** на один листинг.
- Обложку пина выбирать отдельно (не кадр №1); текст-оверлей обязателен (смотрят без звука).
- Pinterest пометит Veo-видео лейблом "AI modified" (SynthID-метаданные) — не пенальти, не вычищать.

## Dev-инструмент: Google MCP "Tools for Genmedia" (отдельный трек)

`GoogleCloudPlatform/vertex-ai-creative-studio → experiments/mcp-genmedia` (сервер `mcp-veo-go`). Роль — "гейт стандартизации": сверка схемы параметров Veo (`tools/list`) + тестовые генерации из IDE. Работает через Vertex AI (GCP-проект + ADC + GCS-бакет) — биллинг отдельный от сайта.

Подключение: `gcloud auth application-default login` → env `PROJECT_ID`/`LOCATION`/`GENMEDIA_BUCKET` → установка бинарников (`install-online.sh` через Git Bash) → `claude mcp add veo --env ... -- mcp-veo-go` → проверка `/mcp`.

## Тестирование

⚠️ **Через `vercel dev` или preview-деплой, НЕ `npm run dev`** — в `vite.config.ts` нет proxy для `/api/*`.

1. Batch → карточка 9:16 → 🎬 Animate → Video-вкладка с предзаполненным фото → Generate → confirm → видео: обои совпадают с первым кадром, не "плывут".
2. Вкладка Video напрямую: ручная загрузка фото → флоу работает.
3. Карточка 4:3/2:3: кнопка disabled с подсказкой.
4. Тот же seed/промпт/фото → стабильный результат.
5. События видео-генерации пишутся в `gemini_sessions.json` (dev).
6. Пред-тест промпта: вручную в AI Studio (aistudio.google.com) на фото карточки.

---

## 📝 План внедрения Veo-анимации на сайт (TODO List)

- [ ] **1. Подготовка конфигурации и типов (`types.ts` & `constants.ts`)**
  - [ ] Добавить в `types.ts` типы для Veo (`VeoModel`, `VeoAspectRatio`, `VeoDuration`, `VideoJobSettings`, `VideoToolPayload`, `VideoGenerationState`).
  - [ ] Объявить константы в `constants.ts`: `VEO_MODEL_OPTIONS` (с `veo-3.1-fast-generate-001`), тарифы `VEO_PRICING_PER_SECOND_USD` ($0.10/сек со звуком), и дефолтные значения (duration=6, aspect_ratio="9:16", seed=133466).
  - [ ] Записать проверенные формулы `VEO_DEFAULT_PROMPT` и `VEO_DEFAULT_NEGATIVE_PROMPT`.
  - [ ] Добавить 3 предустановленных пресета (режима) движения камеры, которые выбираются программно:
    * **Медленный наезд камеры (Dolly-In):** *Dolly-in промпт без повторного описания сцены.*
    * **Легкое оживление / Живое фото (Ambient):** *Легкое колыхание/микродвижения, идеален дляlifestyle-кадров с мамой/ребенком.*
    * **Плавный отъезд камеры (Dolly-Out):** *Dolly-out промпт.*

- [ ] **2. Настройка переменных окружения (Environment Variables)**
  - [ ] Добавить в локальный `.env` и в панель Vercel переменную `GEMINI_VEO_API_KEY` (server-only ключ для Vertex AI / Gemini API).
  - [ ] Проверить доступы к `BLOB_READ_WRITE_TOKEN` для загрузки референсов и сохранения готовых MP4 файлов.

- [ ] **3. Создание клиентского сервиса (`services/veoService.ts`)**
  - [ ] Реализовать функцию `startVeoAnimation` для отправки POST-запроса на создание видео.
  - [ ] Реализовать `pollVeoOperation` для циклического опроса статуса генерации.
  - [ ] Добавить метод `ensurePublicUrl` для автоматического сжатия и конвертации Base64/локальных картинок в формат `image/jpeg` (высокое качество ~90% для защиты деталей обоев) и загрузки в Vercel Blob перед отправкой в API.

- [ ] **4. Разработка серверных эндпоинтов (API Routes)**
  - [ ] Создать `api/animate.ts` (POST): принимает `image` и параметры, запускает долгосрочную операцию в Vertex AI `predictLongRunning` и возвращает `operationName`. Использовать `"personGeneration": "allow_adult"` по умолчанию для поддержки лайфстайл-сцен. Лимит `maxDuration` = 30 секунд.
  - [ ] Создать `api/animate/poll.ts` (GET): опрашивает статус операции. При готовности скачивает временный файл от Google, загружает его в Vercel Blob и возвращает публичную ссылку `{ videoUrl }`. Лимит `maxDuration` = 60 секунд.

- [ ] **5. Интеграция в интерфейс Batch-генератора (`components/BatchGenerator.tsx`)**
  - [ ] Добавить на карточки результатов кнопку **🎬 Animate**.
  - [ ] Настроить доступность кнопки: активна только при соотношении сторон `9:16`. Для 4:3 и 2:3 сделать кнопку неактивной с подсказкой (Tooltip): *"Анимация доступна только для вертикального формата 9:16 (Pinterest)"*.
  - [ ] Связать кнопку с триггером перехода во вкладку Video.

- [ ] **6. Создание интерфейса инструмента видео (`components/VideoTool.tsx` & `App.tsx`)**
  - [ ] Добавить вкладку **Video** в главное меню приложения.
  - [ ] Реализовать в `App.tsx` проброс состояния `videoPayload` из Batch во вкладку Video.
  - [ ] В `VideoTool.tsx` отображать предзаполненное изображение, настройки параметров (длительность, промпт, сид), расчетную стоимость генерации и окно предпросмотра готового видео с кнопкой скачивания.
  - [ ] Добавить в `VideoTool.tsx` валидацию для параметра `seed` (в диапазоне от `0` до `4294967295`).
  - [ ] Добавить логику зависимости разрешения: опция `1080p` доступна только при выборе длительности `8s` (ограничение Veo 3.1).
  - [ ] Интегрировать логирование событий через `/api/log-event` (события `video_start`, `video_done`, `video_error`).

---

## 📊 Логирование и Мониторинг (Телеметрия)

Для быстрого поиска ошибок, отслеживания затрат на видео-рендеринг и анализа поведения ИИ, мы упаковываем все параметры («аэродропы») в структурированный JSON и пишем их через единый шлюз логирования `/api/log-event`.

### 1. Схема JSON-логирования для видео:
Каждая сессия генерации видео записывает в лог-файл (Vercel Blob `sessions/${sessionId}.json` и локальный `gemini_sessions.json`) следующие данные:

```json
{
  "timestamp": "2026-07-12T11:17:35.000Z",
  "model": "veo-3.1-fast-generate-001",
  "status": "success | error",
  "cost": 0.60,
  "duration": 62.4, // Фактическое время рендеринга видео в секундах
  "error": "Short description of error if status is error",
  "prompt": "An extremely slow, steady, and smooth cinematic camera push-in...",
  "metadata": {
    "seed": 133466,
    "aspectRatio": "9:16",
    "durationSeconds": 6,
    "generateAudio": false,
    "personGeneration": "allow_adult",
    "enhancedPrompt": false,
    "operationId": "projects/170960024115/locations/us-central1/operations/8530737427585896323"
  }
}
```

### 2. Зачем это нужно и как читать логи для исправления ошибок:

* **Мониторинг затрат:** Каждое видео фиксирует в ключе `cost` точную сумму списания ($0.10 за секунду Fast-модели). Это позволяет видеть суммарный расход по сессиям.
* **Повторяемость багов через Seed:** Если на каком-то видео «поплыли» обои или появились артефакты, вы можете открыть лог сессии, скопировать точный `seed` и `prompt`, и запустить генерацию повторно для тестов в Vertex AI Studio.
* **Отслеживание таймаутов и падений LRO:** Если операция зависла на стороне Google, в логе зафиксируется `operationId`. По нему можно сделать прямой запрос в Google Cloud Console (или через CLI `gcloud beta ai operations describe [operationId]`), чтобы узнать, почему сервер отменил или заблокировал задачу.
* **Интеграция с OpenTelemetry:**
  Поскольку бэкенд Vercel пишет все логи в `stdout` через `console.log`, эти структурированные записи автоматически подхватываются внешними сборщиками (например, Google Cloud Trace / Log Drains), преобразуя их в стандартные распределенные трассировки (Distributed Tracing).


