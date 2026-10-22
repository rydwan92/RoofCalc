const DEFAULT_API_PORT = 3001;

const valid = (value: string | undefined): number | undefined => {
  if (value === undefined || !/^\s*\d+\s*$/.test(value)) return undefined;
  const port = Number(value);
  return port > 0 && port < 65536 ? port : undefined;
};

/** `PORT=` from the root `.env` text, ignoring comments and other keys. */
export function portFromEnvFile(text: string | undefined): string | undefined {
  const line = (text ?? '')
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith('PORT='))
    .at(-1);
  return line?.slice('PORT='.length).replace(/^(['"])(.*)\1$/, '$2');
}

/**
 * The port of the Node API, for the dev proxy and the static XAMPP build.
 * `PORT` from the environment wins over the root `.env` (the one place the
 * API reads it from) — except when it is the port the web server itself
 * serves on. Hosts and preview tools set `PORT` for the WEB server; taking
 * it as the API port made the proxy call itself and answer every `/api`
 * request with 500, which the app then showed as "catalogue unavailable".
 */
export function resolveApiPort(input: {
  environmentPort?: string;
  envFileText?: string;
  webServerPort?: number;
}): number {
  const fromEnvironment = valid(input.environmentPort);
  const fromFile = valid(portFromEnvFile(input.envFileText));
  const usable = (port: number | undefined) =>
    port !== undefined && port !== input.webServerPort ? port : undefined;
  return usable(fromEnvironment) ?? usable(fromFile) ?? DEFAULT_API_PORT;
}
