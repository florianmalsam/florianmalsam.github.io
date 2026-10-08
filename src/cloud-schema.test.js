import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { exampleData, initializeFinanceJournal, recordFinanceChanges, resetFinances } from './model.js';

test('Cloud-Schema schützt Datenzugriff, Schreibrechte und Revisionen', async () => {
  const database = new PGlite();
  try {
    await database.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table auth.users (id uuid primary key, email text unique);
      create function auth.uid() returns uuid language sql stable as
        'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
      grant usage on schema auth to authenticated, anon;
      grant execute on function auth.uid() to authenticated, anon;
      insert into auth.users values
        ('00000000-0000-0000-0000-000000000001', 'owner@example.com'),
        ('00000000-0000-0000-0000-000000000002', 'xs_esl@web.de');
    `);
    await database.exec(await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
    await database.exec('set role anon');
    await assert.rejects(database.query('select * from public.team_state'), /permission denied/);
    await assert.rejects(database.query('select public.save_team_state($1::jsonb, 0)', [JSON.stringify(exampleData())]), /permission denied/);
    await database.exec("set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'");
    const initial = await database.query('select public.save_team_state($1::jsonb, 0) as revision', [JSON.stringify(exampleData())]);
    assert.equal(Number(initial.rows[0].revision), 1);
    assert.equal((await database.query('select * from public.team_state')).rows.length, 1);
    await assert.rejects(database.query('update public.team_state set revision = 500'), /permission denied/);
    await assert.rejects(database.query('select public.save_team_state($1::jsonb, 0)', [JSON.stringify(exampleData())]), /another device/);
    const changed = recordFinanceChanges(initializeFinanceJournal(exampleData()), { ...exampleData(), rate: 0.45, incomes: [{ id: 'I1', date: '2026-10-08', description: 'Getränkeverkauf', amountCents: 2500, category: 'catering', matchId: null, note: '' }] });
    const saved = await database.query('select public.save_team_state($1::jsonb, 1) as revision', [JSON.stringify(changed)]);
    assert.equal(Number(saved.rows[0].revision), 2);
    const stored = (await database.query('select payload from public.team_state')).rows[0].payload;
    assert.deepEqual(stored.financeJournal, changed.financeJournal);
    assert.equal(stored.treasuryBalanceCents, 2500);
    await assert.rejects(database.query('select public.save_team_state($1::jsonb, 1)', [JSON.stringify(exampleData())]), /another device/);
    await assert.rejects(database.query('select public.save_team_state($1::jsonb, 2)', [JSON.stringify({ ...exampleData(), rate: -1 })]), /Invalid rate/);
    const reset = resetFinances(changed);
    const resetSaved = await database.query('select public.save_team_state($1::jsonb, 2) as revision', [JSON.stringify(reset)]);
    assert.equal(Number(resetSaved.rows[0].revision), 3);
    const resetStored = (await database.query('select payload from public.team_state')).rows[0].payload;
    assert.equal(resetStored.treasuryBalanceCents, 0);
    assert.deepEqual(resetStored.financeJournal, []);
    assert.deepEqual(resetStored.incomes, changed.incomes);
    await database.exec('reset role');
    await database.exec(await readFile(new URL('../supabase/readonly-access.sql', import.meta.url), 'utf8'));
    await database.exec("set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'");
    const readerView = await database.query('select owner_id, payload from public.team_state');
    assert.equal(readerView.rows.length, 1);
    assert.equal(readerView.rows[0].owner_id, '00000000-0000-0000-0000-000000000001');
    assert.deepEqual(readerView.rows[0].payload.financeJournal, []);
    assert.equal(readerView.rows[0].payload.treasuryResetOffsetCents, -2500);
    assert.equal((await database.query('select * from public.team_readers')).rows.length, 1);
    await assert.rejects(database.query('select public.save_team_state($1::jsonb, 0)', [JSON.stringify(exampleData())]), /Read-only access/);
    await assert.rejects(database.query('select public.save_team_state($1::jsonb, 2)', [JSON.stringify(exampleData())]), /Read-only access/);
    await database.exec("set request.jwt.claim.sub = ''");
    await assert.rejects(database.query('select public.save_team_state($1::jsonb, 0)', [JSON.stringify(exampleData())]), /Authentication required/);
  } finally { await database.close(); }
});