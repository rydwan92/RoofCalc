import { describe, expect, it } from 'vitest';
import {
  DatabaseConfigError,
  describeDatabaseTarget,
  parseDatabaseUrl,
} from './config';

const FAKE_SECRET = 'p@ss:w/rd';
const remote = `mysql://dev_user:${encodeURIComponent(FAKE_SECRET)}@mysql-example.alwaysdata.net:3306/example_dev`;

describe('parseDatabaseUrl', () => {
  it('decodes percent-encoded credentials (@ as %40)', () => {
    const options = parseDatabaseUrl(remote);
    expect(options).toMatchObject({
      host: 'mysql-example.alwaysdata.net',
      port: 3306,
      user: 'dev_user',
      password: FAKE_SECRET,
      database: 'example_dev',
    });
  });

  it('requires verified TLS for remote hosts by default', () => {
    expect(parseDatabaseUrl(remote).ssl).toEqual({
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
    });
  });

  it('keeps plain TCP for loopback databases (XAMPP, Docker, CI)', () => {
    for (const host of ['127.0.0.1', 'localhost', '[::1]'])
      expect(
        parseDatabaseUrl(`mysql://root:ci@${host}:3307/cieslacalc`).ssl,
      ).toBeUndefined();
  });

  it('honours explicit ssl=required and ssl=disabled', () => {
    expect(
      parseDatabaseUrl('mysql://u:p@127.0.0.1/db?ssl=required').ssl,
    ).toBeDefined();
    expect(
      parseDatabaseUrl('mysql://u:p@db.example.com/db?ssl=disabled').ssl,
    ).toBeUndefined();
  });

  it('defaults the port to 3306', () => {
    expect(parseDatabaseUrl('mysql://u:p@db.example.com/db').port).toBe(3306);
  });

  it.each([
    'not a url',
    'postgres://u:p@db.example.com/db',
    'mysql://u:p@db.example.com/',
    'mysql://db.example.com/db',
    'mysql://u:p@db.example.com/db?ssl=maybe',
    'mysql://u:%E0%A4%A@db.example.com/db',
  ])('rejects %s without echoing credentials', (url) => {
    let error: unknown;
    try {
      parseDatabaseUrl(url);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(DatabaseConfigError);
    expect((error as Error).message).not.toContain('u:p');
    expect((error as Error).message).not.toContain('%E0');
  });

  it('describes a target without user or password', () => {
    const text = describeDatabaseTarget(parseDatabaseUrl(remote));
    expect(text).toBe(
      'mysql-example.alwaysdata.net:3306/example_dev (TLS verified)',
    );
    expect(text).not.toMatch(/dev_user|p@ss/);
  });
});
