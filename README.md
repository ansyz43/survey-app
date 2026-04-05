# Survey App — Платформа опросов с AI-аналитикой

Веб-приложение для проведения маркетинговых опросов китайских студентов во Владивостоке с AI-аналитикой (GPT-5.4). Разработано для продакшн-студии, работающей на B2B-рынке (съёмка коммерческих роликов, документалок, бренд-фильмов для китайских компаний).

**Прод:** [vladprod.site](https://vladprod.site)

---

## Стек

| Слой | Технология |
|------|-----------|
| Фреймворк | Next.js 16.2.1 (App Router, React 19) |
| Язык | TypeScript 5 |
| БД | PostgreSQL 16 (Docker) + Prisma 6 ORM |
| AI | OpenAI GPT-5.4 (Responses API, reasoning) |
| Стили | Tailwind CSS 4 |
| Графики | Recharts 3 |
| Экспорт | SheetJS (xlsx) |
| Прокси | Cloudflare Worker (обход блокировки OpenAI из РФ) |
| Процесс-менеджер | PM2 (cluster mode, 2 инстанса) |
| Reverse proxy | Nginx + Let's Encrypt SSL |
| Сервер | Ubuntu 24.04, 2 vCPU, 2 GB RAM + 2 GB swap |

---

## Архитектура

```
┌─────────────┐     ┌──────────────────────────────────────────────┐
│  Браузер    │────▶│  Nginx (SSL, rate limiting)                  │
│  (ZH / RU)  │◀────│    ├─ /api/admin/login    → 3 req/min       │
└─────────────┘     │    ├─ /api/survey/*        → 10 req/sec      │
                    │    ├─ /api/admin/analytics → 30 req/sec      │
                    │    └─ /*                   → proxy_pass :3000 │
                    └──────────────┬───────────────────────────────┘
                                   │
                    ┌──────────────▼───────────────────────────────┐
                    │  Next.js 16 (PM2 cluster × 2)               │
                    │    ├─ App Router (SSR + API Routes)          │
                    │    ├─ Middleware (JWT auth)                   │
                    │    └─ Analytics Pipeline (5 шагов)           │
                    └──────────────┬──────────────┬───────────────┘
                                   │              │
                    ┌──────────────▼──────┐  ┌────▼───────────────┐
                    │  PostgreSQL 16      │  │  Cloudflare Worker │
                    │  (Docker, localhost) │  │  (OpenAI Proxy)    │
                    └─────────────────────┘  └────────────────────┘
```

---

## Модели данных (Prisma)

### SurveyResponse
Каждый заполненный опросник. 16 полей ответов + системные метаданные.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | UUID | PK |
| `sessionId` | String (unique) | Сессия респондента |
| `age` | String? | Возрастная группа |
| `gender` | String? | Пол |
| `occupation` | String? | Род деятельности |
| `paidContentTypes` | String[] | За какой контент платят |
| `monthlySpend` | String? | Месячные траты |
| `platforms` | String[] | Платформы потребления |
| `contentTopics` | String[] | Интересные темы |
| `appealFactors` | String[] | Факторы привлекательности (ранжирование) |
| `vlkContentAware` | String? | Знакомство с VLK-контентом |
| `desiredContent` | String[] | Желаемый контент из VLK |
| `preferredPlatform` | String? | Предпочтительная платформа |
| `buyVlkProduct` | String? | Готовность купить товар VLK |
| `purchaseChannels` | String[] | Каналы покупок |
| `priceWillingness` | String? | Готовность платить |
| `purchaseFactors` | String[] | Факторы покупки (ранжирование) |
| `openProduct` | String? | Открытый вопрос — желаемый продукт |
| `openCity` | String? | Город / провинция |
| `startedAt` | DateTime | Начало заполнения |
| `completedAt` | DateTime? | Завершение |
| `durationSeconds` | Int? | Время заполнения |
| `isSuspicious` | Boolean | Автоматическая метка подозрительности |
| `isPartial` | Boolean | Не завершён |

### Admin
| Поле | Тип | Описание |
|------|-----|----------|
| `id` | UUID | PK |
| `username` | String (unique) | Логин |
| `passwordHash` | String | bcrypt-хеш |

### AnalysisResult
| Поле | Тип | Описание |
|------|-----|----------|
| `id` | UUID | PK |
| `prompt` | String | Фокус анализа |
| `result` | Text | JSON-результат (все 5 шагов) |
| `model` | String | Модель GPT |
| `totalResponses` | Int | Кол-во обработанных ответов |
| `status` | String | `pending` / `running` / `completed` / `failed` |
| `currentStep` | Int | Текущий шаг (0–5) |
| `error` | String? | Описание ошибки |

### AuditLog
| Поле | Тип | Описание |
|------|-----|----------|
| `id` | UUID | PK |
| `action` | String | `login` / `login_failed` / `export` / `analytics_run` |
| `username` | String | Кто выполнил |
| `ip` | String? | IP-адрес |
| `details` | String? | Доп. информация |

---

## API Endpoints

### Опрос (публичные)

| Метод | Path | Описание |
|-------|------|----------|
| `POST` | `/api/survey/start` | Создать сессию, получить `sessionId` |
| `POST` | `/api/survey/answer` | Сохранить ответ (поле + значение). Валидация ответов по question options |
| `POST` | `/api/survey/complete` | Завершить опрос. Считает `durationSeconds`, определяет `isSuspicious` |

### Админка (JWT auth)

| Метод | Path | Описание |
|-------|------|----------|
| `POST` | `/api/admin/login` | Вход (bcrypt). Ставит `admin_token` cookie (JWT, 24ч) |
| `POST` | `/api/admin/logout` | Выход (удаляет cookie) |
| `GET` | `/api/admin/dashboard` | Агрегированная статистика (Prisma groupBy) |
| `GET` | `/api/admin/responses` | Список всех ответов с пагинацией |
| `GET` | `/api/admin/export` | Экспорт в Excel (.xlsx) |
| `POST` | `/api/admin/analytics/run` | Запуск AI-пайплайна (async, возвращает `jobId`) |
| `GET` | `/api/admin/analytics/status/[id]` | Поллинг статуса: `{ status, currentStep, result? }` |
| `GET` | `/api/admin/analytics/history` | История анализов (последние 20 completed) |
| `GET` | `/api/admin/analytics/export` | Экспорт аналитики в Excel |

### Авторизация
- JWT (jose) через middleware.
- Middleware проверяет `admin_token` cookie на всех `/admin/*` и `/api/admin/*` (кроме login/logout).
- Пароль хешируется bcrypt, JWT подписывается `NEXTAUTH_SECRET`.

---

## AI-аналитика: 5-шаговый пайплайн

Асинхронный пайплайн, результаты записываются в БД. Фронт полит `/api/admin/analytics/status/[id]` каждые 3 сек.

| Шаг | Название | GPT? | Reasoning | Что делает |
|-----|----------|------|-----------|-----------|
| 0 | Statistics | Нет | — | Частотные таблицы, кросс-табуляции (χ²), корреляции |
| 1 | ClassifyText | Да | `none` | Классификация открытых ответов в тематические кластеры |
| 2 | BuildPersonas | Да | `high` | 3–5 портретов аудитории на основе кросс-табуляций |
| 3 | DemandMatrix | Да | `medium` | Матрица «спрос × готовность платить» |
| 4 | Recommendations | Да | `high` | Рекомендации, риски, Executive Summary |

**Retry-логика:** 5 попыток с экспоненциальным backoff (3с → 6с → 12с → 24с). Таймаут 5 мин на запрос.

---

## Опросник: 16 вопросов, 5 блоков

| Блок | Название | Вопросы | Типы |
|------|----------|---------|------|
| A | Демография | A1–A3 (возраст, пол, род деятельности) | single |
| B | Потребление контента | B1–B5 (платный контент, траты, платформы, темы, привлекательность) | single, multiple, ranking |
| C | Отношение к Владивостоку | C1–C4 (знакомство, желаемый контент, платформа, покупка) | single, multiple |
| D | Покупательское поведение | D1–D3 (каналы, готовность платить, факторы) | single, multiple, ranking |
| E | Открытые вопросы | E1–E2 (продукт, город) | open |

**Языки:** Китайский (основной для респондентов) + Русский (для админки).

---

## Структура проекта

```
survey-app/
├── prisma/
│   ├── schema.prisma          # Модели данных
│   ├── seed.ts                # Создание администратора
│   └── seed-responses.ts      # Генерация тестовых данных
├── src/
│   ├── app/
│   │   ├── page.tsx           # Главная — выбор языка → начать опрос
│   │   ├── survey/
│   │   │   ├── page.tsx       # Страница опроса (пошаговый wizard)
│   │   │   └── thank-you/     # Спасибо-страница
│   │   ├── admin/
│   │   │   ├── page.tsx       # Логин админа
│   │   │   ├── dashboard/     # Дашборд со статистикой и графиками
│   │   │   ├── responses/     # Таблица ответов
│   │   │   └── analytics/     # AI-аналитика (пайплайн + история)
│   │   │       └── report/[id]/ # Просмотр отдельного отчёта
│   │   └── api/
│   │       ├── survey/        # start, answer, complete
│   │       └── admin/         # login, logout, dashboard, responses,
│   │                          # export, analytics/{run,status,history,export}
│   ├── lib/
│   │   ├── analytics-pipeline.ts  # 5-шаговый GPT пайплайн (async)
│   │   ├── stats.ts              # Серверная статистика (χ², корреляции)
│   │   ├── questions.ts          # 16 вопросов × 2 языка
│   │   ├── auth.ts               # JWT create/verify (jose)
│   │   ├── db.ts                 # Prisma singleton
│   │   ├── audit.ts              # Аудит-лог helper
│   │   └── validation.ts         # Валидация ответов
│   ├── components/                # UI-компоненты
│   ├── middleware.ts              # JWT auth middleware
│   └── types/survey.ts           # TypeScript типы
├── docker-compose.yml             # PostgreSQL 16
├── ecosystem.config.cjs           # PM2 cluster config
├── .env.example                   # Шаблон переменных окружения
└── package.json
```

---

## Переменные окружения

| Переменная | Обязательная | Описание |
|-----------|:----:|----------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string (`?connection_limit=20`) |
| `NEXTAUTH_SECRET` | ✅ | Секрет для подписи JWT (мин. 32 символа) |
| `NEXTAUTH_URL` | ✅ | URL приложения (`https://vladprod.site`) |
| `OPENAI_API_KEY` | ✅ | API-ключ OpenAI |
| `OPENAI_MODEL` | — | Модель GPT (по умолч. `gpt-5.4`) |
| `OPENAI_BASE_URL` | ✅* | URL прокси для OpenAI (обязательно из РФ) |
| `ADMIN_USERNAME` | — | Логин админа для seed (по умолч. `admin`) |
| `ADMIN_PASSWORD` | — | Пароль админа для seed (по умолч. `admin123`) |
| `POSTGRES_PASSWORD` | ✅ | Пароль PostgreSQL (для docker-compose) |
| `SEED_COUNT` | — | Кол-во тестовых ответов для seed (по умолч. `3255`) |

\* Обязательно при деплое в РФ (api.openai.com заблокирован).

---

## Быстрый старт (development)

```bash
# 1. Клонировать
git clone https://github.com/ansyz43/survey-app.git
cd survey-app

# 2. Установить зависимости
npm install

# 3. Скопировать .env
cp .env.example .env
# Заполнить значения в .env

# 4. Запустить PostgreSQL
docker compose up -d

# 5. Применить схему + создать админа
npx prisma db push
npm run db:seed

# 6. (Опционально) Засеять тестовые ответы
npx tsx prisma/seed-responses.ts

# 7. Запуск
npm run dev
```

Приложение: [http://localhost:3000](http://localhost:3000)
Админка: [http://localhost:3000/admin](http://localhost:3000/admin)

---

## Деплой (production)

```bash
# На сервере (Ubuntu)
git clone https://github.com/ansyz43/survey-app.git /opt/survey-app
cd /opt/survey-app
npm install
cp .env.example .env    # заполнить реальные значения

# Postgres
docker compose up -d

# Миграция + сид
npx prisma db push
npm run db:seed

# Сборка
npm run build

# PM2 (cluster mode, 2 инстанса)
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup

# Nginx + SSL (Let's Encrypt)
# Настроить reverse proxy → localhost:3000
# Настроить rate limiting (см. архитектуру)
```

---

## Безопасность

- JWT-аутентификация (jose, HS256) с обязательным `NEXTAUTH_SECRET`
- bcrypt-хеширование паролей
- Валидация ответов: значения проверяются по допустимым option ID
- Rate limiting (Nginx): логин 3 req/min, опрос 10 req/sec, API 30 req/sec
- Аудит-лог всех admin-действий (login, export, analytics)
- PostgreSQL слушает только localhost (127.0.0.1)
- Пароль БД через переменные окружения, не в коде
- Connection pool ограничен (20 соединений)
- PM2 cluster mode с auto-restart

---

## Лицензия

Private. Все права защищены.
