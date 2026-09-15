/** Apache serves the local build separately from the Node read API. */
export function resolveApiBaseUrl(
  location:
    Pick<Location, 'hostname' | 'pathname'> | undefined = globalThis.location,
  development = import.meta.env.DEV,
  configured = import.meta.env.VITE_API_BASE_URL,
): string {
  if (configured?.trim()) return configured.trim().replace(/\/$/, '');
  if (
    !development &&
    location &&
    ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) &&
    /\/apps\/web\/dist(?:\/|$)/.test(location.pathname)
  )
    return 'http://127.0.0.1:3001/api';
  return '/api';
}
