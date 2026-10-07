import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { exampleData } from './model.js';

test('Cloud-Schema schützt Datenzugriff, Schreibrechte und Revisionen', async () => {
  const database = new PGlite();
  try {
    await database.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
      grant usage on schema auth to authenticated, anon;
      grant execute on function auth.uid() to authenticated, anon;
      insert into auth.users values
        ('00000000-0000-0000-0000-000000000001'),
        ('00000000-0000-0000-0000-000000000002');
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
    const changed = { ...exampleData(), rate: 0.45 };
    const saved = await database.query('select public.save_team_state($1::jsonb, 1) as revision', [JSON.stringify(changed)]);
    assert.equal(Number(saved.rows[0].revision), 2);
    await assert.rejects(database.query('select public.save_team_state($1::jsonb, 1)', [JSON.stringify(exampleData())]), /another device/);
    await assert.rejects(database.query('select public.save_team_state($1::jsonb, 2)', [JSON.stringify({ ...exampleData(), rate: -1 })]), /Invalid rate/);
    await database.exec("set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'");
    assert.equal((await database.query('select * from public.team_state')).rows.length, 0);
    await database.exec("set request.jwt.claim.sub = ''");
    await assert.rejects(database.query('select public.save_team_state($1::jsonb, 0)', [JSON.stringify(exampleData())]), /Authentication required/);
  } finally { await database.close(); }
});