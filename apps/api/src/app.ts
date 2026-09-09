import express from 'express';
import type { HealthResponse } from '@cieslacalc/shared';

export function createApp(webDirectory?: string) {
  const app = express();
  app.disable('x-powered-by');
  app.get('/api/health', (_req, res) => {
    const response: HealthResponse = {
      status: 'ok',
      service: 'cieslacalc-api',
      version: '0.1.0',
    };
    res.json(response);
  });
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });
  if (webDirectory) {
    app.use(express.static(webDirectory));
    app.get('*', (_req, res) => {
      res.sendFile('index.html', { root: webDirectory });
    });
  }
  return app;
}
