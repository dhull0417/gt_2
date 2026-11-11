// GET /api/health answers 204 with no auth: NetInfo's reachability check points at it, so
// "online" in the app means "can reach GroupThat".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

const { default: healthRoutes } = await import('./health.route.js');

test('GET /api/health returns 204 with an empty body', async () => {
  const app = express();
  app.use('/api/health', healthRoutes);
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(res.status, 204);
    assert.equal(await res.text(), '');
  } finally {
    server.close();
  }
});
