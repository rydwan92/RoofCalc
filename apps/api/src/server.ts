import { fileURLToPath } from 'node:url';
import { createApp } from './app';

const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('Invalid PORT');
const webDirectory = fileURLToPath(new URL('../../web/dist/', import.meta.url));
const server = createApp(webDirectory).listen(
  port,
  process.env.HOST ?? '127.0.0.1',
  () => {
    console.log(`CieślaCalc: http://127.0.0.1:${port}`);
  },
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => server.close());
