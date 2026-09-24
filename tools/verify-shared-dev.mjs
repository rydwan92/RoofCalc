// Cloudflare Builds is independent of Actions. This probes availability and
// public readiness, not the revision deployed by Cloudflare.
const configured = process.env.ROOFCALC_DEV_APP_URL;
if (!configured)
  throw new Error(
    'ROOFCALC_DEV_APP_URL is required for deployed verification.',
  );
const base = new URL(configured);
if (
  base.protocol !== 'https:' ||
  base.username ||
  base.password ||
  base.pathname !== '/' ||
  base.search ||
  base.hash
)
  throw new Error(
    'ROOFCALC_DEV_APP_URL must be an HTTPS browser origin without credentials or a path.',
  );

async function read(path) {
  const response = await fetch(new URL(path, base), {
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

let ready = false;
for (let attempt = 1; attempt <= 12; attempt++) {
  try {
    const health = await read('/api/health');
    if (health.runtime !== 'cloudflare-worker')
      throw new Error('Deployed API is not the expected Worker runtime.');
    if (health.database !== 'connected')
      throw new Error('Worker database is not connected.');
    const setup = await read('/api/setup/status');
    if (setup.database !== 'connected')
      throw new Error('Setup endpoint does not see the connected database.');
    if (
      !['configured', 'unconfigured'].includes(setup.auth) ||
      setup.auth !== health.auth
    )
      throw new Error('Health and setup disagree about auth configuration.');
    if (
      process.env.ROOFCALC_EXPECT_AUTH_CONFIGURED === 'true' &&
      setup.auth !== 'configured'
    )
      throw new Error('Worker auth is not configured.');
    if (!['required', 'configured'].includes(setup.firstOwner))
      throw new Error('Business schema is not ready for first-owner status.');
    if (!['available', 'unavailable'].includes(setup.bootstrap))
      throw new Error('Setup endpoint has an invalid readiness shape.');
    const catalogue = await read(
      '/api/catalog/products?kind=roof-tile&limit=1',
    );
    if (!Array.isArray(catalogue.items))
      throw new Error('Worker catalogue response is invalid.');
    console.log(
      `Worker connected; auth ${setup.auth}; first owner ${setup.firstOwner}; catalogue read ${catalogue.items.length} item(s). Deployment revision is not asserted.`,
    );
    ready = true;
    break;
  } catch (error) {
    console.warn(
      `Deployed verification ${attempt}/12: ${error instanceof Error ? error.message : 'request failed'}`,
    );
    if (attempt < 12)
      await new Promise((resolve) => setTimeout(resolve, 10000));
  }
}
if (!ready)
  throw new Error(
    'Worker verification exhausted retries. Check Cloudflare Builds, Hyperdrive credentials and seed status. DB sync may have succeeded independently.',
  );
