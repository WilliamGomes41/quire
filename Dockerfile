# Self-hosted Quire: Node server build (Nitro node-server preset) + Postgres via DATABASE_URL.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
COPY --from=build /app/.output ./.output
# Print reads the sheet faces from ./fonts at runtime.
COPY --from=build /app/fonts ./fonts
# Some hosts check files out with a restrictive umask; the app runs as node, not root.
RUN chmod -R a+rX .output fonts
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", ".output/server/index.mjs"]
