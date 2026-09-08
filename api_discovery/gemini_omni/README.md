# Gemini Omni 1.1 Flash API Integration & Discovery Package

Пакет интеграции модели **Gemini Omni 1.1 Flash** (Interactions API) для генерации и анимации интерьерного видео, собранный строго по стандарту [api-discovery](file:///C:/Users/Mikhail/.gemini/config/skills/api-discovery/SKILL.md).

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

* **[`test_models.py`](file:///c:/Users/Mikhail/OneDrive/nocode/nana_banana/api_discovery/gemini_omni/test_models.py)**: Автотесты валидации всех контрактов (все 5 тестов успешно пройдены).

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
Контракты из `models.py` транслируются 1-в-1 в интерфейсы для `omniService.ts` при готовности перейти к фронтенду.
