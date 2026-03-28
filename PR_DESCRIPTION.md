# Add Verify Transaction UI to Pay Fees Page

Closes #230

## Summary

`POST /api/payments/verify` existed but had no frontend interface. Parents had no way to confirm their payment was recorded without contacting the school. This PR adds a Verify Payment section to the pay-fees page.
# Add Dockerfile for Frontend Service

Closes #235

## Summary

`docker-compose.yml` references `build: ./frontend` but no `Dockerfile` existed, causing `docker compose up` to fail for the frontend service. This PR adds the missing file along with the required Next.js config for standalone output.

## Changes

### New Files

| File | Description |
| ---- | ----------- |
| [`frontend/src/components/VerifyPayment.jsx`](frontend/src/components/VerifyPayment.jsx) | Self-contained verify form — input, submit, result display, error handling |
| [`frontend/Dockerfile`](frontend/Dockerfile) | Multi-stage Docker build for the Next.js frontend |
| [`frontend/next.config.js`](frontend/next.config.js) | Enables `output: 'standalone'` required by the Docker runner stage |

### Modified Files

| File | Description |
| ---- | ----------- |
| [`frontend/src/pages/pay-fees.jsx`](frontend/src/pages/pay-fees.jsx) | Renders `<VerifyPayment />` below the payment instructions section |

## Behaviour

- Parent enters a transaction hash and clicks Verify
- On success: shows amount, asset, student ID (memo), date, fee validation status, and network fee
- On error: displays the API error message (e.g. `MISSING_MEMO`, `TX_FAILED`, `INVALID_DESTINATION`) or a fallback message
- Fee validation status is colour-coded: green (valid), orange (overpaid), red (underpaid)

## Acceptance Criteria

- [x] Parents can enter a tx hash and see confirmation details
- [x] Invalid or unrecognised hashes show a clear error
- [x] Successful verification shows amount, memo, and date
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
