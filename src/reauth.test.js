import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyAdminPassword } from './reauth.js';

test('Admin-Passwort wird über die Anmeldung geprüft und die Prüfsitzung lokal beendet', async () => {
  let signedOut = false;
  const auth = {
    async signInWithPassword(values) {
      assert.deepEqual(values, { email: 'admin@example.com', password: 'test-password' });
      return { data: { session: {}, user: { id: 'admin-id', email: 'admin@example.com' } }, error: null };
    },
    async signOut(options) { assert.deepEqual(options, { scope: 'local' }); signedOut = true; },
  };
  await verifyAdminPassword(auth, 'admin-id', 'admin@example.com', 'test-password');
  assert.equal(signedOut, true);
});

test('Falsche Passwörter, fehlende Eingaben und fremde Konten dürfen keinen Reset autorisieren', async () => {
  let requests = 0;
  const wrong = { async signInWithPassword() { requests++; return { error: { status: 400, code: 'invalid_credentials' } }; } };
  await assert.rejects(verifyAdminPassword(wrong, 'admin-id', 'admin@example.com', ''), /eingeben/);
  assert.equal(requests, 0);
  await assert.rejects(verifyAdminPassword(wrong, 'admin-id', 'admin@example.com', 'wrong-test-password'), /nicht korrekt/);
  let signedOut = false;
  const foreign = { async signInWithPassword() { return { data: { session: {}, user: { id: 'reader-id', email: 'admin@example.com' } } }; }, async signOut() { signedOut = true; } };
  await assert.rejects(verifyAdminPassword(foreign, 'admin-id', 'admin@example.com', 'test-password'), /angemeldete Admin/);
  assert.equal(signedOut, true);
});

test('Netzwerkfehler und Rate Limits werden ohne sensible Fehlermeldungen zurückgegeben', async () => {
  await assert.rejects(verifyAdminPassword({ async signInWithPassword() { throw new Error('internal-details'); } }, 'admin-id', 'admin@example.com', 'test-password'), /Verbindung prüfen/);
  await assert.rejects(verifyAdminPassword({ async signInWithPassword() { return { error: { status: 429 } }; } }, 'admin-id', 'admin@example.com', 'test-password'), /Zu viele Versuche/);
});