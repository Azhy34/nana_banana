# Gemini Omni Flash (1.2 / 1.1) API Integration & Discovery Package

Пакет интеграции модели **Gemini Omni Flash** (`gemini-omni-1.2-flash`, GA с 05.11.2026; `gemini-omni-1.1-flash` с 03.12.2026 идёт на 1.2 по тарифу 1.2) (Interactions API) для генерации и анимации интерьерного видео, собранный строго по стандарту [api-discovery](file:///C:/Users/Mikhail/.gemini/config/skills/api-discovery/SKILL.md).

---

## 📁 Структура пакета

* **[`gemini_omni_collection.json`](file:///c:/Users/Mikhail/OneDrive/nocode/nana_banana/api_discovery/gemini_omni/gemini_omni_collection.json)**: Полная Postman-коллекция всех 7 эндпоинтов модели:
  1. `Text to Video (Draft 360p)` — быстрый драфт в 360p (на 60% быстрее, в 3 раза дешевле).
  2. `Image to Video (Interior Animation)` — оживление интерьера детской с сохранением текстуры обоев.
  3. `First & Last Frame Interpolation` — непрерывный пролет камеры между двумя кадрами.
  4. `Video Scene Extension` — бесшовное продление видео до 40 секунд по `previous_interaction_id`.
  5. `Video Delivery URI` — асинхронный запуск в Files API.
  6. `Check Async File Status` — поллинг готовности файла (`GET /v1beta/files/{id}`).
  7. `Download Generated Video` — финальный экспорт MP4 (`GET /v1beta/files/{id}:download`).

* **[`raw_endpoints_audit.json`](file:///c:/Users/Mikhail/OneDrive/nocode/nana_banana/api_discovery/gemini_omni/raw_endpoints_audit.json)**: Полный дамп сырых структур ответов (200 OK + ошибки 400, 401, 429, 500) по правилу *First-Touch Full Field & Error Coverage Law*.

* **[`models.py`](file:///c:/Users/Mikhail/OneDrive/nocode/nana_banana/api_discovery/gemini_omni/models.py)**: Производственные Pydantic V2 модели:
  - `OmniInteractionCreateRequest`: строгая валидация входящих данных (`resolution: 360p/720p/1080p/4k`, `aspect_ratio: 16:9/9:16`, мультимодальный ввод).
  - `OmniInteractionResponse`: 100% покрытие ответа Google Interactions API (`output_video`, `steps`, `thoughts`, `model_output`).
  - `GoogleApiErrorResponse`: разбор ошибок Google RPC (`INVALID_ARGUMENT`, `RESOURCE_EXHAUSTED` и др.).
  - `ServiceResult[T]`: эталонная двухслойная ширма (Two-Layer Shield), исключающая падения приложения.

* **[`test_models.py`](file:///c:/Users/Mikhail/OneDrive/nocode/nana_banana/api_discovery/gemini_omni/test_models.py)**: Автотесты валидации всех контрактов (8 проверок: ответы, ошибки, ширма, контракт 1.2, картинки, запрос сайта).

---

## 🚀 Как использовать в дальнейшей работе

### 1. Тестирование эндпоинтов в Postman:
Импортируйте [`gemini_omni_collection.json`](file:///c:/Users/Mikhail/OneDrive/nocode/nana_banana/api_discovery/gemini_omni/gemini_omni_collection.json) и задайте переменную окружения `GEMINI_API_KEY`.

### 2. Подключение в Python / ADK:
```python
from api_discovery.gemini_omni.models import OmniInteractionCreateRequest, OmniInteractionResponse, ServiceResult

# Запрос безопасен, типизирован и защищен ширмой
```

### 3. Подключение в TypeScript фронтенд (`nana_banana`):
Сайт уже использует эти контракты в `omniService.ts`. Чтобы они не разошлись, запрос сайта лежит в [`site_payload.sample.json`](site_payload.sample.json): e2e (`e2e/ui/video.spec.ts`) проверяет, что сайт шлёт ровно его, а `test_models.py` проверяет, что ширма его принимает.

---

## Что обновлено 08.11.2026 (сверка с документацией Google)
- `response_format.duration` (строка `"3s"`..`"15s"`; **без неё модель делает 10 секунд**; с первым+последним кадром максимум 10 с). Сайт `omniService.ts` это поле теперь отправляет.
- Разрешение по умолчанию 720p (раньше в схеме стоял 360p).
- Модель по умолчанию `gemini-omni-1.2-flash`; `generation_config.video_config.task` (запасной вариант) и `seed`; `stream`, `background`.
- Вход видео это `{"type": "video", "uri": ...}` (`VideoContentInput`).
- Проверки запроса: ≤6 картинок, ≤3 видео, нет устаревших тегов `<FIRST_FRAME>` и др., первый+последний кадр не длиннее 10 с.
- Ответ: полный список статусов, `usage` с токенами по модальностям, `OmniUsage.video_cost_usd()` (цена клипа = токены видео × $12 / 1M) и `expected_cost_usd(resolution, seconds)` до запуска.
- Образец ответа 1.2 в `raw_endpoints_audit.json` составлен вручную по документации (помечен `synthetic`); заменить реальным после первого платного вызова.
- Нет негативного промпта-параметра: запреты писать в тексте («No dialogue. No extra sound effects.»).
- Запуск проверок: `py -3.12 -X utf8 api_discovery/gemini_omni/test_models.py` (без сети и без денег).

## Что обновлено 13.11.2026
- Картинка во входе: `data` (base64) **или** `uri` (Files API), ровно одно из двух; типы `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `image/heif` (их называют обе документации Google). Голый inline без типа читается как jpeg.
- `OmniInteractionCreateRequest.routing_note()`: предупреждение для `gemini-omni-1.1-flash` (с 2026-12-03 Google отправляет его на 1.2 по тарифу 1.2). Сама модель 1.1 в списке допустимых осталась.
- `site_payload.sample.json`: контрактная фикстура запроса сайта (проверяют и `test_models.py`, и e2e сайта).
- Сайт больше не предлагает 360p (другой рендер, не обещает результат 720p; Etsy отклоняет 360×640). Ширма 360p по-прежнему допускает: это формат Google.
- Сайт читает `usage.output_tokens_by_modality` из ответа (в справочнике Interactions API это документированное поле) и показывает итоговую стоимость по счёту Google; без usage показывает расчёт по прайсу.
- `seed`: поле `generation_config.seed` в справочнике есть, но документация Omni не обещает повторяемость клипа по seed.
- Не покрыто ширмой: 4k и upscale-задача для готового видео (в Gemini API форма запроса upscale не описана), аудио-входы (Google: не поддерживаются).
- Регионы: в EEA, Швейцарии и Великобритании нельзя загружать картинки с несовершеннолетними и править загруженное видео; ширма это не проверяет, ограничение действует на стороне Google.
- `delivery: "uri"` требует `store: true`: иначе Google отвечает 400 «store=true is required when response format has video delivery set to URI» (поймано на живом сайте 13.11.2026 на 1080p). Ширма теперь отвергает это сочетание; сайт шлёт `store: true` только когда просит ссылку.
