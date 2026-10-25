# Urja Meter Ops protocol notes

The portal is treated as read-only. Findings below are based on browser Network captures shared during exploration; supporting query parameters can change and should be rechecked before final submission.

## Observed upstream requests

| Request | Observed behaviour |
|---|---|
| `GET /portal/search?q=<query>&page=<n>` | Meter list/search JSON. Envelope includes `data`, `total`, `page`, `pageSize`. Invalid/unmatched search produced an empty `data` array. |
| `GET /portal/dts?page=<n>` | Paginated transformer JSON. Fields observed include `code`, `name`, `feederCode`, `capacityKva`. The UI has pagination but no visible search or row-click behaviour. |
| `GET /portal/keys` | Seen during the “Export all meters” flow. |
| `GET /portal/export?page=1` | Export flow returned a response with `total: 403` and nested meter/network records. |
| `GET /portal/geo` | Supporting request associated with meter location/network information; observed Network entry had no visible query string. |
| `GET /portal/energy` | Supporting request associated with consumption; observed Network entry had no visible query string. Fields include `timestamp`, `kWh`, `kVAh`, `voltR`. |

## Relationship

Meter records expose `dtCode`; transformer records expose `code`. The observed join key is `meter.dtCode === transformer.code`. For example, meter `J100050` had `dtCode: DT-011`, and the transformer dataset includes transformer code `DT-011`. The service uses this key to enrich meter detail and expose a transformer-to-meters query. A paginated transformer page is not necessarily the complete transformer dataset.

## Authentication and caveats

The portal requires the operator login provided with the assignment. The client attempts a cookie-based form login and retains `Set-Cookie` values. If the real login flow uses a different path, field names, CSRF mechanism, or SvelteKit action, adjust `PORTAL_LOGIN_PATH` and `_login()` in `src/portal-client.js`, or provide a valid `PORTAL_SESSION_COOKIE` through `.env` after establishing an authorized session.

Search and transformer list responses are JSON. Invalid meter search returns no results rather than necessarily raising an HTTP error. The export endpoint may return a different response shape from the paginated table. Location and energy were observed as requests without visible query strings. The wrapper fetches these resources and filters by a meter identifier when the response records contain a meter ID field; confirm the live response shape before treating this as complete.
