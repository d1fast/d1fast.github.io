# Разработка

## Запуск

Node.js 22.12+ или 24 и npm. В CI используется Node 22.

```bash
npm ci
ASTRO_TELEMETRY_DISABLED=1 npm run dev
```

Dev слушает порт 4321. Для production-сборки:

```bash
ASTRO_TELEMETRY_DISABLED=1 npm run check
ASTRO_TELEMETRY_DISABLED=1 npm run build
npm run preview -- --port 4322
```

Форма получает публичный адрес существующего Cloudflare Worker из PUBLIC_FORM_ENDPOINT во время сборки. Без него интерфейс доступен, но обращение не отправляется. Токен Telegram хранится только в Cloudflare.

## Устройство

- src/components/Portfolio.astro: главная, кнопки работ и содержимое окон.
- src/components/ContactForm.astro: форма; src/scripts/form.ts: валидация, отправка и повтор с тем же номером заявки при ошибке сети.
- src/scripts/portfolio.ts: открытие окон, история браузера, фокус, аккордеон, воспроизведение и перемотка видео.
- SVG в Portfolio.astro и CSS в portfolio.css: фон, плавное появление страницы и цельный росчерк. Canvas, WebGL, ASCII и hover-превью не используются.
- src/layouts/Base.astro: выбор RU/EN по navigator.languages до отрисовки страницы, без cookies и localStorage. Путь, параметры и открытое окно сохраняются при переходе.
- src/styles/portfolio.css: главная и окна; tokens.css: общая палитра и размеры; global.css: базовые элементы; pages.css: прямые ссылки на кейс, политику и 404.
- src/i18n/ru.ts и en.ts: тексты интерфейса; src/config.ts: адрес формы.
- src/content/work/: данные проектов, по ru.md и en.md; public/work/: используемые сайтом медиа.
- demos/: исходники демонстраций для записи; server/: приёмники формы. Основной вариант Cloudflare Worker, альтернативный Yandex Cloud Functions.

Главная использует один dialog. Её фон и положение сохраняются при открытии работ, рассказа и формы. Escape и кнопка «Назад» закрывают окно, фокус возвращается на открывшую его кнопку. Переход из формы к политике сохраняет введённые данные. Видео не скачиваются заранее и останавливаются при закрытии или смене кейса.

Системная настройка prefers-reduced-motion не отключает анимации по явному пожеланию владельца. Автопереходов между окнами нет. Не возвращать старый перехват колеса и свайпов.

## Проверки

Нужен установленный Chromium или браузер Playwright. Можно задать CHROMIUM_PATH. В облачной среде браузер и локальный сервер запускаются с доступом к системным сокетам.

```bash
CHECK_URL=http://127.0.0.1:4322 node scripts/smoke.mjs
CHECK_URL=http://127.0.0.1:4322 node scripts/animation-check.mjs
CHECK_URL=http://127.0.0.1:4322 node scripts/locale-check.mjs
node scripts/shots.mjs http://127.0.0.1:4322 / '/?about#about' '/?case#work-perfume' '/?contact#contact'
```

smoke проверяет RU и EN на компьютере и телефоне: три кейса, видео и перемотку, историю, фокус, политику и сохранение текста формы. Все POST-запросы перехватываются; настоящие сообщения не отправляются. Отдельно проверяются ширина 320px и прямые ссылки. animation-check проверяет плавное появление, доступность кнопок во время входа и движение при prefers-reduced-motion: reduce и отключённом Canvas. locale-check проверяет выбор языка, прямые ссылки и отсутствие сохранённых предпочтений.

Скриншоты сохраняются в игнорируемой папке shots/. Для публичного сайта в среде с обязательным прокси можно задать BROWSER_PROXY=1: браузер возьмёт наследованный HTTPS_PROXY или HTTP_PROXY.

## Медиа

```bash
python3 -m http.server 4330 --bind 127.0.0.1
node scripts/record-works.mjs coffee
node scripts/record-works.mjs tg
```

Нужны ffmpeg и Chromium. Сцены перематываются через window.__seek(t), запись не зависит от скорости проигрывания. Скрипт обновляет ролики, постеры и кадры. Фотографии кофейни находятся в demos/coffee/images/, источники перечислены в SOURCES.md. Поле revision добавляет номер к файлам для обновления кэша. Этот номер нужно согласовать с путями в src/content/work/pena/.

`npm run og` обновляет картинки ссылок и иконки при работающем dev-сервере. Для другого адреса: `node scripts/og.mjs http://localhost:4322/`. Иконки генерируются из векторного public/favicon.svg сразу в целевом размере. Шрифты лежат локально, лицензии Golos Text и Yeseva One находятся рядом с файлами.

Новый проект добавляется папкой src/content/work/<slug>/ с ru.md, en.md и путями к медиа. Порядок задаётся order. portrait: true отмечает вертикальные кадры; draft: true скрывает проект. page: false отключает отдельную подробную страницу, но сохраняет окно на главной.

## Публикация и приватность

Пуш в main запускает .github/workflows/deploy.yml и публикует dist/ на GitHub Pages. PUBLIC_FORM_ENDPOINT передаётся из GitHub Actions Variables. demos/ и server/ в сборку не входят.

GitHub Free предоставляет Pages для публичных репозиториев. Публикация из приватного репозитория доступна на подходящих платных планах, включая GitHub Pro. Опубликованный сайт остаётся общедоступным. Перед сменой видимости нужно проверить план и условия Pages.

Другой вариант: приватный репозиторий и Cloudflare Pages с командой npm run build и папкой dist. При переносе надо согласованно обновить адрес сайта и ALLOWED_ORIGIN воркера. Сам по себе такой перенос не выполняется.

Браузер получает HTML, CSS, JavaScript и медиа. Приватный репозиторий скрывает исходный проект и историю, но не код, который скачивает посетитель.
