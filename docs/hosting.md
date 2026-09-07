# Could we host a small free version?

**Recommendation: release the local app first. A hosted version is a separate project phase, not a Vercel configuration change.** A free-to-users pilot may be possible, but a small audience does not guarantee zero operating cost or eligibility for a free hosting plan. No hosted service, Clerk integration or cloud secret store is implemented here.

En español: primero publicamos la app local. Una versión web compartida necesita cambios importantes. Que sea gratis para el usuario no significa que alojarla sea gratis. Todavía no existe esa versión alojada.

## Why the current app does not fit Vercel unchanged

The source starts a long-running Bun server, polls GexBot roughly every ten seconds, keeps shared in-memory live/replay state, streams updates with SSE, writes local SQLite, and executes macOS commands for notifications. It has no authentication and one shared settings/alert/history space.

Vercel Functions have finite execution lifetimes and ephemeral storage; their documented model does not support keeping this local SQLite database as persistent application storage. A function invocation is not a replacement for the always-running collector. See [function limits](https://vercel.com/docs/functions/limitations) and [Vercel's SQLite guidance](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel).

Vercel Hobby cron is not suitable for a ten-second market-data collector. Check its current [cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing). Hobby is restricted to personal, non-commercial use; a public community tool is not automatically eligible just because users are not charged. Confirm eligibility and quotas before selecting a plan ([Hobby documentation](https://vercel.com/docs/plans/hobby)). Reviewed 2026-09-07; recheck at implementation time.

## Practical options

| Option | Work required | Tradeoff |
| --- | --- | --- |
| Current local app | This release's onboarding and optional updates | No shared hosting bill or central custody of keys; each user's computer must run it. |
| Static demonstration on Vercel | Add a genuinely offline fixture/demo mode and remove authenticated market calls from that demo | A useful free preview, but no live data, live recording or native alerts. Existing MOCK mode cannot serve as an offline demo. |
| Invite-only live hosted pilot | Web frontend plus a persistent collector, durable database, authenticated API and per-user state | Central operations and possible cost, even with few users. Vercel can host the frontend; the continuous worker needs an appropriate host. |

For a live pilot, first settle **who owns the data entitlement**: each user brings a key, or the operator obtains permission for a shared data feed. Do not assume one subscription permits redistribution. Get the provider's approval for the intended use before pooling or republishing data.

## Proposed minimum live architecture

1. **Access:** invite-only accounts, server-side session validation and an explicit allowlist. Clerk can supply sign-in/session identity; every API request, stream connection and mutation still needs authorization. Protect API and data access, not just the page. Never trust a user ID sent by the browser. Clerk documents [server-enforced access control](https://clerk.com/docs/guides/secure/basic-rbac).
2. **Isolation:** key settings, replay positions, recordings and alerts by authenticated user. The current global replay switch and settings store cannot safely be shared. Test with two users trying to access each other's data and streams.
3. **Secrets:** for bring-your-own-key accounts, accept credentials only through an authenticated HTTPS endpoint. Encrypt stored provider keys using a managed KMS/secret service or envelope encryption with the wrapping key outside the database. Decrypt only within the collector, redact logs, support revocation/deletion/rotation, and restrict operational access. Do not store provider secrets in Clerk public metadata, browser storage or public build variables. Clerk sign-in does not itself solve provider-key storage.
4. **Collection:** a continuously running worker with per-account rate limits, retries, stale-feed indicators and durable job ownership. Separate workers from request handlers so a browser refresh does not create another poller. Account for provider polling limits before choosing a user cap.
5. **Persistence and delivery:** use a hosted durable database and a bounded real-time delivery mechanism. Replace process-global state and indefinite in-process SSE assumptions. Define history retention, storage quotas, reconnect recovery and deletion. Cloud hosts cannot run notifications on the user's Mac; design browser push or another opted-in channel and test its failure/retry behavior.
6. **Operations:** separate production/preview secrets, restricted backups, budget alerts/caps where available, monitoring and a clear owner for incidents. Explain to users what is stored remotely and how to delete their account/key/data.

Start with a hard invite cap and measure one market session before expanding. Estimate cost from active collectors, provider calls per account, stored snapshots/retention, stream connections/egress, database reads/writes, authentication users and notification delivery. Idle accounts should not create unlimited collectors. Do not promise “free forever.”

## Pilot acceptance gates

- Provider confirms the data-use model; hosting plan fits the actual use.
- Authentication and cross-user isolation tests cover every route and stream.
- No credentials in frontend assets, logs, URLs or preview deployments.
- Collector survives restarts; history, alerts and replay remain user-specific.
- Stale data is visible; quotas, billing boundaries and account deletion are tested.
- Spanish onboarding and an explicit explanation of differences from the local app.

These are design requirements for a future hosted release, not claims that the current local app implements them.
