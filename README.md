# Flock Energy — Urja Meter Ops REST API

Node.js/Express REST wrapper for the read-only Urja Meter Ops portal. It turns the portal's observed meter search, transformer list, consumption and location resources into a documented API.

## Run locally

**Requires Node.js 20+ and npm.** Extract the ZIP and open the `flock-energy-api` folder in VS Code.

```bash
npm install
```

Copy `.env.example` to `.env` and set the assignment portal password in `PORTAL_PASSWORD`. Keep `.env` private and never push it to GitHub. Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Start the server:

```bash
npm start
```

Open `http://localhost:3000/docs` for Swagger UI or `http://localhost:3000/health` for the local health check.

## Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/meters?q=J100050&page=1` | Search/list meters |
| GET | `/api/meters/:id` | Meter summary plus available location, energy and transformer data |
| GET | `/api/meters/:id/consumption` | Consumption readings |
| GET | `/api/meters/:id/location` | Location/network information |
| GET | `/api/transformers?page=1` | Paginated transformers |
| GET | `/api/transformers/:code/meters?page=1` | Find meters whose `dtCode` matches transformer `code` |
| GET | `/api/meters/export?page=1` | Return upstream export response |
| GET | `/openapi.json` | OpenAPI 3.0 spec |
| GET | `/docs` | Interactive Swagger UI |

Test with Postman or Swagger UI. Example URLs:

```text
http://localhost:3000/api/meters?q=J100050&page=1
http://localhost:3000/api/meters/J100050
http://localhost:3000/api/meters/J100050/consumption
http://localhost:3000/api/transformers?page=1
http://localhost:3000/api/transformers/DT-011/meters
```

Example response shape (illustrative, not hard-coded):

```json
{"data":[{"meterId":"J100050","serialNo":"HP51466","make":"Secure","phaseType":"single","installStatus":"Decommissioned","dtCode":"DT-011","id":"J100050","serialNumber":"HP51466","phase":"single","status":"Decommissioned","transformerCode":"DT-011"}],"pagination":{"page":1,"pageSize":20,"total":1,"totalPages":1},"query":"J100050"}
```

## Structure

- `src/portal-client.js`: upstream fetches, cookie handling, timeout, short cache.
- `src/normalizers.js`: consistent meter, transformer and energy fields; retains raw fields.
- `src/app.js`: REST routes, validation, error handling, Swagger.
- `src/server.js`: server startup and shutdown.
- `test/`: normalizer and relationship tests.
- `PROTOCOL.md`: observed portal requests and caveats.
- `openapi.json`: public API contract.

## Assumptions and trade-offs

- Express was chosen for a small, inspectable service with no database requirement.
- `meter.dtCode === transformer.code` is the relationship observed in captured data.
- A short process-local cache limits duplicate requests; it is not distributed or persistent.
- Unknown upstream fields are preserved rather than discarded.
- No front end or upstream write operations were added; the required core deliverable is an API service.
- Authentication and the exact `geo`/`energy` response shapes need a live smoke test. These upstream details are isolated in the client so they can be corrected in one place.

## Intentionally omitted / future work

A dashboard, map UI, background synchronization, persistent index and production-grade metrics are omitted as optional extensions. With more time I would verify authentication from a clean session, add integration tests against a controlled upstream fixture, implement retry/backoff and structured logs, and evaluate whether a bulk export can support a local searchable index.

## Reflection

**Assumptions:** I treated the portal as read-only and used the captured JSON fields as the source of truth. I used `dtCode`/`code` as the meter-transformer join key because the values matched in the observed data.

**Most difficult part:** The portal did not provide one documented API for all information. Network captures helped identify separate search, transformer, export, location and energy requests, which I isolated in a client module.

**With another day:** I would verify the login flow and every supporting response against a fresh session, then add integration tests and a local index if useful.

**Mistake:** A captured request is evidence, not a guaranteed contract. I tried to keep upstream-specific assumptions centralized instead of spreading them through route handlers.

**Self-critique:** The login flow and `geo`/`energy` query parameters still need live verification. I would not call the wrapper production-ready until a clean-session integration test passes.

## Tests and checks

```bash
npm test
npm run check
```

## Submission checklist

1. Run the service and test each relevant endpoint in Swagger UI/Postman.
2. Verify login and supporting response shapes against the live portal; update `PROTOCOL.md` with final findings.
3. Ensure `.env` is not committed, then push the project to a **public GitHub repository**.
4. Reply to the assignment email with the repository URL.
