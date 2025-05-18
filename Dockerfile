FROM node:23-slim as base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl

FROM base AS prod

ARG NEXT_PUBLIC_PAYPAL_CLIENT_ID

COPY pnpm-*.yaml /app
RUN pnpm fetch

COPY . /app
RUN pnpm dlx prisma generate
RUN pnpm run build

FROM base
RUN corepack enable

COPY --from=prod /app/prisma ./prisma
COPY --from=prod /app/node_modules ./node_modules
COPY --from=prod /app/public ./public

COPY --from=prod /app/.next/standalone ./
COPY --from=prod /app/.next/static ./.next/static

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production
ENV HOSTNAME="0.0.0.0"

CMD ["pnpm", "start-docker"]
