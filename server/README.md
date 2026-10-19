# Заявки с сайта в Telegram-бота

Форма на сайте отправляет заявку на маленькую серверную функцию, а та пересылает её боту.
Посетителю никуда переходить не нужно. Токен бота хранится только в настройках функции,
на сайте и в репозитории его нет.

Посетитель пишет имя, отмечает, куда ему ответить (Telegram, почта или телефон), и текст заявки.
Пока функция не подключена, форма показывает ошибку отправки.

Повторная отправка той же заявки (вкладку свернули на середине, сменилась сеть, второй клик)
в бота второй раз не приходит: у заявки свой номер, функция помнит отправленные 15 минут.

## 1. Узнать свой chat id

1. Напиши своему боту в Telegram команду `/start`.
2. Открой в браузере `https://api.telegram.org/bot<ТОКЕН>/getUpdates`, подставив токен бота.
3. Найди в ответе `"chat":{"id":123456789` — это число и есть `CHAT_ID`.

## 2. Развернуть функцию (один из вариантов)

### Вариант А: Яндекс Облако

1. console.yandex.cloud → Cloud Functions → Создать функцию.
2. Среда выполнения Node.js 18 или новее, точка входа `index.handler`, код из `yandex-cloud-function/index.js`.
3. Переменные окружения: `BOT_TOKEN`, `CHAT_ID`, `ALLOWED_ORIGIN` = `https://d1fast.github.io`.
4. Поставь галочку «Публичная функция» и скопируй её адрес `https://functions.yandexcloud.net/...`.

Для Яндекс Облака нужен платёжный аккаунт. Бесплатного объёма для формы хватает с запасом.

### Вариант Б: Cloudflare Workers (без карты)

1. dash.cloudflare.com → Workers & Pages → Create → Worker.
2. Вставь код из `cloudflare-worker/worker.js`, нажми Deploy.
3. Settings → Variables and Secrets: `BOT_TOKEN` (как Secret), `CHAT_ID`, `ALLOWED_ORIGIN` = `https://d1fast.github.io`.
4. Скопируй адрес воркера `https://....workers.dev`.

## 3. Подключить к сайту

GitHub → репозиторий → Settings → Secrets and variables → Actions → вкладка Variables →
New repository variable: имя `PUBLIC_FORM_ENDPOINT`, значение — адрес функции.
Потом Actions → Deploy to GitHub Pages → Run workflow (или любой новый коммит).

После этого заявки приходят в бота, а посетитель видит «Получил! Отвечу в тот же день».

## Обновить код функции

Когда меняется `cloudflare-worker/worker.js`: dash.cloudflare.com → Workers & Pages → воркер →
Edit code → заменить весь код новым → Deploy. Переменные и секрет остаются как были.
