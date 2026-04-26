# Docker Health Checks

## Overview

Health checks ensure that services start in the correct order and are fully ready before dependent services attempt to connect. This prevents startup crashes and race conditions in Docker environments.

## Implementation

### MongoDB Health Check

The MongoDB service uses `mongosh` to verify the database is accepting connections:

```yaml
healthcheck:
  test: ["CMD", "mongosh", "--eval", "db.runCommand({ ping: 1 })"]
  interval: 10s
  timeout: 5s
  retries: 5
  start_period: 10s
```

- Checks every 10 seconds
- Times out after 5 seconds
- Retries up to 5 times before marking as unhealthy
- Waits 10 seconds before starting checks (allows MongoDB to initialize)

### Backend Health Check

The backend service uses the `/health` endpoint which checks both database and Stellar connectivity:

```yaml
healthcheck:
  test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:5000/health"]
  interval: 10s
  timeout: 5s
  retries: 5
  start_period: 30s
```

- Checks every 10 seconds
- Times out after 5 seconds
- Retries up to 5 times before marking as unhealthy
- Waits 30 seconds before starting checks (allows Node.js app to start and connect to MongoDB)

The `/health` endpoint returns:
- `200 OK` when both database and Stellar are healthy
- `503 Service Unavailable` when either check fails

### Service Dependencies

Services now use `condition: service_healthy` to ensure proper startup order:

```yaml
backend:
  depends_on:
    mongo:
      condition: service_healthy

frontend:
  depends_on:
    backend:
      condition: service_healthy

backup:
  depends_on:
    mongo:
      condition: service_healthy
```

## Startup Sequence

1. **MongoDB** starts and initializes
2. MongoDB health check passes (responds to ping)
3. **Backend** starts (MongoDB is ready)
4. Backend connects to MongoDB and Stellar
5. Backend health check passes
6. **Frontend** starts (backend is ready)
7. **Backup** service starts (MongoDB is ready)

## Usage

### Start with Health Check Waiting

```bash
docker-compose up --wait
```

This command will:
- Start all services
- Wait for all health checks to pass
- Exit with code 0 when all services are healthy
- Exit with non-zero code if any service fails health checks

### Check Service Health

```bash
# View health status of all services
docker-compose ps

# Check specific service health
docker inspect --format='{{.State.Health.Status}}' <container_name>

# View health check logs
docker inspect --format='{{json .State.Health}}' <container_name> | jq
```

### Manual Health Check Testing

```bash
# Test MongoDB health
docker-compose exec mongo mongosh --eval 'db.runCommand({ ping: 1 })'

# Test backend health
curl http://localhost:5000/health

# Expected response when healthy:
{
  "status": "healthy",
  "timestamp": "2024-03-30T10:00:00.000Z",
  "checks": {
    "database": {
      "status": "healthy",
      "latency_ms": 5
    },
    "stellar": {
      "status": "healthy",
      "latency_ms": 150,
      "network": "testnet",
      "horizonUrl": "https://horizon-testnet.stellar.org"
    }
  }
}
```

## Troubleshooting

### Backend Fails to Start

If the backend health check fails:

1. Check MongoDB is healthy: `docker-compose ps mongo`
2. View backend logs: `docker-compose logs backend`
3. Verify MongoDB connection: `docker-compose exec backend wget -qO- http://localhost:5000/health`

### MongoDB Health Check Fails

If MongoDB health check fails:

1. Check MongoDB logs: `docker-compose logs mongo`
2. Verify MongoDB is running: `docker-compose ps mongo`
3. Test manually: `docker-compose exec mongo mongosh --eval 'db.runCommand({ ping: 1 })'`

### Services Start Out of Order

If services start before dependencies are ready:

1. Verify `depends_on` uses `condition: service_healthy`
2. Check health check configuration (interval, retries, start_period)
3. Increase `start_period` if service needs more initialization time

## Health Check Parameters

- **interval**: Time between health checks
- **timeout**: Maximum time for a single check
- **retries**: Number of consecutive failures before marking unhealthy
- **start_period**: Grace period before health checks begin (allows initialization)

## Best Practices

1. Set `start_period` longer than typical startup time
2. Use reasonable `interval` values (10-30 seconds)
3. Keep `timeout` short (3-10 seconds)
4. Set `retries` to allow for transient failures (3-5)
5. Always use `condition: service_healthy` for critical dependencies
6. Test health checks locally before deploying

## CI/CD Integration

In CI/CD pipelines, use `--wait` to ensure services are ready:

```bash
# Start services and wait for health
docker-compose up -d --wait

# Run tests (services are guaranteed healthy)
npm test

# Cleanup
docker-compose down
```

## Production Considerations

- Health checks add overhead (CPU, network)
- Balance check frequency with resource usage
- Monitor health check failures in production
- Set up alerts for unhealthy services
- Consider using orchestration tools (Kubernetes, Docker Swarm) for advanced health management
