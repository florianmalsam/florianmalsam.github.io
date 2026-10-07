export function createSaveQueue(save, initialRevision, onStatus, onError) {
  let revision = initialRevision;
  let pending = null;
  let latest = null;
  let running = null;
  let paused = false;

  async function drain() {
    onStatus('saving');
    try {
      while (pending && !paused) {
        const payload = pending;
        pending = null;
        try {
          revision = await save(payload, revision);
        } catch (error) {
          pending ||= payload;
          paused = true;
          onStatus('error');
          onError(error);
        }
      }
      if (!paused) onStatus('saved');
    } finally {
      running = null;
    }
  }

  function start() {
    if (!running && pending && !paused) running = drain();
    return running || Promise.resolve();
  }

  return {
    enqueue(payload) {
      latest = payload;
      pending = payload;
      return start();
    },
    retry() {
      paused = false;
      return start();
    },
    whenIdle: () => running || Promise.resolve(),
    latest: () => latest,
    revision: () => revision,
  };
}