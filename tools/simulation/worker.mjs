import { parentPort } from 'node:worker_threads';
import { runSimulation } from './runner.mjs';
parentPort.on('message', ({ index, config }) => {
  try {
    const result = runSimulation(config);
    if (result.outcome === 'error' && !config.record) {
      result.trace = runSimulation({ ...config, record: true }).trace;
    }
    parentPort.postMessage({ index, result });
  } catch (err) { parentPort.postMessage({ index, error: err.stack }); }
});
