# Справочник ComfyUI + KIE (Moonbloom): подробно

Читать по необходимости, не целиком. Короткая версия и команды: `SKILL.md` рядом и `.agents/skills/kie-add-model/SKILL.md`.

# ComfyUI + KIE: пайплайн Moonbloom

Обновлено 2026-11-05. Старая схема со скриптом `comfy_runner.cjs` и воркфлоу, экспортированными руками, не используется. Где что искать: этот файл = как устроен инструмент и ловушки; `CLAUDE.md` = обзор проекта и правила; `AGENTS.md` = журнал решений по датам; `.agents/skills/creative-ad-auditor/SKILL.md` = правила видео-промптов; `api_truth/README.md` = снимки первоисточников.

## Схема

```
IDE (агент) ──HTTP 127.0.0.1:8188──► сервер ComfyUI ──WebSocket (мост)──► вкладка в окне владельца
                                           │
                                           └─► ноды Moonbloom ──► KIE (nano-banana-2-1 / kling-2.6)
```
ComfyUI только оркестратор: локальных моделей нет (Radeon 890M), всё считает KIE. Запуск, остановка и перезапуск ComfyUI: только владелец. KIE сам единый переходник: все проверенные модели (Nano Banana, GPT Image, Seedream, Flux, Kling, Hailuo, Wan, Seedance, Veo) идут через `POST /api/v1/jobs/createTask` и `GET /api/v1/jobs/recordInfo`, меняется только тело `input`; LiteLLM не нужен (KIE в нём нет, в среде ComfyUI его нет).

## Источники правды (в этом порядке)

Правило владельца: факты берём из первоисточников по точному адресу. Поиск по смыслу (Tavily, Exa) только чтобы узнать, что существует; любой факт из него подтверждается пунктами 1-4 (репозитории читать через `gh api`, не через скрейпер).

1. **Живой ComfyUI:** `GET /object_info/<нода>` (поля, допустимые значения), `GET /history/{prompt_id}` (статус, ошибки, выходы), поле `node_errors` в ответе `POST /prompt` (граф с ошибками проверки выполняется частично и молча), `GET /system_stats`.
2. **Исходники ComfyUI на диске:** `C:\Users\Mikhail\AppData\Local\Comfy-Desktop\ComfyUI-Installs\AMD RECOMMENDED\ComfyUI\` (`nodes.py`, `server.py`, `execution.py`, `main.py`, `comfy_extras\*.py`). Интерфейс: `.venv\Lib\site-packages\comfyui_frontend_package\static\assets\*.js.map`, в `sourcesContent` лежат исходные `.ts` (`src/scripts/app.ts`, `workflowService.ts`, `workflowStore.ts`): так проверено поведение вкладок.
3. **Официальные страницы по адресу:** Comfy: `https://docs.comfy.org/<путь>.md`, индекс `https://docs.comfy.org/llms.txt`. KIE: индекс `https://docs.kie.ai/llms.txt`, страницы моделей `https://docs.kie.ai/market/...md`, каталог `GET https://api.kie.ai/api/v1/models` (239 моделей, поля `model`, `taskType`, `pricingDesc`, `provider`), **схема вызова модели** `GET /api/v1/models/{model}/schema` (она главнее текста документации). Снимки в `api_truth/` (см. `api_truth/README.md`). Обновить: `py -3.12 -X utf8 api_truth/refresh_api_truth.py [--only docs|kie|comfy]` (только чтение, кредиты не тратятся).
4. **Код приложения:** `services/promptGenerator.ts` (`buildGeminiPrompt`) и `Promt/trends.json`: откуда берутся стили, цвета, предметы, камера и текст промпта. Это единственный источник промпта и для сайта, и для ComfyUI.
5. **Журналы:** `reels_pipeline/telemetry.jsonl` (реальные кредиты, баланс до и после, `price_source`, `credits_source`, `billing_warning`, `prompt_file`), `/history`, файлы `<кадр>.prompt.json`.

KIE MCP и Comfy MCP у владельца не подключены. Официальный `comfy-mcp` не берём: не рисует на холсте, его защита от трат видит только партнёрские ноды Comfy, а наши ноды KIE запустил бы без вопроса.

## Процесс: сначала смотрим официальные ноды, потом решаем, потом подключаем

1. `py -3.12 -X utf8 scripts/comfy_node_info.py search <слова>`: что вообще есть в ComfyUI (встроенные, партнёрские, пакеты, наши).
2. `... show <Нода>` (или `--json`): поля, значения по умолчанию, цена (формула из самой ноды), платит ли нода кредитами Comfy (`api_node`).
   **`... card <Нода>`** (или `card --moonbloom [--save]`): карточка с живого сервера в одном формате для любой ноды: `class_name, display_name, category, required_inputs, optional_inputs` (у каждого входа `type`, `choices` для списков, `default`, `min`, `max`, `multiline`, `forceInput`, `tooltip`), `outputs {types, names}`, `output_node`, `api_node`. Карточки наших узлов лежат в `api_truth/comfy/node_cards/`. **`... kie <модель>`**: что модель умеет по схеме самого KIE (все поля и допустимые значения, не только то, что показывает наша нода).
   Живые данные: `GET /object_info` собирается заново из загруженных классов на каждый запрос (`server.py:892-903`). Копия `api_truth/comfy/object_info.json` только на день снимка; без ответа сервера `search`/`show` печатают громкое предупреждение с датой копии, `card` отказывается без `--snapshot`.
3. Страница ноды `https://docs.comfy.org/built-in-nodes/<Нода>.md` и документация провайдера модели (Google: через `google-dev-knowledge`).
4. Решение записать в таблицу ниже. Только после этого нода попадает в `scripts/build_comfy_workflows.py`. Своя нода пишется, только если подходящей нет или она не соответствует правилам проекта (кредиты KIE, `dry_run`, журнал).

### Что найдено для Листинга 45 (04.11, по JSON нод, документации Comfy, KIE и Google)

| Задача | Официальная нода Comfy | Наша нода | Различия |
|---|---|---|---|
| Фото Nano Banana 2.1 | `GeminiNanoBanana2V2` (партнёрская, кредиты Comfy): `prompt`, `model` (внутри `aspect_ratio`, `resolution` 1K/2K/4K, `thinking_level`, `images`, `files`), `seed`, `response_modalities`, `system_prompt`, `temperature`, `top_p`. По формуле ноды 2K ≈ $0.072 | `MoonbloomKieImage` (KIE: `prompt`, `image_input`, `aspect_ratio`, `resolution`, `output_format`); 6 кр = $0.03 за 2K | У официальной больше рычагов, у KIE дешевле примерно в 2.4 раза. Качество на обоях между собой не сравнивали |
| Видео Kling 2.6 | `KlingImageToVideoWithAudio` (`kling-v2-6`, pro): $0.35 за 5 с без звука | `MoonbloomKieKling`: 63 кр = $0.315 (с 05.11, было 55) + motion guard | Полей поровну; у официальной дороже, motion guard только у нашей |
| Негативный промпт | Для Gemini-изображений поля нет ни в одной из 4 нод | список «Avoid» внутри промпта | Документация Google: для Nano Banana параметр не поддерживается; у KIE (схема) его тоже нет; у Kling 2.6 нет нигде. Описывать нужное положительно |

## Карта кода

```
reels_pipeline/   логика без привязки к ComfyUI: prompts.py (мост к promptGenerator.ts), kie_generator.py (Nano Banana),
                  kling_bridge.py (Kling), live_price.py (живая цена и billing), motion_guard.py, preflight.py,
                  telemetry.py (журнал), cli.py, api.py/server.py (шлюзы),
                  kie_capabilities.py (что модель KIE принимает, читается из api_truth/kie/<модель>.schema.json: из неё берут списки
                  значений узлы, шлюз и CLI), node_cards.py (карточки нод и проверка графа по живому /object_info)
api_discovery/    kie_kling/ клиент KIE (createTask, recordInfo, баланс, загрузка файлов) и pydantic-модели
comfy_nodes/      moonbloom_nodes.py (все ноды), bridge_logic.py (мост: цены, правки графа, вкладки, горячий подхват),
                  ui_bridge.py (тонкая оболочка маршрутов, не трогать), hot_reload.py, web/moonbloom_ui.js, тесты test_*.py
workflows/        графы в API-формате, собирает scripts/build_comfy_workflows.py (руками не править)
specs/            карточки сцен (listing45_interiors.json), промпты клипов (listing45_video.json), active_board.json (что на досках)
api_truth/        снимки первоисточников
```
Тесты: `py -3.12 -X utf8 -m pytest comfy_nodes api_discovery/kie_kling -q` (129 проходят; без сети и кредитов). **Размер: минимум 2K** (решение владельца 06.11): узлы предлагают только 2K и 4K, цена зависит от размера (`prices`).

## Ноды (все наши, в официальном списке ComfyUI их нет)

Код: `comfy_nodes/moonbloom_nodes.py`; загрузчик `custom_nodes\moonbloom_reels\__init__.py` (копия до правок `__init__.py.bak-20261104-ui`). Нужны потому, что: официальные «партнёрские» ноды считают кредиты Comfy, а не KIE; промпт должен строить код приложения; платные вызовы требуют `dry_run`, `reuse_existing`, живую цену и журнал.

| Нода | Что делает | Откуда поля | Проверено |
|---|---|---|---|
| `MoonbloomWallpaper` | Обои как референс: превью + путь, текстура Craft Lambda, папка результатов | наш код | живой запуск |
| `MoonbloomDesign` | Дизайн как карточка Batch (стиль, цвет, предмет, свет, ракурс, высота, дистанция, бренд, композиция) + необязательные `camera_body`, `lens`, `aperture`, `depth_of_field` (по умолчанию random, как в приложении); промпт строит `buildGeminiPrompt`; `clean_random_details`, `accessories`, `extra_prompt`, `strip_regex` (правила `stripRegex` карточки спеки, по строке, пробелы значимы: без них промпт доски отличается от промпта спеки), `wall_architecture` (по умолчанию `full-wall`: для форматов кроме 9:16 приложение в 35% сборок выбирает `scallop-trim`, обои только на нижних двух третях стены, для росписи на всю стену это ошибка), `variation` = зерно случайных частей (то же число даёт тот же промпт, в том числе после reload и перезапуска; другое число перебрасывает; `seed` понимает и `scripts/build_batch_prompts.mjs`, без него поведение прежнее) | списки из `promptGenerator.ts` через `scripts/build_batch_prompts.mjs` | живой запуск |
| `MoonbloomListingScene` | Промпт по карточке из `specs/*.json` | спека | живой запуск |
| `MoonbloomKieImage` (платная) | Фото 9:16 на `nano-banana-2-1` (по умолчанию, 6 кр за 2K) или `nano-banana-2` (12 кр); референсы: обои + текстура; превью на холсте 768 px; рядом с результатом `<кадр>.prompt.json` | `api_truth/kie/nano-banana-2*.schema.json` (`prompt`, `image_input`, `aspect_ratio`, `resolution`, `output_format`) | платные кадры 04-05.11, списание всегда совпало с живой ценой |
| `MoonbloomKieGptImage2`, `MoonbloomKieGrokImagineEdit` (платные, 06.11) | Фото на `gpt-image-2-image-to-image` (2K 10 кр, 4K 16 кр, промпт до 20 000, 16 референсов) и `grok-imagine-image-2-0/image-edit` (4 кр плоская, промпт до 8 000, 5 референсов, **без 4:3**, поля размера нет: пиксели смотреть в `.prompt.json`). Те же входы и выходы `image, image_path, report`, что у `MoonbloomKieImage`; класс строится из схемы KIE | `api_truth/kie/<модель>.schema.json` | сухой прогон 06.11 (живые цены 10 и 4) |
| `MoonbloomKieKling` (платная) | Оживление кадра, Kling 2.6, 5 с, без звука = 63 кр (живая цена), `prompt_override` на клип, motion guard с порогом на клип; пробный прогон всегда свежий (`IS_CHANGED` = NaN) | `api_truth/kie/kling-2.6__image-to-video.schema.json` (`prompt`, `image_urls[1]`, `sound`, `duration`) | 2 платных клипа 05.11 |
| `MoonbloomFramePicker` | Видео-доска: выбор готового фото из папки кадров (новые сверху), отдаёт путь, `scene_id`, папку | `specs/listing45_interiors.json` (`out_dir`) или `MOONBLOOM_FRAMES_DIR` | живой запуск |
| `MoonbloomImageFile` | Показать любой кадр и передать его путь | наш код | тест |
| `PreviewImage`, `PreviewAny` ("Preview as Text") | Встроенные: картинка / текст | живой `object_info`, `comfy_extras\nodes_preview_any.py` | живой запуск |

Готовый сторонний пакет `gateway/ComfyUI-Kie-API` (MIT, 0.1.17) существует, но не используется: неизвестно, поддерживает ли `nano-banana-2-1`, `dry_run`, журнал кредитов и motion guard; это код третьего лица, читающий ключ KIE.

## Две доски, по одной вкладке (владелец 05.11)

- **«Moonbloom Фото»** = `workflows/moonbloom_photos_api.json`: Wallpaper -> Design -> KIE Image -> превью, только карточки из `specs/active_board.json` (≤3 цепочек). 12 узлов: у каждой цепочки есть окно отчёта KIE Image (живая цена, баланс, проверка запроса; в `dry_run` картинка пустая заглушка, отчёт единственное, что узел показывает). Билдер проверяет, что формат в Design и в KIE Image одинаковый (два отдельных списка). Каждая KIE Image стартует как `dry_run` (06.11, как и Kling): кнопка Queue в окне сама кредиты не тратит; платная карточка включается по одной через `set` в мосте с числом кредитов. Дефолт `dry_run` у обеих платных нод тоже `true`.
- **«Moonbloom Видео»** = `workflows/moonbloom_video_api.json`: Frame Picker -> Kling -> окно отчёта, только клипы из `specs/active_board.json` (≤2). Каждый Kling стартует как `dry_run`. Фото попадает сюда через папку кадров на диске, не проводом между вкладками.
- **Что такое «промпт» и два режима (06.11).** Промпт = поле `prompt` запроса, **только текст** (картинки-референсы идут отдельным полем `input_urls`/`image_input`/`image_urls` ссылками, 184 символа; размер, формат, качество тоже поля). `Design` с `prompt_mode=full` (по умолчанию) отдаёт промпт сайта `buildGeminiPrompt` (≈5,5 тыс. символов + подписи референсов 727 = 6 188 символов ≈ 1 300 токенов; он написан для генерации комнаты с нуля без референса, 73% общий шаблон, список Avoid из 76 пунктов, «Aspect ratio» в тексте). `prompt_mode=brief` строит `reels_pipeline/prompts.build_brief_prompt` из трёх коротких текстов карточки (`subject`, `scene`, `framing`) + свет и камера из тегов: ≈1,1–1,4 тыс. символов (≈260–330 токенов): что за фото, роли двух референсов по номеру («image 1 = роспись, image 2 = текстура бумаги»), сцена, свет и камера; без шаблона приложения, без Avoid (запреты сказаны положительно), без размера и формата в тексте. Узлам KIE при brief ставится `reference_labels=false` (роли уже в тексте; в режиме full подписи `REFERENCE_IMAGE_1/2` добавляются как раньше). Запись доски `{"id", "model", "prompt": "brief"}` (варианты `brief-nogear`: без камеры и объектива в тексте, `brief-anchor`: одно предложение «воспроизведи image 1 без изменений»; у каждого варианта свой файл `<id>_<вариант>__<тег>.png`). **Правило про роспись («как она сидит на стене») это факт листинга, а не кода:** лежит в спеке листинга, ключ `brief` (`product`, `product_short`, `wall_rule`), без него brief отказывает (не гадает). Листинг 45: «the wall mural … covers the whole feature wall edge to edge»; для обоев с каймой нужно своё `wall_rule` (например, «только нижние две трети стены под волнистой каймой»). Тест сверяет, что текст Листинга 45 совпал с прежним символ в символ (18 из 18). **Основание:** официальные руководства Google (Nano Banana: «Describe what you want, not what you don't», «Control the camera») и OpenAI (GPT Image: размер/качество полями, «scene, subject, details, constraints», «Assign roles to references: identify each input by number and purpose»; `developers.openai.com/api/docs/guides/image-prompting`, `aistudio.google.com/docs/image-generation`). Строгого лимита длины в них нет; что brief не хуже по качеству, проверяется тестом на нашей росписи. Цена не зависит от длины (плоская за картинку у Banana, GPT Image 2 и Grok).
- **Формат карточки:** `aspectRatio` в карточке спеки (`2:3`, `4:3`; нет = формат спеки, `9:16`) переопределяет формат цепочки: билдер ставит его и в Design, и в KIE Image. Роспись Листинга 45 горизонтальная (3:2, 1536x1024): 4:3 ей родной, 2:3 и 9:16 вынуждают модель кадрировать в портрет. Карточки 11-16 (06.11): два раунда по три (доска держит до 3 цепочек, `specs/active_board.json`), в каждом оба формата и все три возраста (до 2 / 2-5 / 6-10).
- **Повтор кадра:** при `reuse_existing` и готовом файле платный запуск вернёт старый кадр за 0 кредитов, а мост умеет менять только `dry_run`. Повтор («камера дальше») = новая карточка `<id>_v2` в `specs/listing45_interiors.json` и в `specs/active_board.json`; старый кадр остаётся на диске. Кадры без `<кадр>.prompt.json` (сделаны до его появления, например 09 и 10 от 05.11) точно повторить нельзя.
- Что на досках, меняется правкой `specs/active_board.json`, затем `py -3.12 -X utf8 scripts/build_comfy_workflows.py` и `POST /moonbloom/open`. Новые доски под каждую идею не создаём. Старая `listing45_girl_nb21_api.json` (все сцены в одном графе на 34 узла) устарела и оставлена только для старых вызовов; `listing45_*_dryrun_api.json` бесплатные, `listing45_interiors_*` платные.
- Тяжёлые прогоны всей доски ради мелочи не запускаем; платные узлы переключаем по одному.

## Мост: граф сразу в окне ComfyUI

Файлы: `comfy_nodes/bridge_logic.py` (логика, подхватывается на лету), `comfy_nodes/ui_bridge.py` (тонкая оболочка маршрутов), `comfy_nodes/web/moonbloom_ui.js` (окно, через `WEB_DIRECTORY`).

- `POST /moonbloom/open {"workflow": "<файл>_api.json", "run": false, "confirm_credits": N, "set": {...}}` открывает граф в **постоянной вкладке этой доски** (`bridge_logic.TAB_TITLES`); новую вкладку мост не создаёт никогда. `set`: `{"<id платной ноды>": {"dry_run": false}}` и `{"<id Frame Picker>": {"frame": "<файл>.png"}}` (имя файла из папки кадров), больше ничего менять нельзя.
- `run=true` на платном графе принимается только при `confirm_credits` равном максимуму, который граф может потратить (`bridge_logic.max_credits`, цены живые; готовые файлы при `reuse_existing` считаются нулём); платная нода, которую нельзя оценить, отклоняется.
- **Окна.** `PromptServer.send_sync` без адресата шлёт событие во ВСЕ подключённые окна (`server.py:1495-1498`), поэтому мост считает окна (`bridge_logic.window_problem`): нет окон = 409 «некому принять» (раньше отвечал `ok`), `run=true` при двух и больше окнах = 409 (иначе платный граф встал бы в очередь в каждом окне, а `confirm_credits` покрывает один прогон). Открытие без `run` в нескольких окнах ничего не стоит. В ответе есть `windows`.
- `POST /moonbloom/reload` применяет правки кода сразу, сбрасывает объекты нод (см. ловушки) и возвращает результат или текст ошибки.
- После каждого открытия JS пишет `ComfyUI\user\default\moonbloom_ui_report.json` (какие вкладки есть): так проверяется, что вкладки не растут.
- Графы собирает `scripts/build_comfy_workflows.py` (проверяет типы проводов, классы, значения combo; провод в combo-поле запрещён: `return_type_mismatch` и нода молча пропускается). Это проверка по нашему же коду. **`--verify-live`** сверяет ещё и с запущенным ComfyUI (`GET /object_info`: входы, лишние поля, типы, значения списков, ссылки), активные доски обязаны пройти, иначе ничего не пишется; сервер не отвечает = ошибка, не копия. Запускать после правки узлов или графов.

## Что подхватывается и когда

| Правка | Когда попадает в ComfyUI |
|---|---|
| Спеки `specs/*.json`, промпты, `Promt/trends.json`, `promptGenerator.ts`, графы в `workflows/` | сразу (графы: открыть командой) |
| Код нод, `bridge_logic.py`, `reels_pipeline/*`, `api_discovery/*` | через 1-2 с или `POST /moonbloom/reload` (ждёт пустую очередь; ошибка = остаётся прежний код, сообщение в окне) |
| `ui_bridge.py`, `hot_reload.py`, загрузчик в `custom_nodes` | после перезапуска инстанса (делает владелец) |
| `moonbloom_ui.js` | после F5 в окне |
| Новое поле у ноды, уже лежащей на холсте | пересоздать ноду; проще открыть граф командой |

## Цены и списание

- Цена всегда живая: `reels_pipeline/live_price.py` читает `GET /api/v1/models/{model}/price` **с ключом** (без ключа KIE отвечает HTTP 200 и `code: 401` внутри), проверяет ответ `{code, msg, data.pricingDesc}` и разбирает числа из текста (KIE даёт цену только текстом). Таблицы `CREDITS` (`kling_bridge.py`) и `CREDITS_2K` (`kie_generator.py`) только запасные: платный Kling при нечитаемой цене отказывается, пробный прогон показывает запасное число с пометкой `price_warning`.
- Списано: `creditsConsumed` готовой задачи (`credits_source = kie_task`), запасом разница баланса; расхождение с названной ценой даёт `billing_warning`.
- Каждый кадр: `<scene_id>__nb21.png` + `<scene_id>__nb21.prompt.json` (точный промпт, что ушло в KIE, референсы, цена, списание; в `buildGeminiPrompt` есть `Math.random`, без файла кадр не повторить). Клип: `<scene_id>__kling26_pushin_9x16.mp4`.

## Платные шаги (правила владельца)

Только после «да» с числом кредитов (число называется заранее из живой цены); сначала `dry_run`; `reuse_existing` включён. Проверять `node_errors`, а не только «success». Баланс и трату сверять по `telemetry.jsonl`. Ключи только из `.env.local`, в чат и логи не выводить. Видео-промпты по скиллу `creative-ad-auditor` (лица не показываем, простой наезд не заказываем, только настоящее движение).

## Недокументированное: риск при обновлении интерфейса

В официальной документации ComfyUI есть: свои сообщения сервера (`PromptServer.send_sync` + `api.addEventListener`), `WEB_DIRECTORY`, Toast API, `app.queuePrompt` (только имя), `app.loadGraphData` («Load a graph»), маршрут `/userdata` (без параметра `overwrite`), события `execution_error`/`execution_success`. `loadGraphData` берёт формат с раскладкой (позиции, заголовки, группы) и тот же аргумент `workflow` (имя вкладки), в исходниках он приходит в тот же `afterLoadNewGraph`, что и `loadApiJson`; наши файлы досок в API-формате без раскладки, и `loadApiJson` раскладывает узлы сам (`rootGraph.arrange()`). Переход на `loadGraphData` с раскладкой возможен, не сделан. **Нет в документации**, проверено по исходникам интерфейса и живым запуском: `app.loadApiJson`, команды `Comfy.RefreshNodeDefinitions` через `app.extensionManager.command.execute`, хранилище вкладок `app.extensionManager.workflow` (`getWorkflowByPath`, `openWorkflow`, `isActive`, `openWorkflows`), запись отчёта через `/userdata/`. После обновления ComfyUI Desktop проверить мост бесплатным открытием обеих досок и отчётом о вкладках; при поломке исправить `moonbloom_ui.js`.

## Ловушки

- **Вкладки:** `app.loadApiJson(граф, имя)` переиспользует вкладку только если вкладка с этим именем активна, иначе создаёт «(2)», «(3)» (`workflowService.ts`). Поэтому мост сначала находит и переключает нужную вкладку.
- **Объекты нод:** ComfyUI создаёт один объект на номер узла и держит его между запусками (`execution.py:499-502`). После горячей замены кода уже запускавшийся узел продолжал работать по СТАРОМУ коду. `POST /moonbloom/reload` ставит официальный флаг `free_memory` (как `POST /free`, `main.py:424`, `e.reset()`), он пересоздаёт объекты.
- **Кэш результатов:** ComfyUI не перезапускает узел с неизменными входами: у `ListingScene`, `Design`, `Wallpaper`, `FramePicker` в `IS_CHANGED` входят время изменения исходников и `CODE_STAMP`; у пробного `Kling` `IS_CHANGED` = NaN (всегда свежий отчёт), у платного кэш остаётся (повторное нажатие не тратит кредиты).
- **KIE отвечает HTTP 200 даже на ошибку:** смотреть `code` в теле (401 нет доступа или нет ключа, 402 нет кредитов, 429 частые запросы, 501 сбой генерации). 401 «not authorized to use this model» = доступ ключа к модели в кабинете KIE.
- **Цена KIE меняется** (Kling 2.6: 55 -> 63 с 05.11): числа в коде не доверять, только живая цена.
- `.pyc` проверяется по секундам и размеру: подхват сначала удаляет кэш изменённых файлов.
- Тесты горячей перезагрузки переимпортируют модули: подменять `requests.get`, а не атрибуты модуля.
- MCP по stdio идёт через stdout, а клиент KIE печатает логи: любой будущий MCP обязан перенаправлять `print` в stderr.
- Файл с настоящим расширением ≠ содержимое: `PreflightShield.inspect_magic_bytes` (причина `code=400` 03.11).

## Как добавить модель KIE (06.11, работает: GPT Image 2 и Grok Imagine 2.0 Edit добавлены так)

Один пайплайн для любой фото-модели KIE с референсами, без кода на модель:
1. **Возможности**: `scripts/comfy_node_info.py kie <модель>` (схема KIE: лимит промпта, поле негативного промпта (у наших трёх его нет, «Avoid» внутри текста), референсы, форматы, размеры, прочие поля) и `scripts/comfy_node_info.py prices` (живая цена одной картинки по 1K / 2K / 4K; «?» = по токенам или неоднозначный текст, платный гард такую модель не запустит).
2. **Снимок схемы**: модель в `KIE_MODELS` (`api_truth/refresh_api_truth.py`), `py -3.12 -X utf8 api_truth/refresh_api_truth.py --only kie`.
3. **Реестр** (`reels_pipeline/kie_generator.py`): тег файла в `MODEL_TAG` (`<сцена>__<тег>.png`) и строка в `OTHER_IMAGE_NODES` (`"ИмяУзла": "модель"`). Узел строит фабрика `make_kie_image_node` (`comfy_nodes/moonbloom_nodes.py`) из схемы: только поля, которые есть у модели (у Grok нет `resolution`), списки значений и подсказки из схемы, 2K минимум (1K не предлагается), `dry_run=true`. Запрос собирает `kie_capabilities.build_input` и проверяет `validate_input` по схеме; общий `KieImageGenerator` (журнал, `.prompt.json`, живая цена, `creditsConsumed`) и `client.create_task` одинаковы для всех моделей. Семейство Nano Banana остаётся одним узлом с выбором `model` и своей pydantic-защитой.
4. **Доска**: в `specs/active_board.json` запись `photos.cards` = id карточки или `{"id", "model"}`; одна карточка на трёх моделях = доска-сравнение (Design и зерно `variation` дают один и тот же текст, файлы по тегам не пересекаются).
5. **Проверка**: `build_comfy_workflows.py --verify-live`, `comfy_node_info.py card <Нода>` (в карточке блок `kie`: возможности модели и живые цены по размерам), `pytest comfy_nodes api_discovery/kie_kling -q`. Новый класс появляется в окне после горячей перезагрузки; чтобы уже стоявшие на холсте узлы начали работать по новому коду, `POST /moonbloom/reload` (ловушка про объекты нод).
6. **Что видно в сухом прогоне** (окно отчёта каждой ноды): `request_preview` = какие поля уйдут и с какими значениями, промпт `N из лимита M` (позитивная часть и список Avoid отдельно), референсы `n из max`, каких обычных полей у модели нет, цена по размерам и выбранная, баланс, итог проверки по схеме. После платного прогона: в `.prompt.json` и журнале измеренный размер в пикселях, эхо параметров от KIE (`param`), кредиты по `creditsConsumed`. **Токены KIE не отдаёт** (ответ по задаче: `creditsConsumed`, `costTime`, `param`, `resultJson`), поэтому `tokens` в журнале пусто; если модель когда-нибудь вернёт их в `resultJson`, они запишутся.
7. **Лимиты промпта.** Полный промпт (6 188 символов) не влезает в модели с лимитом ≤5 000 (Seedream 5 Pro/Flash, Flux 2, Flux 3 Klein, Qwen3, Wan 2.7) и ≤3 000 (Seedream 4.5, 5-Lite). **Brief (≈1,1–1,4 тыс.) влезает во все**; для Seedream и Flux нужна ещё поддержка обязательного поля `quality` в фабрике узлов (сейчас она знает `resolution`).

## План (не сделано, утверждён 05.11)

Раскладка «одна модель = один файл логики + один файл ноды» (`reels_pipeline/providers/kie/{runner,schema_check,capabilities}.py`, `images/*.py`, `videos/*.py`; `comfy_nodes/nodes/**`), способности модели из `api_truth/kie/<модель>.schema.json` (чтение схемы уже сделано 06.11: `reels_pipeline/kie_capabilities.py` лежит на верхнем уровне, а не в `providers/kie/`, потому что горячая перезагрузка смотрит только `reels_pipeline/*.py`; переезд в подпапку требует рекурсивного поиска и перезапуска), первой GPT Image 2 (`gpt-image-2-image-to-image`, 9:16 есть, 10 кр за 2K; у GPT Image 1.5 9:16 нет), потом Seedream, Flux, Hailuo, Wan, Veo, Seedance. Требует рекурсивного поиска в `hot_reload.py` и одного перезапуска ComfyUI. Подробности: запись 2026-11-05 в `AGENTS.md`. Добавление модели по плану: снимок схемы, файл логики, файл ноды, тест, строка в билдере.
