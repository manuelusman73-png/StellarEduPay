# Add Dockerfile for Frontend Service

Closes #235

## Summary

`docker-compose.yml` references `build: ./frontend` but no `Dockerfile` existed, causing `docker compose up` to fail for the frontend service. This PR adds the missing file along with the required Next.js config for standalone output.

## Changes

### New Files

| File | Description |
| ---- | ----------- |
| [`frontend/Dockerfile`](frontend/Dockerfile) | Multi-stage Docker build for the Next.js frontend |
| [`frontend/next.config.js`](frontend/next.config.js) | Enables `output: 'standalone'` required by the Docker runner stage |

### Modified Files

| File | Description |
| ---- | ----------- |
| [`docker-compose.yml`](docker-compose.yml) | Passes `NEXT_PUBLIC_API_URL` as a build arg so it is baked in at build time |

## Implementation Details

- Two-stage build: `builder` compiles the Next.js app, `runner` serves only the standalone output (smaller final image)
- `NEXT_PUBLIC_API_URL` is passed as a `ARG`/`ENV` during the build stage — Next.js inlines `NEXT_PUBLIC_*` vars at compile time, so a runtime `environment:` entry alone is not sufficient
- Runs as a non-root user (`appuser`) for security
- `output: 'standalone'` in `next.config.js` produces a self-contained `server.js` with minimal dependencies

## Acceptance Criteria

- [x] `docker compose up` builds and starts the frontend container successfully
- [x] Frontend is accessible at `http://localhost:3000`
- [x] `NEXT_PUBLIC_API_URL` is correctly injected at build time
