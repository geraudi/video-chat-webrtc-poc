import type {
  IceServer,
  RequestTurnCredentialsMessage
} from '@repo/signaling-types/messages';
import { Actions } from '@repo/signaling-types/messages';
import { type Signaler, sendToServer } from './types';

const CREDENTIAL_SAFETY_MARGIN_MS = 60_000;
const CREDENTIAL_REQUEST_TIMEOUT_MS = 8_000;
const STUN_FALLBACK: IceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

export class TurnCredentialCache {
  private cachedIceServers: IceServer[] | null = null;
  private cachedExpiresAt = 0;
  private credentialPromise: Promise<IceServer[]> | null = null;
  private credentialResolver: ((servers: IceServer[]) => void) | null = null;
  private credentialRejecter: ((error: Error) => void) | null = null;
  private credentialTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly signaler: Signaler,
    private readonly onClear?: () => void
  ) {}

  private resolveCredentialRequest(servers: IceServer[]): void {
    if (this.credentialTimer) {
      clearTimeout(this.credentialTimer);
      this.credentialTimer = null;
    }
    this.credentialResolver?.(servers);
    this.credentialResolver = null;
    this.credentialRejecter = null;
  }

  private ensureCredentialArrived(): Promise<IceServer[]> {
    return new Promise<IceServer[]>((resolve, reject) => {
      this.credentialResolver = resolve;
      this.credentialRejecter = reject;
      this.credentialTimer = setTimeout(() => {
        const rejecter = this.credentialRejecter;
        this.credentialResolver = null;
        this.credentialRejecter = null;
        this.credentialTimer = null;
        rejecter?.(new Error('TURN credential request timed out'));
      }, CREDENTIAL_REQUEST_TIMEOUT_MS);
    });
  }

  async getIceServers(): Promise<IceServer[]> {
    if (
      this.cachedIceServers &&
      Date.now() < this.cachedExpiresAt - CREDENTIAL_SAFETY_MARGIN_MS
    ) {
      return this.cachedIceServers;
    }

    if (this.credentialPromise) {
      return this.credentialPromise;
    }

    const message: RequestTurnCredentialsMessage = {
      action: Actions.REQUEST_TURN_CREDENTIALS
    };

    this.credentialPromise = (async () => {
      sendToServer(this.signaler, message);
      return await this.ensureCredentialArrived();
    })().finally(() => {
      this.credentialPromise = null;
    });

    try {
      return await this.credentialPromise;
    } catch (error) {
      console.warn(
        'TURN credential request failed; falling back to STUN-only:',
        error
      );
      return STUN_FALLBACK;
    }
  }

  cacheCredentials(servers: IceServer[], expiresAt: number): void {
    this.cachedIceServers = servers;
    this.cachedExpiresAt = expiresAt;
    this.resolveCredentialRequest(servers);
  }

  clearCredentialCache(): void {
    this.cachedIceServers = null;
    this.cachedExpiresAt = 0;
    this.onClear?.();
  }

  // Test helper to bypass network request
  setIceServersForTest(servers: IceServer[]): void {
    this.cachedIceServers = servers;
    this.cachedExpiresAt = Date.now() + 3600_000; // 1 hour from now
  }
}
