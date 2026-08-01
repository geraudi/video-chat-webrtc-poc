import { Actions, type InitOfferMessage } from '@repo/signaling-types/messages';
import { describe, expect, it, vi } from 'vitest';
import type {
  Connection,
  IConnectionRepository
} from '../domains/connection.js';
import type { ISignalingGateway } from '../domains/signaling.js';
import { FindStranger } from '../usecases/find-stranger.js';

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
    countAvailable: vi.fn(),
    ...overrides
  } as IConnectionRepository;
}

function makeGateway(send?: ISignalingGateway['send']): ISignalingGateway {
  return { send: send ?? vi.fn() };
}

describe('FindStranger', () => {
  it('atomically claims a peer and sends initOffer to both', async () => {
    const stranger: Connection = { id: 'conn-B', isAvailable: true };
    const repo = makeRepo({
      claimAvailable: vi.fn().mockResolvedValue(stranger)
    });
    const gateway = makeGateway();
    const uc = new FindStranger(repo, gateway);

    const result = await uc.execute('conn-A');

    expect(repo.claimAvailable).toHaveBeenCalledWith('conn-A');
    expect(repo.setUnavailable).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'matched' });
    expect(gateway.send).toHaveBeenCalledTimes(2);
    expect(gateway.send).toHaveBeenNthCalledWith(
      1,
      'conn-A',
      expect.objectContaining({
        action: Actions.INI_OFFER,
        role: 'caller',
        strangerId: 'conn-B'
      }) as InitOfferMessage
    );
    expect(gateway.send).toHaveBeenNthCalledWith(
      2,
      'conn-B',
      expect.objectContaining({
        action: Actions.INI_OFFER,
        role: 'callee',
        strangerId: 'conn-A'
      }) as InitOfferMessage
    );
  });

  it('marks the caller as available and waits when no peer can be claimed', async () => {
    const repo = makeRepo({
      claimAvailable: vi.fn().mockResolvedValue(null)
    });
    const setAvailable = vi.fn();
    repo.setAvailable = setAvailable;
    const gateway = makeGateway();
    const uc = new FindStranger(repo, gateway);

    const result = await uc.execute('conn-A');

    expect(setAvailable).toHaveBeenCalledWith('conn-A');
    expect(gateway.send).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'waiting' });
  });
});
