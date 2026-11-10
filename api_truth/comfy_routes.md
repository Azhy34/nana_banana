# ComfyUI: маршруты и сообщения (источник правды)

Сверено 04.11.2026 с официальными страницами документации (исходник — репозиторий Comfy-Org/docs):
- Маршруты: https://docs.comfy.org/development/comfyui-server/comms_routes
- Сообщения WebSocket: https://docs.comfy.org/development/comfyui-server/comms_messages
- Индекс всей документации: https://docs.comfy.org/llms.txt

Сервер Comfy Desktop слушает `http://127.0.0.1:8188` (подтверждено логом запуска 03.11). Запускает и останавливает его только Comfy Desktop.
Точные ноды и их поля берём не отсюда, а из живого сервера: `GET /object_info` (снимок: `comfy/object_info.json`).

## Какие маршруты нужны нам

| Маршрут | Метод | Зачем |
|---|---|---|
| `/system_stats` | GET | проверка «сервер жив», версия ComfyUI, видеокарта и память |
| `/object_info` | GET | описание всех нод установки (в т.ч. наших `Moonbloom*`) |
| `/object_info/{node_class}` | GET | описание одной ноды |
| `/upload/image` | POST (multipart: `image`, `overwrite`, `subfolder`) | положить картинку в `input/` |
| `/prompt` | POST `{prompt, client_id}` | поставить граф (workflow в API-формате) в очередь; ответ: `prompt_id`, `number` или `error`, `node_errors` |
| `/prompt` | GET | состояние очереди |
| `/history/{prompt_id}` | GET | результат и выходные файлы задания |
| `/view` | GET (`filename`, `subfolder`, `type`) | скачать выходной файл |
| `/queue` | GET / POST | состояние очереди / очистка |
| `/interrupt` | POST | остановить текущее задание |
| `/free` | POST | выгрузить модели из памяти |
| `/ws?clientId=<uuid>` | WebSocket | прогресс в реальном времени |

`/object_info` живой: на каждый запрос сервер заново вызывает `INPUT_TYPES()` у всех загруженных классов (ComfyUI `server.py:892-903`), поэтому после горячей перезагрузки наши ноды видны сразу. Копия `comfy/object_info.json` верна только на день снимка.

Наши маршруты (регистрирует `comfy_nodes/ui_bridge.py`, логика в `bridge_logic.py`; не из официальной документации ComfyUI, слушают только 127.0.0.1, без авторизации):

| Маршрут | Метод | Зачем |
|---|---|---|
| `/moonbloom/open` | POST `{workflow, run, confirm_credits, set}` | открыть доску в постоянной вкладке окна; `run=true` только при одном окне и верном `confirm_credits` |
| `/moonbloom/reload` | POST | применить правки кода узлов сразу |

Окно пишет отчёт о вкладках через `POST /userdata/moonbloom_ui_report.json?overwrite=true` (сам маршрут `/userdata` в документации есть, параметра `overwrite` в ней нет).

Остальные маршруты (`/models`, `/embeddings`, `/features`, `/users`, `/workflow_templates`, `/extensions`, `/view_metadata/{folder}`, `/history` POST) существуют, нам пока не нужны.

## Сообщения WebSocket (`/ws`)

| Событие | Когда | Данные |
|---|---|---|
| `status` | изменилась очередь | `exec_info.queue_remaining` |
| `execution_start` | задание начинается | `prompt_id` |
| `execution_cached` | в начале | `nodes` — какие ноды пропущены из кэша |
| `executing` | начинается нода | `node` (id; `None` = всё готово), `prompt_id` |
| `progress` | шаг внутри ноды | `node`, `value`, `max` |
| `executed` | нода вернула выход для интерфейса | `node`, `output` |
| `execution_success` | всё выполнено | `prompt_id`, `timestamp` |
| `execution_error` | ошибка | `prompt_id` + подробности |
| `execution_interrupted` | остановлено | `prompt_id`, `node_id`, `node_type`, `executed` |

Время по нодам считаем сами: интервал между двумя соседними `executing` с разными `node`.

## Формат workflow

В `/prompt` уходит **API-формат** (файл «Save (API Format)» / File → Export (API)): словарь `{id_ноды: {class_type, inputs}}`. Обычный интерфейсный формат (`nodes`/`links`) сервер не принимает.
