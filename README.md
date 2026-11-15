# Їжак з макітрою

Особиста книга рецептів: mobile-first, одна колонка, на екрані — лише рецепт. Перегляд і
редагування на одній сторінці, режим готування зі свайпами й таймерами.

Один Go-бінарник (gin + GORM + SQLite) з вбудованим React-інтерфейсом. Вхід через Google.

## Запуск для розробки

```sh
cp config.yaml config.local.yaml   # за бажанням
echo 'LOCAL_USER_EMAIL=me@example.com' >> .env   # вхід без Google
make dev        # Go на :8000 (air) + Vite на :3000 з проксі /api
```

Відкрийте http://localhost:3000. Камера та «екран не гасне» вимагають HTTPS — для перевірки
з телефона потрібен тунель або сертифікат.

## Збірка

```sh
make build      # ui/dist, потім ./cookbook
./cookbook -c config.yaml
docker compose up --build
```

Налаштування — `config.yaml`, кожне значення можна перевизначити змінною оточення
(`./cookbook -h`). Для Google потрібен OAuth-клієнт типу «Web application» з redirect URI
`https://<host><prefix>/api/auth/google/callback`.

## Перевірка

```sh
make e2e        # потрібні Python 3 з Pillow, Node і Google Chrome
```

Перевіряє API рецептів і фото та проходить застосунок у браузері (миша й сенсорний екран) на
тимчасовій базі; скриншоти лишаються в теці, яку скрипт друкує наприкінці.

## Матеріали

`docs/handoff/` — вихідний пакет: макети екранів (`design/*.dc.html`), токени, чернетки API й схеми.
