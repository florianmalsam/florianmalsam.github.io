import test from 'node:test';
import assert from 'node:assert/strict';
import { createSaveQueue } from './save-queue.js';

test('Cloud-Speicherungen laufen seriell mit jeweils aktueller Revision', async () => {
  const calls = [];
  const statuses = [];
  let finishFirst;
  const queue = createSaveQueue(async (payload, revision) => {
    calls.push({ payload, revision });
    if (calls.length === 1) await new Promise(resolve => { finishFirst = resolve; });
    return revision + 1;
  }, 4, value => statuses.push(value), error => { throw error; });
  queue.enqueue({ name: 'first' });
  queue.enqueue({ name: 'second' });
  queue.enqueue({ name: 'latest' });
  finishFirst();
  await queue.whenIdle();
  assert.deepEqual(calls, [{ payload: { name: 'first' }, revision: 4 }, { payload: { name: 'latest' }, revision: 5 }]);
  assert.equal(statuses.at(-1), 'saved');
});

test('Fehler stoppen das Speichern und behalten den neuesten Stand für Backup und Retry', async () => {
  const errors = [];
  const calls = [];
  let fail = true;
  const queue = createSaveQueue(async (payload, revision) => {
    calls.push({ payload, revision });
    if (fail) throw new Error('offline');
    return revision + 1;
  }, 2, () => {}, error => errors.push(error.message));
  await queue.enqueue({ value: 1 });
  await queue.enqueue({ value: 2 });
  assert.equal(calls.length, 1);
  assert.deepEqual(queue.latest(), { value: 2 });
  assert.deepEqual(errors, ['offline']);
  fail = false;
  await queue.retry();
  assert.deepEqual(calls[1], { payload: { value: 2 }, revision: 2 });
});

test('Revisionskonflikte werden nicht automatisch erneut geschrieben', async () => {
  let calls = 0;
  let caught;
  const queue = createSaveQueue(async () => {
    calls++;
    throw Object.assign(new Error('conflict'), { code: 'P0001' });
  }, 1, () => {}, error => { caught = error; });
  await queue.enqueue({ value: 1 });
  await queue.enqueue({ value: 2 });
  assert.equal(calls, 1);
  assert.equal(caught.code, 'P0001');
});