import { Actions, type HangUpMessage } from '@repo/signaling-types/messages';
import { describe, expect, it, vi } from 'vitest';
import type { IConnectionRepository } from '../domains/connection.js';
import type { ISignalingGateway } from '../domains/signaling.js';
import { DisconnectPeer } from '../usecases/disconnect-peer.js';

function makeRepo(
  overrides: Partial<IConnectionRepository> = {}
): IConnectionRepository {
  return {
    findAvailable: vi.fn(),
    claimAvailable: vi.fn(),
    setAvailable: vi.fn(),
    setUnavailable: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    pair: vi.fn(),
    getStranger: vi.fn(),
    unpair: vi.fn(),
    countAvailable: vi.fn(),
    ...overrides
  } as IConnectionRepository;
}

function makeGateway(send?: ISignalingGateway['send']): ISignalingGateway {
  return { send: send ?? vi.fn() };
}

describe('DisconnectPeer', () => {
  it('notifies the stranger, unparis them and deletes the peer when matched', async () => {
    const repo = makeRepo({
      getStranger: vi.fn().mockResolvedValue('conn-A')
    });
    const gateway = makeGateway();
    const uc = new DisconnectPeer(repo, gateway);

    await uc.execute('conn-B');

    expect(repo.getStranger).toHaveBeenCalledWith('conn-B');
    expect(gateway.send).toHaveBeenCalledWith(
      'conn-A',
      expect.objectContaining({
        action: Actions.HANG_UP,
        strangerId: 'conn-B'
      }) as HangUpMessage
    );
    expect(repo.unpair).toHaveBeenCalledWith('conn-A', 'conn-B');
    expect(repo.delete).toHaveBeenCalledWith('conn-B');
  });

  it('just deletes the peer when it was not matched', async () => {
    const repo = makeRepo({
      getStranger: vi.fn().mockResolvedValue(null)
    });
    const gateway = makeGateway();
    const uc = new DisconnectPeer(repo, gateway);

    await uc.execute('conn-B');

    expect(gateway.send).not.toHaveBeenCalled();
    expect(repo.unpair).not.toHaveBeenCalled();
    expect(repo.delete).toHaveBeenCalledWith('conn-B');
  });
});
