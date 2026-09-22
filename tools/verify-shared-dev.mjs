// Cloudflare Builds is independent of Actions. This probes availability and
// seeded public data, not the revision deployed by Cloudflare.
const configured = process.env.ROOFCALC_DEV_APP_URL;
if (!configured) throw new Error('ROOFCALC_DEV_APP_URL is required for deployed verification.');
const base = new URL(configured);
if (base.protocol !== 'https:' || base.username || base.password)
  throw new Error('ROOFCALC_DEV_APP_URL must be an HTTPS URL without credentials.');

async function read(path) {
  const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

let ready = false;
for (let attempt = 1; attempt <= 12; attempt++) {
  try {
    const health = await read('/api/health');
    if (health.database !== 'connected') throw new Error('Worker database is not connected.');
    const catalogue = await read('/api/catalog/products?kind=roof-tile&limit=1');
    if (!Array.isArray(catalogue.items) || catalogue.items.length < 1)
      throw new Error('Worker cannot read seeded roof-tile products.');
    console.log('Worker database connected; seeded public catalogue visible. Deployment revision is not asserted.');
    ready = true;
    break;
  } catch (error) {
    console.warn(`Deployed verification ${attempt}/12: ${error instanceof Error ? error.message : 'request failed'}`);
    if (attempt < 12) await new Promise((resolve) => setTimeout(resolve, 10000));
  }
}
if (!ready) throw new Error('Worker verification exhausted retries. Check Cloudflare Builds, Hyperdrive credentials and seed status. DB sync may have succeeded independently.');
