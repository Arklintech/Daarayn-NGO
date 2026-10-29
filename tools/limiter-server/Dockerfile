# Google request coordinator (single instance, durable disk). See docs/ops/LIMITER_SERVICE_DEPLOYMENT.md.
# Build from the repository root:  docker build -f tools/limiter-server/Dockerfile -t daarayn-limiter .
FROM node:22-alpine
WORKDIR /app
COPY tools/limiter-server/server.cjs tools/limiter-server/gcra.cjs ./
# State directory: mount a DURABLE volume here. Without one, every restart is a state loss and is quarantined for LIMITER_QUARANTINE_MS.
RUN mkdir -p /data && chown node:node /data
VOLUME /data
ENV PORT=8787 \
    LIMITER_STATE_FILE=/data/limiter-state.json \
    LIMITER_REQUIRE_HTTPS=true \
    LIMITER_QUARANTINE_MS=75000
# LIMITER_TOKEN must be supplied at run time from the platform's secret store (never baked into the image).
USER node
EXPOSE 8787
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s CMD wget -qO- http://127.0.0.1:8787/health >/dev/null || exit 1
CMD ["node", "server.cjs"]
