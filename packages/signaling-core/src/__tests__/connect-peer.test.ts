import { describe, expect, it, vi } from 'vitest';
import type { IConnectionRepository } from '../domains/connection.js';
import { ConnectPeer } from '../usecases/connect-peer.js';

describe('ConnectPeer', () => {
  it('calls repo.create with the connectionId', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const uc = new ConnectPeer({
      create,
      findAvailable: vi.fn(),
      setAvailable: vi.fn(),
      setUnavailable: vi.fn(),
      delete: vi.fn(),
      countAvailable: vi.fn()
    } as unknown as IConnectionRepository);

    await uc.execute('conn-1');
    expect(create).toHaveBeenCalledWith('conn-1');
  });
});
