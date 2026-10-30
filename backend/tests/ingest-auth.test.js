const test = require('node:test');
const assert = require('node:assert');

// Configure before the app loads; dotenv never overrides variables that are already set
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.INGEST_TOKEN = 'test-ingest-token';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

// Stub Prisma so the tests need no database
const prismaPath = require.resolve('../src/config/prisma');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: {
    attackers: { upsert: async ({ create }) => ({ attacker_id: 'attacker-1', ...create }) },
    attackLogs: { create: async ({ data }) => ({ log_id: 'log-1', ...data }) },
  },
};

const app = require('../src/app');

test('agent ingest and dashboard auth', async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/api`;

  const ingest = (headers = {}) =>
    fetch(`${base}/attack-logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ source_ip: '192.0.2.10', username_attempt: 'root', password_attempt: 'x', sensor_id: 'test' }),
    });

  await t.test('ingest without token returns 401', async () => {
    assert.strictEqual((await ingest()).status, 401);
  });

  await t.test('ingest with a wrong token returns 401', async () => {
    assert.strictEqual((await ingest({ Authorization: 'Bearer wrong-token' })).status, 401);
  });

  await t.test('ingest with the correct token returns 201', async () => {
    assert.strictEqual((await ingest({ Authorization: 'Bearer test-ingest-token' })).status, 201);
  });

  await t.test('heartbeat without token returns 401', async () => {
    const res = await fetch(`${base}/sensors/heartbeat`, { method: 'POST' });
    assert.strictEqual(res.status, 401);
  });

  await t.test('GET attack-logs without login returns 401', async () => {
    for (const path of ['', '/stats', '/timeline', '/hourly', '/last-attack', '/top-sources', '/heatmap']) {
      const res = await fetch(`${base}/attack-logs${path}`);
      assert.strictEqual(res.status, 401, `GET /attack-logs${path}`);
    }
  });
});
