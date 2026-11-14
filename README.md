# Локальный запуск «Орбиты»

1. Установите Node.js 24 и запустите Docker с поддержкой Compose.
2. Скопируйте `.env.example` в `.env` в корне проекта, если файла ещё нет.
3. Выполните в корне проекта:

   ```bash
   docker compose up -d --wait
   npm ci
   npm run db:deploy
   npm run dev
   ```

4. Откройте [Орбиту](http://localhost:3000).
