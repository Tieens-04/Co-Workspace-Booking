import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export async function terminateProcessTree(child: ChildProcess): Promise<void> {
  if (child.pid === undefined) return;
  if (process.platform === 'win32') {
    await exec('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      timeout: 10000,
      windowsHide: true,
    });
  } else {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ESRCH') throw error;
    }
  }
}

/** Owns each CLI process until close, including after a failed tree termination. */
export function createProcessRunner(terminate = terminateProcessTree) {
  const active = new Set<() => Promise<void>>();

  return {
    async run(
      executable: string,
      args: string[],
      options: { cwd?: string; env?: Record<string, string | undefined> } = {},
      timeout = 30000,
    ): Promise<string> {
      return new Promise((resolveCommand, rejectCommand) => {
        const child = spawn(executable, args, {
          ...options,
          detached: process.platform !== 'win32',
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        });
        let stdout = '';
        let stderr = '';
        let closed = false;
        let stopping: Promise<void> | undefined;
        let interruption: Error | undefined;
        let timer: ReturnType<typeof setTimeout>;
        let closeChild: () => void;
        const close = new Promise<void>((done) => {
          closeChild = done;
        });

        const stop = (): Promise<void> => {
          if (closed) return Promise.resolve();
          if (stopping) return stopping;
          interruption ??= new Error(
            `Command interrupted after timeout or cleanup (${timeout}ms): ${stderr.trim()}`,
          );
          stopping = (async () => {
            try {
              await terminate(child);
              let closeTimer: ReturnType<typeof setTimeout> | undefined;
              try {
                await Promise.race([
                  close,
                  new Promise<never>((_done, reject) => {
                    closeTimer = setTimeout(
                      () => reject(new Error('Owned process did not close after termination.')),
                      5000,
                    );
                  }),
                ]);
              } finally {
                clearTimeout(closeTimer);
              }
            } catch {
              // Preserve the live entry and allow cleanup to retry this exact tree.
              stopping = undefined;
              const failure = new Error(
                'Could not terminate the owned process tree; cleanup must retry.',
              );
              rejectCommand(failure);
              throw failure;
            }
          })();
          return stopping;
        };
        active.add(stop);
        // Bounded tails avoid execFile maxBuffer killing only the parent CLI.
        child.stdout.on('data', (data: Buffer) => {
          stdout = (stdout + data.toString()).slice(-65536);
        });
        child.stderr.on('data', (data: Buffer) => {
          stderr = (stderr + data.toString()).slice(-16384);
        });
        child.once('error', () => rejectCommand(new Error(`Could not start ${executable}.`)));
        child.once('close', (code) => {
          closed = true;
          closeChild();
          clearTimeout(timer);
          active.delete(stop);
          if (interruption) rejectCommand(interruption);
          else if (code !== 0)
            rejectCommand(new Error(`Command exited with code ${code}: ${stderr.trim()}`));
          else resolveCommand(stdout.trim());
        });
        timer = setTimeout(() => {
          void stop().catch(() => {});
        }, timeout);
      });
    },

    async stopAll(): Promise<void> {
      const results = await Promise.allSettled([...active].map((stop) => stop()));
      if (active.size || results.some((result) => result.status === 'rejected')) {
        throw new Error('Owned command trees remain active; refusing cleanup.');
      }
    },
  };
}
