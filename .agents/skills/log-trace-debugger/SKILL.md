---
name: log-trace-debugger
description: Инструкции и паттерны для отладки распределенных систем, анализа логов Google Cloud Trace/Logging и выявления ошибок API (Gemini/Veo/OpenRouter).
---

# Skill: Log & Trace Debugger (Local)

Этот локальный навык предназначен для проведения диагностики, анализа структурированных логов и распределенных трассировок (Distributed Tracing) в экосистеме Node.js, Vercel Serverless и Google Cloud Platform для проекта `nana_banana`.

---

## 1. Спецификация структурированного лога (Structured Logging Schema)

Все серверные компоненты должны писать логи в формате **Structured JSON** в `stdout` (через `console.log`), чтобы сборщики (Google Cloud Logging / Log Drains) автоматически распознавали метаданные.

### Обязательные поля:
* `message`: Понятное текстовое описание события.
* `severity`: Уровень логирования (`DEFAULT`, `DEBUG`, `INFO`, `NOTICE`, `WARNING`, `ERROR`, `CRITICAL`, `ALERT`, `EMERGENCY`).
* `logging.googleapis.com/trace`: Полный путь к ресурсу трассировки в формате `projects/[PROJECT_ID]/traces/[TRACE_ID]`, где `[TRACE_ID]` — это 32-символьный hex-код.
* `labels`: Объект с тегами для быстрой фильтрации (например, `sessionId`, `model`, `status`).

### Шаблон кода для Node.js/TypeScript:
```typescript
const logStructured = (message: string, severity = 'INFO', traceId?: string, extra = {}) => {
  console.log(JSON.stringify({
    message,
    severity,
    ...(traceId ? { "logging.googleapis.com/trace": `projects/pro-import-agent/traces/${traceId}` } : {}),
    ...extra
  }));
};
```

---

## 2. Поиск и отладка известных ошибок API

При обнаружении ошибок в логах со статусом `ERROR`, сопоставляйте их по следующей таблице решений:

| Код ошибки | Описание (Error Message) | Возможная причина | Способ решения |
| :--- | :--- | :--- | :--- |
| **403** | `Your API key was reported as leaked...` | Ключ был залит в публичный репозиторий GitHub или скомпрометирован. | Сгенерировать новый ключ в Google AI Studio и обновить `.env.local` / секреты Vercel. |
| **400** | `Model is not found...` | Запрос к несуществующей версии модели или неверная схема. | Проверить имя модели (например, `veo-3.1-fast-generate-preview` vs `veo-3.1-fast-generate-001`). |
| **429** | `Resource has been exhausted...` | Превышен лимит запросов в минуту (RPM) или токенов в минуту (TPM). | Добавить логику Exponential Backoff (повторы с задержкой) или привязать биллинг-аккаунт. |
| **401** | `API key not valid...` | Передан пустой ключ, ключ от другого провайдера (например, OpenRouter вместо Gemini). | Добавить фронтенд-валидацию префикса (`sk-or-` для OpenRouter, `AIzaSy` для Gemini). |

---

## 3. Инструкции по поиску логов в Google Cloud Console

Для отслеживания сквозного пути запроса от генерации картинки до финального видео:
1. Скопируйте `traceId` из ответа клиента или консоли разработчика.
2. Откройте **Logs Explorer** в Google Cloud Console.
3. Используйте запрос для фильтрации по конкретному трейсу:
   ```query
   trace = "projects/pro-import-agent/traces/[ВАШ_TRACE_ID]"
   ```
4. Вы увидите всю хронологическую цепочку событий, включая затраты (`cost`), продолжительность выполнения (`duration`) и возникшие ошибки.
