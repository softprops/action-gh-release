import { expect, it, vi } from 'vitest';

const run = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('../src/run', () => ({ run }));

it('starts the action orchestration', async () => {
  await import('../src/main');

  expect(run).toHaveBeenCalledOnce();
});
