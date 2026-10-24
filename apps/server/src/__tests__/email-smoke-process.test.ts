import type { ChildProcess } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { createProcessRunner } from './support/email-smoke-process.js';

describe('email smoke process ownership', () => {
  it('refuses cleanup after failed termination and retries the still-owned live child', async () => {
    let firstAttempt = true;
    let ownedChild: ChildProcess | undefined;
    const runner = createProcessRunner(async (child) => {
      ownedChild = child;
      if (firstAttempt) {
        firstAttempt = false;
        throw new Error('Simulated tree termination failure');
      }
      if (!child.kill('SIGKILL')) throw new Error('Could not stop the owned fixture child.');
    });
    const running = runner.run(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {}, 10000);
    const outcome = running.catch((error: unknown) => error);
    try {
      await expect(runner.stopAll()).rejects.toThrow('refusing cleanup');
      const pid = ownedChild?.pid;
      if (pid === undefined) throw new Error('Expected the owned child to have started.');
      expect(() => process.kill(pid, 0)).not.toThrow();
      await runner.stopAll();
      expect(() => process.kill(pid, 0)).toThrow();
      expect(await outcome).toMatchObject({
        message: 'Could not terminate the owned process tree; cleanup must retry.',
      });
    } finally {
      await runner.stopAll();
    }
  });
});
