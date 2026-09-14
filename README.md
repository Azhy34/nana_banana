# Gemini Image Composer 🎨

Gemini Image Composer (Nana Banana) — веб-приложение для подготовки листингов Etsy с обоями для детских комнат: генерация интерьерных фото на моделях Google Gemini, анимация в видео-пины, нарезка под форматы Etsy и апскейл до 24K.

![Banner](https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6)

Прод: https://nanabanana-one.vercel.app

## ✨ Основные возможности

*   **Generator**: генерация по промпту и до 5 референсов на `gemini-3.1-flash-image` (512–4K) или `gemini-3-pro-image` (1K–4K), кнопка ✨ Enhance для расширения промпта.
*   **Batch**: из одного фото обоев — 6/9/12/15 карточек с рандомизированными промптами (`Promt/trends.json`), форматы 9:16 / 2:3 / 4:3, генерация по 2 параллельно, ✨ Refine в Pro 2K.
*   **🎬 Video**: оживление 9:16 кадров — по умолчанию **Gemini Omni 1.1 Flash** (`gemini-omni-1.1-flash`, 720p для Etsy или дешёвый 360p-черновик), альтернатива **Veo 3.1 Fast** (`veo-3.1-fast-generate-preview`, 6 с). Пресеты камеры с фиксацией рисунка обоев, проверка минимального разрешения Etsy.
*   **Cropper**: нарезка под пресеты листинга Etsy (3000×2250 и др.), пакетный режим, режим перспективы стены с автоопределением углов через Gemini.
*   **Upscale**: Topaz Labs через Replicate — 8K / 16K / 24K (2x / 4x / 6x), выбор subject detection, JPG/PNG.
*   **Провайдеры**: Gemini API напрямую или OpenRouter (переключатель в шапке). Qwen Image 2 через Replicate доступен как опция.

## 🔑 Ключи и безопасность

*   Ключи вводятся в шапке сайта и хранятся только в `localStorage` браузера. Видео всегда использует Gemini-ключ, поэтому для вкладки Video выберите провайдера **Gemini**.
*   Все вызовы Gemini/Omni/Veo/OpenRouter идут прямо из браузера. Серверные функции нужны только для апскейла, загрузки в Vercel Blob, логов и Qwen.
*   ⚠️ `vite.config.ts` вшивает `GEMINI_API_KEY`, `GEMINI_VEO_API_KEY`, `OPENROUTER_API_KEY` и `REPLICATE_API_TOKEN` в клиентский JS-бандл. Держите их только в локальном `.env.local` и **не задавайте в env на Vercel**, иначе ключи станут публичными.

## 🗺 Карта проекта

```text
nana_banana/
├── api/                    # Serverless-функции Vercel
│   ├── upscale.ts          # Запуск апскейла Topaz на Replicate (токен из заголовка Authorization)
│   ├── upscale/poll.ts     # Статус предсказания Replicate
│   ├── upload.ts           # Client-токены для загрузки исходников в Vercel Blob
│   ├── log-event.ts        # JSON-логгер сессий и затрат → stdout + Vercel Blob sessions/*.json
│   ├── list-sessions.ts    # Выгрузка всех сессий логов из Blob
│   ├── qwen.ts             # Qwen Image 2 на серверном REPLICATE_API_TOKEN
│   └── qwen/poll.ts        # Статус генерации Qwen
├── components/             # Header, WizardSteps, PromptStep, ReferenceStep, ResultStep, ImageUploader,
│                           # BatchGenerator, EtsyCropper, Upscaler, VideoTool
├── hooks/useBatch.ts       # Состояние и логика Batch
├── services/
│   ├── generationRouter.ts # Выбор пути генерации (Gemini / OpenRouter / Qwen)
│   ├── geminiService.ts    # Картинки, определение стены, ✨ Enhance, отправка логов
│   ├── omniService.ts      # Видео через Gemini Omni (Interactions API)
│   ├── veoService.ts       # Видео через Veo (long-running operation)
│   ├── promptGenerator.ts  # Рандомные теги и промпт для Batch
│   ├── replicateService.ts # Апскейл и Qwen через /api
│   └── …                   # imageCompressor, imageCropService, downloadService, sessionTracker
├── shared/upscaleContract.ts # Общая zod-схема апскейла для клиента и /api
├── Promt/                  # trends.json и правила промптов
├── e2e/                    # Playwright: ui / api / live
├── constants.ts, types.ts, App.tsx, index.tsx
├── vite.config.ts
└── vercel.json             # Таймауты функций и SPA-роутинг
```

## 🚀 Быстрый старт

### Предварительные требования
*   [Node.js](https://nodejs.org/) 18+
*   API-ключ Google Gemini (Google AI Studio) с доступом к моделям выше
*   Replicate API token — для апскейла
*   Vercel CLI — чтобы локально работали `/api`-функции

### Переменные окружения
Серверу (Vercel или `.env.local` для `vercel dev`) нужен:
```bash
BLOB_READ_WRITE_TOKEN="токен_хранилища_vercel_blob"   # апскейл и логи сессий
REPLICATE_API_TOKEN="..."                            # только для Qwen (/api/qwen)
```
Ключи провайдеров для локальной разработки можно положить в `.env.local` (`GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `REPLICATE_API_TOKEN`) — они подставятся в шапку автоматически. На Vercel их не добавляйте (см. «Ключи и безопасность»).

### Установка и запуск

```bash
git clone https://github.com/Azhy34/nana_banana.git
cd nana_banana
npm install
npx vercel dev      # приложение + /api на http://localhost:3000
# или: npm run dev  — только фронтенд, без /api
```

## 🧪 Тесты

```bash
npx playwright install chromium   # один раз
npm run test:e2e        # UI (все AI-провайдеры замоканы) + API против локальной сборки без ключей
npm run test:e2e:prod   # те же тесты против прода — без платных запросов
npm run test:e2e:live   # бесплатные read-only проверки реальных ключей и доступа к моделям
npm run test:e2e:report # HTML-отчёт последнего прогона
```

Часть тестов сейчас падает намеренно — они фиксируют известные баги и проблемы безопасности (список в `CLAUDE.md`, раздел Known Issues).

## 🛠 Технологический стек

*   **Frontend**: React 19, TypeScript, Vite
*   **Стили**: Tailwind CSS (CDN)
*   **AI**: `@google/genai` SDK, Gemini Interactions API (Omni), OpenRouter, Replicate (Topaz, Qwen)
*   **Хранилище**: Vercel Blob — исходники для апскейла и логи сессий
*   **Валидация**: zod (контракт апскейла)
*   **Тесты**: Playwright
*   **Телеметрия**: JSON-логи с полем `logging.googleapis.com/trace` для Google Cloud Trace

## 📄 Лицензия

Этот проект распространяется под лицензией MIT. Подробности в файле LICENSE.
