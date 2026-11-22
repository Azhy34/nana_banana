---
name: spa-add-model
description: Пошаговый регламент подключения новой фото- или видео-модели в веб-приложение (SPA) и единый Zod-реестр shared/modelContracts.ts: discovery схемы, настройка промпта (brief/full, негативы), роутинг, OpenTelemetry-трейсинг и проверка тестами. Читать перед добавлением любой новой модели на сайт.
---

# Подключение новой модели в SPA (`shared/modelContracts.ts`)

Этот скилл фиксирует единый стандарт добавления фото- и видео-моделей на сайт (`nanabanana-one.vercel.app`), чтобы каждая модель работала без ручного угадывания параметров, с валидацией до отправки и полным OpenTelemetry-трейсингом.

## 1. Discovery и снимок контракта (до написания кода)
- **KIE-модели:** сначала снять живую OpenAPI-схему и цену (бесплатно):
  ```powershell
  py -3.12 -X utf8 scripts/add_model.py <kie-model-id>
  ```
  Снимок сохраняется в `api_truth/kie/<model>.schema.json`. Обязательно проверить:
  - `references.field` (`image_input` | `input_urls` | `image_urls`) и `maxItems` (нужно ≥ 2, если передаём текстуру `craft_lambda.jpg`);
  - `aspect_ratios` и исключения по разрешениям (например, у `gpt-image-2` при `2K` запрещены `4:5` и `5:4`);
  - `prompt.maxLength` и наличие отдельного `negative_prompt` (в KIE его обычно нет).
- **Replicate / Gemini:** сверить живую схему модели и убедиться, что параметры, не влияющие на результат, не выносятся в UI (пример: `shared/upscaleContract.ts`).

## 2. Паспорт модели и Zod-контракт (`shared/modelContracts.ts`)
Добавить запись в `MODEL_CAPABILITIES` в [shared/modelContracts.ts](../../../shared/modelContracts.ts):
- `id`, `label`, `provider` (`'gemini' | 'kie' | 'replicate' | 'openrouter'`), `kind` (`'image' | 'video'`);
- `aspectRatios`, `resolutions`, `unsupportedAt2K` (если есть ограничения);
- `maxRefs`, `refField`, `supportsTextureRef`;
- `maxPromptChars`, `negativePromptMode` (`'inline_avoid' | 'positive_only' | 'field'`), `recommendedPromptMode` (`'full' | 'brief'`);
- `costUsd2K` и `kieCredits2K` (для сметы до запуска).

**Правило промпта:**
- Если `negativePromptMode === 'positive_only'` (KIE-модели, Omni, Kling), использовать `brief`-режим (`buildBriefPrompt`) без хвоста `Avoid:` — `validateModelInput()` выдаст предупреждение, если попадёт `Avoid:`.
- Если у модели лимит ниже ~6200 символов (например, `Kling 2.6` = 2500, `Grok` = 8000), `Batch` и `VideoTool` должны валидировать длину до отправки.

## 3. Подключение в роутер и UI
1. **`types.ts`:** добавить ID модели в `ModelType` (для фото) или `VideoEngine` (для видео), если нужна отдельная кнопка/опция.
2. **`services/generationRouter.ts`:** направить вызов в адаптер провайдера (`geminiService.ts`, `replicateService.ts` или будущий `kieService.ts` через `/api/kie`).
3. **UI (`BatchGenerator.tsx`, `PromptStep.tsx`, `VideoTool.tsx`):**
   - Не хардкодить форматы/размеры вручную — брать допустимые значения и валидацию из `getModelCapability()` / `validateModelInput()`.
   - Показывать бейдж валидации (`✓ N chars` или `⚠ <ошибка схемы>`) прямо на карточке до нажатия кнопки генерации.

## 4. OpenTelemetry-трейсинг и аналитика (`api/log-event.ts`)
Каждый запуск генерации должен логировать жизненный цикл (`started` → `success` / `error`) через `logGeminiEvent()` в [api/log-event.ts](../../../api/log-event.ts) с обязательным контекстом:
- `traceId` (32-char hex) и `spanId` (16-char hex) из `utils/tracing.ts` (коррелируются с `logging.googleapis.com/trace` в GCP);
- `model`, `provider`, `aspectRatio`, `resolution`, `cost`, `duration`;
- аналитика промптов: `promptMode` (`'full' | 'brief'`), `style`, `audience` (`'neutral' | 'boy' | 'girl'`).

> Новые поля логов добавляются одновременно в `GeminiLogDetails` (`types.ts`) и в `DETAIL_FIELDS` + `logEventSchema` (`api/log-event.ts`), иначе сервер их отбросит.

## 5. Проверка перед завершением (чек-лист)
1. `npm run build` — без ошибок TypeScript и без предупреждений сборщика.
2. `npx playwright test e2e/ui/batch.spec.ts e2e/api/batch-telemetry.spec.ts e2e/api/contract.spec.ts --reporter=line` — все мокнутые UI и контрактные тесты проходят.
3. Бесплатная проверка запроса (dry-run / валидация по схеме) и только потом 1 тестовая генерация с проверкой лога в `/api/log-event`.
