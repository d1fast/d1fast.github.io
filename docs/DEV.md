# Разработка

## Запуск и проверка

Node.js 22.12+ или 24, npm. В CI используется Node 22. Установка из зафиксированного lockfile:

```bash
npm ci
npm run dev
```

В облачной среде без домашней папки запускать с `ASTRO_TELEMETRY_DISABLED=1`.

```bash
ASTRO_TELEMETRY_DISABLED=1 npm run check
ASTRO_TELEMETRY_DISABLED=1 npm run build
npm run preview
```

Dev и preview по умолчанию слушают порт 4321. Сборка находится в dist/. Для формы при сборке нужна публичная переменная PUBLIC_FORM_ENDPOINT с адресом существующего Cloudflare Worker. Без неё сайт запускается, но заявка не отправляется. Токен бота хранится только в Cloudflare.

## Устройство

- src/pages/: маршруты RU и EN, политика, 404 и страница кейса.
- src/components/Hero.astro, src/styles/hero.css, src/scripts/hero.ts: первый экран. hero-sculpture.ts строит объёмную ленту и освещение без внешних моделей.
- src/blocks/: самостоятельные разделы, каждый со своими шаблоном, стилями и скриптом.
- src/scripts/stage.ts: переходы разделов и жесты. block.ts: жизненный цикл и помощники анимации.
- src/scripts/main.ts: подключение общих скриптов и отложенная загрузка разделов.
- src/i18n/: тексты интерфейса. src/config.ts: публичные настройки.
- src/content/work/: данные проектов, по ru.md и en.md на проект.
- public/work/: медиа, которые показываются на сайте. Это не временные скриншоты.
- demos/: исходники демонстрационных проектов для записи медиа.
- server/: отдельные приёмники формы. Основной вариант: Cloudflare Worker. Альтернативный вариант: Yandex Cloud Functions.

## Скриншоты

Скрипты используют установленный Chromium, иначе браузер Playwright. Можно задать CHROMIUM_PATH. В этой облачной среде Chromium и локальный сервер нужно запускать с доступом к системным сокетам.

```bash
npm run shots
SHOT_SCROLL='#works' npm run shots
SHOT_SCROLL='#contacts' SHOT_WAIT=11000 npm run shots
node scripts/smoke.mjs
```

Для проверки production-сборки: `CHECK_URL=http://127.0.0.1:4322 node scripts/smoke.mjs` при работающем `npm run preview -- --port 4322`. Скриншоты сохраняются в shots/, папка игнорируется Git. smoke проверяет переходы, мобильную галерею, колесо и форму с подменённым ответом сервера. Настоящие заявки не отправляются.

## Обновление демонстрационных медиа

```bash
python3 -m http.server 4330 --bind 127.0.0.1
node scripts/record-works.mjs coffee
node scripts/record-works.mjs tg
```

Нужны ffmpeg и Chromium. Сцены перематываются через window.__seek(t), запись не зависит от скорости воспроизведения. Скрипт обновляет видео, постер, настольные и мобильные кадры. Фотографии кофейни находятся в demos/coffee/images/, источники указаны в SOURCES.md.

`npm run og` обновляет картинки ссылок для обеих языковых версий и иконки. Нужен работающий сайт. BASE_PATH и SITE_URL позволяют собирать в подпапку или под другой домен.

## Добавление проекта

Создать src/content/work/<slug>/ru.md и en.md по примеру perfume/. Добавить медиа в public/work/<slug>/. Для вертикальных кадров указать portrait: true. concept: true помечает учебный или придуманный проект. page: false отключает отдельную страницу кейса. draft: true скрывает проект.

## Публикация и приватность

Пуш в main запускает .github/workflows/deploy.yml и публикацию dist/ на GitHub Pages. Исходники demos/ и server/ не входят в dist/. Адрес PUBLIC_FORM_ENDPOINT передаётся из GitHub Actions Variables.

GitHub Free предоставляет Pages для публичных репозиториев. Pages из приватного репозитория доступны на подходящих платных планах, в том числе GitHub Pro. При этом опубликованный сайт остаётся общедоступным. Перед сменой видимости проверить план аккаунта и доступность Pages.

Альтернатива: приватный репозиторий и Cloudflare Pages, с командой сборки npm run build и папкой dist. Адрес сайта и ALLOWED_ORIGIN воркера тогда нужно обновить согласованно. Перенос хостинга не выполняется автоматически.

Браузер в любом случае получает HTML, CSS, клиентский JavaScript и медиа. Приватность репозитория скрывает исходный проект и историю, но не скачанный код сайта. Токен Telegram должен оставаться на стороне воркера.
