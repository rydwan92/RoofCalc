import { describe, expect, it } from 'vitest';
import {
  analyzeLocalEnv,
  envValues,
  issueSeverity,
  localDatabaseUrl,
  parseEnvFile,
  setEnvValue,
} from './env-file';

describe('root .env analysis', () => {
  it('reads values the way Node does, quotes and comments included', () => {
    const lines = parseEnvFile(
      [
        '# local',
        'DATABASE_URL=mysql://root@127.0.0.1:3306/cieslacalc',
        'export PORT=3001',
        'BETTER_AUTH_URL="http://127.0.0.1:5173"',
        'NOTE=value # inline comment',
        '',
      ].join('\r\n'),
    );
    expect(envValues(lines)).toEqual({
      DATABASE_URL: 'mysql://root@127.0.0.1:3306/cieslacalc',
      PORT: '3001',
      BETTER_AUTH_URL: 'http://127.0.0.1:5173',
      NOTE: 'value',
    });
  });

  it('explains SQL pasted into .env, which Node would silently ignore', () => {
    const issues = analyzeLocalEnv(
      parseEnvFile(
        [
          "CREATE USER 'roofcalc_app'@'localhost'",
          "IDENTIFIED BY 'TU_WPISZ_MOCNE_HASLO';",
          'GRANT ALL PRIVILEGES',
          'ON `cieslacalc`.*',
          "TO 'roofcalc_app'@'localhost';",
        ].join('\n'),
      ),
    );
    expect(issues.filter((issue) => issue.code === 'not-key-value')).toEqual([
      { code: 'not-key-value', line: 1, looksLikeSql: true },
      { code: 'not-key-value', line: 2, looksLikeSql: true },
      { code: 'not-key-value', line: 3, looksLikeSql: true },
      { code: 'not-key-value', line: 4, looksLikeSql: true },
      { code: 'not-key-value', line: 5, looksLikeSql: true },
    ]);
    expect(issues).toContainEqual({ code: 'database-url-missing' });
  });

  it('flags a bad URL, port, duplicates and half-configured auth', () => {
    const issues = analyzeLocalEnv(
      parseEnvFile(
        [
          'DATABASE_URL=127.0.0.1:3306/cieslacalc',
          'PORT=5173',
          'PORT=3001',
          'BETTER_AUTH_SECRET=short',
        ].join('\n'),
      ),
    );
    expect(issues.map((issue) => issue.code)).toEqual([
      'duplicate-key',
      'database-url-invalid',
      'port-collides-with-web',
      'auth-incomplete',
      'secret-too-short',
    ]);
    expect(issues.every((issue) => issueSeverity(issue) === 'error')).toBe(
      false,
    );
  });

  it('accepts a complete local configuration', () => {
    expect(
      analyzeLocalEnv(
        parseEnvFile(
          [
            'DATABASE_URL=mysql://roofcalc_app:p%40ss@127.0.0.1:3306/cieslacalc',
            'PORT=3001',
            'BETTER_AUTH_URL=http://127.0.0.1:5173',
            `BETTER_AUTH_SECRET=${'a'.repeat(44)}`,
            `ROOFCALC_BOOTSTRAP_TOKEN=${'b'.repeat(64)}`,
          ].join('\n'),
        ),
      ),
    ).toEqual([]);
  });
});

describe('editing .env in place', () => {
  it('replaces one key and keeps comments, order and CRLF', () => {
    const text = '# db\r\nDATABASE_URL=old\r\nPORT=3001\r\n';
    expect(setEnvValue(text, 'DATABASE_URL', 'mysql://u@127.0.0.1/db')).toBe(
      '# db\r\nDATABASE_URL=mysql://u@127.0.0.1/db\r\nPORT=3001\r\n',
    );
  });

  it('appends a missing key and quotes values that need it', () => {
    expect(setEnvValue('PORT=3001\n', 'NAME', 'two words')).toBe(
      'PORT=3001\nNAME="two words"\n',
    );
    expect(setEnvValue('', 'PORT', '3001')).toBe('PORT=3001\n');
  });

  it('builds a URL with a percent-encoded password', () => {
    expect(
      localDatabaseUrl({
        user: 'roofcalc_app',
        password: 'a@b:c/d',
        database: 'cieslacalc',
      }),
    ).toBe('mysql://roofcalc_app:a%40b%3Ac%2Fd@127.0.0.1:3306/cieslacalc');
    expect(
      localDatabaseUrl({ user: 'root', password: '', database: 'x' }),
    ).toBe('mysql://root@127.0.0.1:3306/x');
  });
});
