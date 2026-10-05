# EKDK.DK

Next.js App Router controller workspace, using the supplied SVG as the overview's visual reference. Workspace access is server-gated behind VATSIM OAuth through Auth.js. No guest mode or authentication bypass is shipped.

## Run locally

1. `npm install`
2. Copy `.env.example` to `.env.local`.
3. Generate an authentication secret with `npx auth secret` (or a cryptographically random 32-byte secret).
4. Register a VATSIM Connect OAuth application and add its client ID and secret. Register `http://localhost:3000/api/auth/callback/vatsim` as the local callback, and the equivalent HTTPS URL for production. Request `full_name` and `vatsim_details` scopes.
5. Set `AUTH_URL` to the site's canonical URL. Set `VATSIM_USE_SANDBOX=true` only when using a client registered with the VATSIM development authentication service; production and sandbox credentials are not interchangeable.
6. `npm run dev`

Without credentials, the public sign-in page explains the configuration requirement and the workspace stays locked. Production requires HTTPS and a strong `AUTH_SECRET`; do not expose these variables through `NEXT_PUBLIC_`.

## Available workflows

- Airport-card overview based on the supplied SVG, with nine airport workspaces: EKCH, EKBI, EKYT, EKAH, EKRK, EKSB, EKRN, EKSP and EKOD. Compact cards show only runway geometry and Open workspace.
- Search airport IDs, names, aliases and runway/procedure queries, including `cph 22l ils` and `EKSB`. Ambiguous runways are selectable.
- Airport, approach, chart, weather, procedure, tool and pinned views share persistent navigation and airport context.
- Pin references, switch open items and retain chart zoom, rotation and scroll position for the browser session.
- `Ctrl/Cmd+K` focuses search; arrow keys select results; Enter opens; Escape dismisses.
- The person icon beside the UTC clock opens account settings. Choose Light, Dark or System appearance; the preference is remembered on this device. Dark mode uses the supplied negative logo while official PDF chart artwork retains its source colors.

## Operational content

Charts are resolved server-side with `naviair-charts`, including applicable approach variants. Authenticated users view official Naviair PDFs within the workspace using PDF.js, or open the original source. The authenticated proxy accepts only supported airports and filenames from the current catalogue, restricts upstream URLs to official Naviair PDFs, and validates file type and size. Node.js 22.13 or newer is required. PDF worker, font and CMap assets are copied automatically on install/build.

Runway schematics project published WGS-84 threshold coordinates, cross-checked against official Naviair aerodrome charts. Lengths and surfaces come from AIP AD 2 runway physical characteristics. Geometry is a reviewed snapshot, not an automatically current chart: use `npm run update:runways` to download current source documents and regenerate, then visually review the resulting diagrams and source data before release. Source provenance is stored in `src/lib/runway-data.json`. Schematics exaggerate widths and omit taxiways; they are not navigation charts. Source documents remain accessible in the chart library.

Weather is retrieved from `https://metar.vatsim.net/{icao}` through an authenticated endpoint, refreshed each minute. Wind, pressure, visibility, cloud, temperature and dew point are decoded from the observation portion; raw METAR and original-source access remain available. Observation age is shown, reports older than 90 minutes are marked stale, and fetch failures explicitly identify retained cached observations. The service does not provide TAF. ILS course, localizer frequency and identifier are automatically extracted from current Naviair chart PDFs on demand and checked every 15 minutes while the reference is open. Source URL/revision changes invalidate cached extraction. Course comes from the magnetic final-approach profile; radio values come from the LOC box. Coding-table supplements are distinguished from primary charts. Missing or conflicting values remain unavailable, and individual primary chart variants can be selected and opened. Approved local procedures remain unavailable. This workspace is for VATSIM only, not real-world navigation.

The runway in use is resolved server-side every minute in priority order: (1) VATSIM ATIS (`ICAO_A_ATIS`, `ICAO_D_ATIS` or `ICAO_ATIS` from `https://data.vatsim.net/v3/afv-atis-data.json`), (2) the runway with most headwind from the VATSIM METAR, (3) a preferred runway when the wind is calm or variable. EKCH wind selection stays on the preferential runways 04L/R and 22L/R until their crosswind exceeds 15 kt (AIP AD 2.21); parallel runways resolve to the AIP AD 2.19 ILS runway. The AIP publishes no calm-wind preferred runway, so `calmPreferredRunways` in `src/lib/runway-selection.js` is empty until the applicable VATSIM Scandinavia procedures are added. The airport runway selector and working configuration follow the runway in use until changed manually, and always show their source.

VATSIM authentication proves membership only; no controller rating or division restriction is currently imposed. Add a server-side authorization policy if needed. Future private data APIs must independently verify `auth()`; the protected layout guards pages, not arbitrary future endpoints.

Auth.js assigns its own internal UUID to each user. The VATSIM provider account ID is therefore stored separately as `vatsimCid` in the encrypted session token and exposed as the workspace member ID. Both the sign-in page and workspace use the same CID validation policy. Sessions created before this policy must sign in again; they are returned to the login page without a redirect loop.

## Deploy with Docker / Portainer

The `Dockerfile` builds a standalone Next.js image running as a non-root user on port 3000. GitHub Actions builds it on every push to `master` and publishes `ghcr.io/bjerrecs/ekdk:latest` (plus a tag per commit SHA). `docker-compose.yml` is a ready-made Portainer stack that pulls that image.

1. In Portainer, go to **Stacks → Add stack** and paste `docker-compose.yml` into the web editor (or use **Repository** with compose path `docker-compose.yml`). Set `EKDK_TAG` to a commit SHA to pin a version; to update, redeploy the stack with re-pull enabled.
2. Under **Environment variables**, set `APP_HOST` (public hostname, e.g. `ekdk.dk`), `AUTH_SECRET`, `VATSIM_CLIENT_ID` and `VATSIM_CLIENT_SECRET`. Optional: `VATSIM_USE_SANDBOX`, `EKDK_TAG`.
3. The stack joins the external `proxy` network and carries Traefik labels for the proxy stack in [bjerrecs/infra](https://github.com/bjerrecs/infra/tree/main/stacks/proxy), which terminates HTTPS with Let's Encrypt. Point `APP_HOST`'s DNS at the proxy host and register `https://<APP_HOST>/api/auth/callback/vatsim` with VATSIM Connect.

`AUTH_TRUST_HOST=true` is set by default in the stack so Auth.js accepts proxied requests. The container runs with a read-only filesystem.

## Validation


`npm test` · `npm run typecheck` · `npm run build`

`npm run verify:ils` downloads the current ILS charts for all supported airports, audits extraction and variant agreement, and fails if any published ILS reference is incomplete. Extracted source text is saved under ignored `tmp/ils/` for inspection. The running app performs extraction automatically; no scheduled job is required.
