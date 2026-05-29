FROM node:18-alpine

# Install curl for health checks
RUN apk add --no-cache curl

# Create a non-root user to run the app
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Install dependencies first (layer cache)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY src/ ./src/

# Own everything as the non-root user
RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 5000

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:${PORT:-5000}/health || exit 1

CMD ["npm", "start"]
