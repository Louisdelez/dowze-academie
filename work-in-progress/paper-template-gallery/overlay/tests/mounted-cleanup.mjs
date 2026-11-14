import {readFileSync} from 'node:fs';
import {join,isAbsolute} from 'node:path';
import {totalmem} from 'node:os';

export function requireBoundedMountedCheck() {
  if (process.platform !== 'linux' || totalmem() >= 12 * 1024 ** 3) return;
  const refuse = () => {
    throw new Error('Mounted check refused on the Dell: use bash scripts/run-dell-safe-check.sh -- node tests/runner.mjs. No unbounded fallback.');
  };
  try {
    const relative = readFileSync('/proc/self/cgroup', 'utf8').split('\n').find(line => line.startsWith('0::'))?.slice(3);
    if (!relative || !relative.split('/').at(-1)?.startsWith('dowze-dell-check-')) return refuse();
    const directory = join('/sys/fs/cgroup', relative);
    const memory = readFileSync(join(directory, 'memory.max'), 'utf8').trim();
    const swap = readFileSync(join(directory, 'memory.swap.max'), 'utf8').trim();
    const [quota, period] = readFileSync(join(directory, 'cpu.max'), 'utf8').trim().split(/\s+/);
    if (!/^\d+$/.test(memory) || Number(memory) > 900 * 1024 ** 2 ||
        !/^\d+$/.test(swap) || Number(swap) > 64 * 1024 ** 2 ||
        !/^\d+$/.test(quota) || !/^\d+$/.test(period) || Number(period) <= 0 || Number(quota) / Number(period) > .25) return refuse();
  } catch (error) {
    if (String(error?.message).startsWith('Mounted check refused')) throw error;
    return refuse();
  }
}

// Remote QA writes reports in its isolated staging directory, never production.
export function mountedAuditPath(filename) {
  if (!/^[a-zA-Z0-9_.-]+\.json$/.test(filename)) throw new Error('Invalid audit artifact filename');
  const root = process.env.DOWZE_AUDIT_OUTPUT_DIR || '/home/louis/Documents/Dowze-Notebook-Implementation-20261012';
  if (!isAbsolute(root)) throw new Error('The audit output directory must be absolute');
  return join(root, filename);
}

// A failed React unmount must not skip closing Vite, DOM windows or fixtures.
// The outer systemd memory/runtime limits remain necessary for synchronous loops.
export async function mountedCleanup(steps, timeoutMs = 3000) {
  const failures = [];
  for (const [label, operation] of steps) {
    let timer;
    try {
      await Promise.race([
        Promise.resolve().then(operation),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`${label}: cleanup timeout`)), timeoutMs);
        }),
      ]);
    } catch (error) {
      failures.push(new Error(`${label}: ${String(error?.message ?? error).slice(0, 300)}`));
    } finally {
      clearTimeout(timer);
    }
  }
  if (failures.length) {
    process.exitCode = 1;
    throw new AggregateError(failures, 'Mounted fixture cleanup failed; the test run is not successful.');
  }
}
