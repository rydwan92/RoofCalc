# V42 — SEOHost / Cloudflare manual acceptance

> **Historical (superseded by V45).** The shared DEV database moved to
> alwaysdata, whose publicly trusted TLS certificate satisfies Hyperdrive.
> Current instructions: `ARCHITECTURE_V45_SHARED_DEV_DATABASE_AND_HYPERDRIVE.md`.

## Local shared DEV

The developer's root `.env` alone holds a private `DATABASE_URL` for
`srv118516_roofcalc_dev` on `h86.seohost.pl:3306`. Allow only the workstation's
current public IP in SEOHost remote-user access. `pnpm db:doctor` is read-only.
Run `pnpm db:bootstrap` explicitly once, and replay it to confirm no new
canonical rows or conflicts; ordinary `pnpm dev:remote` only diagnoses and
starts the application. Normal CI uses disposable MariaDB.

## Hyperdrive gate

Before a live Worker deployment:

1. Ask SEOHost whether external MariaDB TLS has a WebPKI-trusted certificate
   valid for the origin hostname, or obtain the provider CA for Hyperdrive
   `VERIFY_CA`/`VERIFY_IDENTITY` with a verified hostname. Confirm from an
   external client that the chosen mode validates the certificate.
2. Confirm that the MariaDB user/host ACL and hosting firewall can permit
   Cloudflare's published Hyperdrive egress IP ranges. If SEOHost cannot
   restrict CIDRs in its panel, resolve the provider-supported policy before
   opening broad access. Do not automatically grant `%`.
3. Create the Hyperdrive configuration in the Cloudflare account with the
   origin secret entered outside Git. Keep TLS enabled. Copy
   `wrangler.example.jsonc` to ignored `wrangler.jsonc`, replace the example
   binding ID, and verify `nodejs_compat` and `ASSETS` remain configured.
4. Build `pnpm build`, deploy the existing Worker project using the verified
   config, then check same-origin `/api/health`, `/api/catalog/manufacturers`,
   product queries for `roof-tile`, `modular-sheet`, `standing-seam`,
   `membrane` and `timber-stock`, and a Ruukki variant price. Compare records
   with the local Node API against the same database. Inspect the client JS
   for secrets. Saved local projects and pure calculations must work during
   API outage.

On 2026-09-16, a credential-free TCP probe reached `h86.seohost.pl:3306`,
but a `mysql2` TLS handshake with certificate validation failed with
`HANDSHAKE_SSL_ERROR: self-signed certificate`. That does **not** satisfy
Hyperdrive's default WebPKI-validated `REQUIRED` mode. A provider CA and
verified Hyperdrive mode may resolve it; no live Hyperdrive connection is
claimed. The workstation `.env` currently points at a local database, so
shared remote bootstrap is also unverified.

Do not place a connection string in CLI arguments that might be saved in
shell history or process listings. Use a private credential entry method.

Sources: [Cloudflare mysql2 driver](https://developers.cloudflare.com/hyperdrive/examples/connect-to-mysql/mysql-drivers-and-libraries/mysql2/), [supported TLS modes](https://developers.cloudflare.com/hyperdrive/reference/supported-databases-and-features/), [network ACL](https://developers.cloudflare.com/hyperdrive/configuration/firewall-and-networking-configuration/), [Worker assets routing](https://developers.cloudflare.com/workers/static-assets/).
