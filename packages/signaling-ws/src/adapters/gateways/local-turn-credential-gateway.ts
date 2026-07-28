import type {
  IceServerConfig,
  ITurnCredentialGateway
} from '../../domains/turn-credential.js';

/**
 * Local development TURN credential gateway. Returns a STUN-only config
 * without ever calling Metered or reading METERED_* env, so the local
 * signaling server stays deterministic and offline.
 */
export class LocalTurnCredentialGateway implements ITurnCredentialGateway {
  private static readonly config: IceServerConfig = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    // Far-future expiry so the cache is never invalidated mid-dev-session.
    expiresAt: Number.MAX_SAFE_INTEGER
  };

  async fetchIceServers(): Promise<IceServerConfig> {
    return LocalTurnCredentialGateway.config;
  }
}
