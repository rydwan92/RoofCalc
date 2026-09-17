import { lookup } from 'node:dns/promises';
import { readFile } from 'node:fs/promises';
import { connect } from 'node:net';
import { resolve } from 'node:path';
import { createCatalogDatabase } from '../db/client';
import { DatabaseConfigError } from '../db/config';
import {
  databaseFailureReason,
  diagnoseDatabase,
  diagnoseNetwork,
  type NetworkProbe,
} from '../db/doctor';
import { findWorkspaceRoot } from '../environment';

/** Read-only: resolves, connects, authenticates and runs SELECTs only. */
const probe: NetworkProbe = {
  async lookup(host) {
    return (await lookup(host, { all: true })).map((entry) => entry.address);
  },
  connect(host, port) {
    return new Promise((resolvePromise, reject) => {
      const socket = connect({ host, port, timeout: 8000 });
      socket.once('connect', () => {
        socket.destroy();
        resolvePromise();
      });
      socket.once('timeout', () => {
        socket.destroy();
        reject(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }));
      });
      socket.once('error', reject);
    });
  },
};

async function main() {
  const journal = JSON.parse(
    await readFile(
      resolve(
        findWorkspaceRoot() ?? process.cwd(),
        'migrations/meta/_journal.json',
      ),
      'utf8',
    ),
  ) as { entries: unknown[] };
  const connection = createCatalogDatabase();
  try {
    if (connection) {
      const network = await diagnoseNetwork(connection.options, probe);
      console.log(network.lines.join('\n'));
      if (!network.ok) {
        process.exitCode = 1;
        return;
      }
    }
    const lines = await diagnoseDatabase(
      connection?.pool,
      journal.entries.length,
    );
    console.log(lines.join('\n'));
    if (connection && lines.includes('Database: unavailable'))
      process.exitCode = 1;
  } finally {
    await connection?.close();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof DatabaseConfigError
      ? error.message
      : databaseFailureReason(error),
  );
  process.exitCode = 1;
});
