'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const MAX_HTML_LENGTH = 1_500_000;
const MAX_PENDING_JOBS = 100;
const DESTINATION_IDS = new Set(['kitchen', 'counter']);
const PAPER_WIDTHS = new Set([58, 80]);

function normalizeJob(value) {
  if (!value || typeof value !== 'object') return null;
  const destination = value.destination;
  const document = value.document;
  if (!destination || !DESTINATION_IDS.has(destination.id)) return null;
  if (typeof destination.deviceName !== 'string' || !destination.deviceName.trim() || destination.deviceName.length > 256) return null;
  if (!PAPER_WIDTHS.has(Number(destination.paperWidthMm))) return null;
  if (!document || typeof document.html !== 'string' || document.html.length < 1 || document.html.length > MAX_HTML_LENGTH) return null;
  if (typeof document.title !== 'string' || document.title.length > 160) return null;
  if (typeof value.id !== 'string' || !value.id || value.id.length > 100) return null;
  return {
    id: value.id,
    destination: {
      id: destination.id,
      deviceName: destination.deviceName.trim(),
      paperWidthMm: Number(destination.paperWidthMm),
    },
    document: { html: document.html, title: document.title },
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date(0).toISOString(),
    attempts: Number.isSafeInteger(value.attempts) && value.attempts >= 0 ? value.attempts : 0,
    nextAttemptAt: Number.isFinite(value.nextAttemptAt) && value.nextAttemptAt >= 0 ? value.nextAttemptAt : 0,
  };
}

function newJob(destination, document, now) {
  if (!document || typeof document !== 'object') return null;
  return normalizeJob({
    id: crypto.randomUUID(),
    destination,
    document: { html: document.html, title: document.title },
    createdAt: new Date(now).toISOString(),
    attempts: 0,
    nextAttemptAt: 0,
  });
}

class PrintQueue {
  constructor({ filePath, print, maxAttempts = 3, retryDelayMs = 750, pendingRetryMs = 60_000, onStatus = () => {}, now = () => Date.now() }) {
    if (!filePath) throw new TypeError('filePath é obrigatório');
    if (typeof print !== 'function') throw new TypeError('print deve ser uma função');
    this.filePath = filePath;
    this.print = print;
    this.maxAttempts = maxAttempts;
    this.retryDelayMs = retryDelayMs;
    this.pendingRetryMs = pendingRetryMs;
    this.onStatus = onStatus;
    this.now = now;
    this.destinations = new Map();
    this.inflight = new Set();
    this.jobs = this.#load();
  }

  pending() {
    return this.jobs.map((job) => structuredClone(job));
  }

  enqueue(destination, document) {
    if (this.jobs.length >= MAX_PENDING_JOBS) return Promise.reject(new Error('A fila local de impressão atingiu o limite de 100 trabalhos.'));
    const job = newJob(destination, document, this.now());
    if (!job) return Promise.reject(new Error('Trabalho de impressão inválido.'));
    this.jobs.push(job);
    try {
      this.#persist();
    } catch (error) {
      this.jobs = this.jobs.filter((candidate) => candidate.id !== job.id);
      return Promise.reject(error);
    }
    return this.#queue(job.id);
  }

  async resumePending({ force = false } = {}) {
    const due = this.jobs.filter((job) => force || job.nextAttemptAt <= this.now());
    return Promise.allSettled(due.map((job) => this.#queue(job.id)));
  }

  #load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.jobs)) return [];
      return parsed.jobs.slice(0, MAX_PENDING_JOBS).map(normalizeJob).filter(Boolean);
    } catch (error) {
      if (error.code !== 'ENOENT') console.warn('[print-queue] Não foi possível ler a fila:', error.message);
      return [];
    }
  }

  #persist() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify({ version: 1, jobs: this.jobs }, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, this.filePath);
  }

  #queue(jobId) {
    const job = this.jobs.find((candidate) => candidate.id === jobId);
    if (!job || this.inflight.has(jobId)) return Promise.resolve();
    this.inflight.add(jobId);
    const destinationId = job.destination.id;
    const previous = this.destinations.get(destinationId) || Promise.resolve();
    const next = previous.catch(() => {}).then(() => this.#run(jobId));
    this.destinations.set(destinationId, next);
    const cleanup = () => {
      this.inflight.delete(jobId);
      if (this.destinations.get(destinationId) === next) this.destinations.delete(destinationId);
    };
    next.then(cleanup, cleanup);
    return next;
  }

  async #run(jobId) {
    const job = this.jobs.find((candidate) => candidate.id === jobId);
    if (!job) return;
    let lastError;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      this.onStatus({ state: 'printing', destination: job.destination.id, attempt, jobId });
      try {
        await this.print(job.destination, job.document);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        job.attempts += 1;
        try {
          this.#persist();
        } catch (persistError) {
          persistError.printJobPersisted = true;
          throw persistError;
        }
        this.onStatus({ state: 'retrying', destination: job.destination.id, attempt, jobId, error: lastError.message });
        if (attempt < this.maxAttempts && this.retryDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs * attempt));
        }
        continue;
      }
      const completedIndex = this.jobs.findIndex((candidate) => candidate.id === jobId);
      if (completedIndex >= 0) this.jobs.splice(completedIndex, 1);
      try {
        this.#persist();
      } catch (error) {
        if (completedIndex >= 0) this.jobs.splice(completedIndex, 0, job);
        error.printJobPersisted = true;
        this.onStatus({ state: 'pending', destination: job.destination.id, jobId, error: error.message });
        throw error;
      }
      this.onStatus({ state: 'printed', destination: job.destination.id, attempt, jobId });
      return;
    }
    const retryExponent = Math.min(4, Math.floor(Math.max(0, job.attempts - 1) / this.maxAttempts));
    job.nextAttemptAt = this.now() + Math.min(15 * 60_000, this.pendingRetryMs * (2 ** retryExponent));
    try {
      this.#persist();
    } catch (error) {
      error.printJobPersisted = true;
      throw error;
    }
    this.onStatus({ state: 'pending', destination: job.destination.id, jobId, error: lastError?.message || 'Falha desconhecida' });
    lastError.printJobPersisted = true;
    throw lastError;
  }
}

module.exports = { MAX_HTML_LENGTH, MAX_PENDING_JOBS, PrintQueue, normalizeJob };
