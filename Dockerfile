# Framezen · imagen única (API + web compilada) para Railway, Render o Fly.
# Base: imagen oficial de Playwright con Chromium (para los PDF) y Node. Su versión debe calzar con
# playwright-core del package-lock (hoy 1.64.1); si no calza, los PDF responden 503 y la web
# imprime desde el navegador (nunca se bloquea nada).
FROM mcr.microsoft.com/playwright:v1.64.1-noble AS base
WORKDIR /app
ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false

# ── Compilación: web (Vite → apps/web/dist) y servidor (esbuild → apps/server/dist + migraciones) ──
FROM base AS build
COPY package.json package-lock.json tsconfig.base.json tsconfig.json ./
COPY packages ./packages
COPY apps ./apps
RUN npm ci --include=dev --no-audit
RUN npm run build \
 && test -f apps/web/dist/index.html \
 && test -f apps/server/dist/index.js \
 && ls apps/server/dist/migrations/*.sql > /dev/null

# ── Ejecución: `npm start` sirve /api y la web compilada (con fallback SPA) en $PORT ──
FROM base AS run
# Sin DATABASE_URL se usa PGlite en /app/.data/pg (efímero en el contenedor: en producción usa Postgres).
COPY --from=build --chown=pwuser:pwuser /app /app
USER pwuser
ENV PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "start"]
