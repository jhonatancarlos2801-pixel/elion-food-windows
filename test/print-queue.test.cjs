'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { MAX_HTML_LENGTH, PrintQueue } = require('../src/print-queue.cjs');

const destination = (id) => ({ id, deviceName: `Printer ${id}`, paperWidthMm: id === 'kitchen' ? 80 : 58 });
const document = (html = '<p>Pedido</p>') => ({ html, title: 'Comanda #1' });
function temporaryQueueFile(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'elion-print-queue-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return path.join(directory, 'queue.json');
}

test('persiste antes de imprimir, repete falha transitória e remove após sucesso', async (t) => {
  const filePath = temporaryQueueFile(t);
  let calls = 0;
  const statuses = [];
  const queue = new PrintQueue({
    filePath,
    retryDelayMs: 1,
    onStatus: (status) => statuses.push(status.state),
    print: async () => {
      calls += 1;
      const persisted = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      assert.equal(persisted.jobs.length, 1);
      if (calls < 2) throw new Error('offline');
    },
  });
  await queue.enqueue(destination('kitchen'), document());
  assert.equal(calls, 2);
  assert.equal(queue.pending().length, 0);
  assert.deepEqual(statuses, ['printing', 'retrying', 'printing', 'printed']);
});

test('retoma trabalho pendente após reiniciar', async (t) => {
  const filePath = temporaryQueueFile(t);
  const first = new PrintQueue({ filePath, maxAttempts: 1, retryDelayMs: 0, print: async () => { throw new Error('sem papel'); } });
  await assert.rejects(first.enqueue(destination('kitchen'), document()), /sem papel/);
  assert.equal(first.pending().length, 1);

  const printed = [];
  const restarted = new PrintQueue({ filePath, print: async (target) => printed.push(target.id) });
  await restarted.resumePending({ force: true });
  assert.deepEqual(printed, ['kitchen']);
  assert.equal(restarted.pending().length, 0);
  assert.equal(JSON.parse(fs.readFileSync(filePath, 'utf8')).jobs.length, 0);
});

test('mantém somente o destino que falhou e não repete destino concluído', async (t) => {
  const filePath = temporaryQueueFile(t);
  const first = new PrintQueue({
    filePath,
    maxAttempts: 1,
    retryDelayMs: 0,
    print: async (target) => {
      if (target.id === 'counter') throw new Error('balcão offline');
    },
  });
  await Promise.allSettled([
    first.enqueue(destination('kitchen'), document('<p>Cozinha</p>')),
    first.enqueue(destination('counter'), document('<p>Balcão</p>')),
  ]);
  assert.deepEqual(first.pending().map((job) => job.destination.id), ['counter']);

  const resumed = [];
  const restarted = new PrintQueue({ filePath, print: async (target) => resumed.push(target.id) });
  await restarted.resumePending({ force: true });
  assert.deepEqual(resumed, ['counter']);
});

test('serializa trabalhos de um destino sem bloquear outro', async (t) => {
  const filePath = temporaryQueueFile(t);
  const active = new Set();
  const overlaps = [];
  const queue = new PrintQueue({
    filePath,
    print: async (target) => {
      if (active.has(target.id)) overlaps.push(target.id);
      active.add(target.id);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active.delete(target.id);
    },
  });
  await Promise.all([
    queue.enqueue(destination('kitchen'), document('<p>1</p>')),
    queue.enqueue(destination('kitchen'), document('<p>2</p>')),
    queue.enqueue(destination('counter'), document('<p>3</p>')),
  ]);
  assert.deepEqual(overlaps, []);
});

test('rejeita payload acima do limite antes de persistir', async (t) => {
  const filePath = temporaryQueueFile(t);
  const queue = new PrintQueue({ filePath, print: async () => {} });
  await assert.rejects(queue.enqueue(destination('kitchen'), document('x'.repeat(MAX_HTML_LENGTH + 1))), /inválido/);
  assert.equal(queue.pending().length, 0);
  assert.equal(fs.existsSync(filePath), false);
});

test('respeita backoff antes de tentar novamente um trabalho pendente', async (t) => {
  const filePath = temporaryQueueFile(t);
  let clock = 1_000;
  let calls = 0;
  const queue = new PrintQueue({
    filePath,
    maxAttempts: 1,
    retryDelayMs: 0,
    pendingRetryMs: 100,
    now: () => clock,
    print: async () => { calls += 1; throw new Error('offline'); },
  });
  await assert.rejects(queue.enqueue(destination('counter'), document()), /offline/);
  assert.equal(queue.pending()[0].nextAttemptAt, 1_100);
  clock = 1_099;
  await queue.resumePending();
  assert.equal(calls, 1);
  clock = 1_100;
  await queue.resumePending();
  assert.equal(calls, 2);
});
