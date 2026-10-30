const test = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Configure before the app loads; dotenv never overrides variables that are already set
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.INGEST_TOKEN = 'test-ingest-token';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

const OLD_PASSWORD = 'old-password-123';
const NEW_PASSWORD = 'new-password-456';

// In-memory stand-in for the users table
const user = {
  user_id: '00000000-0000-4000-8000-000000000001',
  email: 'admin@obsera.local',
  display_name: 'Admin',
  is_active: true,
  password_hash: bcrypt.hashSync(OLD_PASSWORD, 4),
  password_changed_at: null,
};
const findUser = (where) => (where.user_id === user.user_id || where.email === user.email ? user : null);

const prismaPath = require.resolve('../src/config/prisma');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: {
    system_settings: { findFirst: async () => null },
    users: {
      findUnique: async ({ where }) => findUser(where),
      update: async ({ where, data }) => Object.assign(findUser(where), data),
    },
  },
};

const app = require('../src/app');

test('change password', async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/api/auth`;

  const post = (path, body, token) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
      body: JSON.stringify(body),
    });
  const login = (password) => post('/login', { email: user.email, password });
  const me = (token) => fetch(`${base}/me`, { headers: { Authorization: `Bearer ${token}` } });

  const { data } = await (await login(OLD_PASSWORD)).json();
  const token = data.token;
  // A session opened on another device a minute ago
  const otherSession = jwt.sign({ user_id: user.user_id, iat: Math.floor(Date.now() / 1000) - 60 }, process.env.JWT_SECRET);

  await t.test('requires a signed-in user', async () => {
    assert.strictEqual((await post('/change-password', { currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD })).status, 401);
  });

  await t.test('wrong current password returns 400', async () => {
    const res = await post('/change-password', { currentPassword: 'not-the-password', newPassword: NEW_PASSWORD }, token);
    assert.strictEqual(res.status, 400);
  });

  await t.test('new password shorter than 12 characters returns 400', async () => {
    const res = await post('/change-password', { currentPassword: OLD_PASSWORD, newPassword: 'short-pw' }, token);
    assert.strictEqual(res.status, 400);
  });

  await t.test('new password equal to the current one returns 400', async () => {
    const res = await post('/change-password', { currentPassword: OLD_PASSWORD, newPassword: OLD_PASSWORD }, token);
    assert.strictEqual(res.status, 400);
  });

  let freshToken;
  await t.test('valid change returns 200 with a fresh token', async () => {
    const res = await post('/change-password', { currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD }, token);
    assert.strictEqual(res.status, 200);
    freshToken = (await res.json()).data.token;
    assert.ok(freshToken);
  });

  await t.test('login works with the new password and fails with the old one', async () => {
    assert.strictEqual((await login(NEW_PASSWORD)).status, 200);
    assert.strictEqual((await login(OLD_PASSWORD)).status, 401);
  });

  await t.test('other sessions are signed out, the current one keeps working', async () => {
    assert.strictEqual((await me(otherSession)).status, 401);
    assert.strictEqual((await me(freshToken)).status, 200);
  });

  await t.test('repeated failures are rate limited', async () => {
    let status;
    for (let i = 0; i < 6 && status !== 429; i++) {
      status = (await post('/change-password', { currentPassword: 'not-the-password', newPassword: NEW_PASSWORD }, freshToken)).status;
    }
    assert.strictEqual(status, 429);
  });
});
