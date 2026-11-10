---
name: comfy-pipeline
description: Устройство ComfyUI + KIE пайплайна обоев Moonbloom: карта кода, две доски, мост, ловушки. Читать перед правкой нод Moonbloom, моста /moonbloom/*, досок workflows/ и перед утверждением чего-либо про поля нод или API. Команды для подключения модели и запуска доски: скилл kie-add-model. Подробности: reference.md рядом.
---

# ComfyUI + KIE: коротко (подробно: `reference.md`, читать частями)

Команды и правила запуска/подключения моделей: **`.agents/skills/kie-add-model/SKILL.md`**. Здесь только устройство и ловушки.

Тесты: не после каждого раунда. Правка кода платного пути: ядро один раз (`pytest`); новая нода или логика: приёмка один раз; данные и документы: без тестов. Таблица в `CLAUDE.md` («Tests policy»), решение одной строкой: `scripts/test_policy.py`.

## Схема
IDE (агент) ──HTTP 127.0.0.1:8188──► ComfyUI ──WebSocket (мост)──► вкладка в окне владельца; ноды Moonbloom ──► KIE. ComfyUI только оркестратор (локальных моделей нет). Запуск/перезапуск ComfyUI: только владелец.

## Источники правды (в этом порядке)
1. Живой ComfyUI: `GET /object_info/<нода>`, `/history`, `node_errors`. 2. Схема модели KIE `api_truth/kie/<модель>.schema.json` (= `GET /api/v1/models/{m}/schema`, главнее текста документации) и живая цена. 3. Официальные страницы по точному адресу (`api_truth/docs`, `https://docs.comfy.org/...md`, `https://docs.kie.ai/llms.txt`). 4. Код приложения `services/promptGenerator.ts`, `Promt/trends.json`. 5. Журналы `reels_pipeline/telemetry.jsonl`, `<кадр>.prompt.json`. Поиск по смыслу (Tavily, Exa) только чтобы узнать, что существует.

## Карта кода
```
reels_pipeline/   kie_capabilities.py (схема модели -> запрос, проверка, списки значений), kie_generator.py (ОДИН генератор для всех фото-моделей,
                  реестр MODEL_TAG / OTHER_IMAGE_NODES), live_price.py (живая цена по размерам), prompts.py (brief), node_cards.py (карточки и проверка графа),
                  board_run.py + onboarding.py (команды run_board / add_model), kling_bridge.py, motion_guard.py, preflight.py, telemetry.py
api_discovery/    kie_kling/ клиент KIE (createTask, recordInfo, upload) и pydantic-защита
comfy_nodes/      moonbloom_nodes.py (все ноды; make_kie_image_node строит узел модели из схемы), bridge_logic.py (мост), ui_bridge.py (тонкие маршруты, не трогать),
                  hot_reload.py, web/moonbloom_ui.js (после правки F5), test_*.py
workflows/        графы в API-формате (генерирует scripts/build_comfy_workflows.py, руками не править)
specs/            listing45_interiors.json (карточки + блок brief листинга), listing45_video.json, active_board.json (что на досках)
api_truth/        снимки первоисточников; scripts/refresh_api_truth.py обновляет (только чтение)
```
Ноды: `MoonbloomWallpaper`, `MoonbloomDesign` (промпт: `prompt_mode` full | brief), `MoonbloomListingScene`, `MoonbloomKieImage` (семейство Nano Banana, выбор `model`), `MoonbloomKieGptImage2`, `MoonbloomKieGrokImagineEdit`, `MoonbloomKieKling`, `MoonbloomFramePicker`, `MoonbloomImageFile`.

## Две доски, по одной вкладке
«Moonbloom Фото» (`moonbloom_photos_api.json`, ≤3 цепочек: Обои → Design → узел модели → превью + окно отчёта) и «Moonbloom Видео» (Frame Picker → Kling, ≤2 клипов, старт как dry run). Что на досках: `specs/active_board.json`, затем `build_comfy_workflows.py --verify-live`. Мост не открывает новые вкладки; кадр попадает на видео-доску через папку кадров на диске. Старые `listing45_*_api.json` устарели.

## Мост (`POST /moonbloom/open`, `/moonbloom/reload`)
`run=true` на платном графе принимается только при `confirm_credits` равном живой котировке и ровно одном окне ComfyUI (`send_sync` без адресата шлёт во ВСЕ окна: платный граф встал бы в очередь в каждом). `set`: только `dry_run` платной ноды и `frame` Frame Picker. Код узлов, `bridge_logic.py`, `reels_pipeline/*` подхватываются горячо за 1-2 с; `ui_bridge.py` и `hot_reload.py` только после перезапуска (владелец), `moonbloom_ui.js` после F5. Недокументированное во фронтенде (риск при обновлении ComfyUI): `loadApiJson`, `extensionManager.workflow.*`.

## Ловушки (каждая стоила вызовов)
- **Объекты нод кэшируются:** ComfyUI держит один объект на узел, после правки кода он работает по СТАРОМУ коду: `POST /moonbloom/reload` (или `run_board.py --reload`).
- **Кэш результатов:** узел с неизменными входами не перезапускается; dry run платных нод всегда свежий (`IS_CHANGED` = NaN), платный кэшируется (повтор не тратит кредиты); `reuse_existing`: готовый файл отдаётся за 0, поэтому каждый вариант промпта и повтор кадра имеют своё имя файла (`<id>_<вариант>`, `_v2`).
- **KIE отвечает HTTP 200 даже на ошибку:** смотреть `code` в теле (401 нет доступа, 402 нет кредитов, 429 частые запросы, 500/501 сбой генерации; за сбой не списывают). Цены KIE меняются: только живая цена.
- **Узел, упавший с исключением, останавливает всю доску.**
- **Комбо-поле не принимает провод** (`return_type_mismatch`, узел молча пропускается): значения списков только литералами.
- **У моделей нет поля негативного промпта** (Banana, GPT Image 2, Grok): запреты пишутся положительно; токенов KIE не возвращает, считает кредитами.
- `show --json` и сборка: ComfyUI на Windows пишет в `.pyc` по секундам; тесты горячей перезагрузки подменяют `requests.get`, а не атрибуты модуля.
- MCP по stdio идёт через stdout: логи клиента KIE печатать в stderr.
