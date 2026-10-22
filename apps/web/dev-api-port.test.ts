import { describe, expect, it } from 'vitest';
import { portFromEnvFile, resolveApiPort } from './dev-api-port';

describe('the local API port for the dev proxy and the XAMPP build', () => {
  const envFileText = '# local\nHOST=127.0.0.1\nPORT=3001\nDATABASE_URL=x\n';

  it('reads PORT from the root .env', () => {
    expect(resolveApiPort({ envFileText, webServerPort: 5173 })).toBe(3001);
    expect(portFromEnvFile('PORT="3005"\n# PORT=1')).toBe('3005');
  });

  it('lets the real environment win over the file', () => {
    expect(
      resolveApiPort({
        environmentPort: '3100',
        envFileText,
        webServerPort: 5173,
      }),
    ).toBe(3100);
  });

  it('never proxies to the web server itself when a host set PORT for it', () => {
    // A preview tool started `vite --port 5174` with PORT=5174: every /api
    // request used to come back 500 from the proxy calling itself.
    expect(
      resolveApiPort({
        environmentPort: '5174',
        envFileText,
        webServerPort: 5174,
      }),
    ).toBe(3001);
    expect(
      resolveApiPort({ environmentPort: '5173', webServerPort: 5173 }),
    ).toBe(3001);
  });

  it('ignores a malformed or out-of-range value', () => {
    expect(
      resolveApiPort({ environmentPort: 'abc', envFileText: 'PORT=70000' }),
    ).toBe(3001);
    expect(resolveApiPort({})).toBe(3001);
  });
});
