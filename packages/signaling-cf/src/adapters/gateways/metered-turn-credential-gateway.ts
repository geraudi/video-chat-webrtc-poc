import type { IceServer } from '@repo/signaling-types/messages';
import type {
  IceServerConfig,
  ITurnCredentialGateway
} from '../../domains/turn-credential.js';

const EXPIRY_IN_SECONDS = 14400;
const METERED_REQUEST_TIMEOUT_MS = 8_000;
const CREDENTIAL_SAFETY_MARGIN_S = 60;
const STUN_FALLBACK: IceServer = { urls: 'stun:stun.l.google.com:19302' };
const SHARED_LABEL = 'wc-poc-shared';

async function readErrorBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text ? ` body=${text}` : '';
  } catch {
    return '';
  }
}

interface CreateCredentialResponse {
  apiKey: string;
}

interface MeteredIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

interface MeteredCredential {
  apiKey: string;
  expiryInSeconds: number;
  label: string;
  expired: boolean;
}

interface ListCredentialsResponse {
  data: MeteredCredential[];
}

export class MeteredTurnCredentialGateway implements ITurnCredentialGateway {
  constructor(
    private readonly appDomain: string,
    private readonly secretKey: string
  ) {
    if (!appDomain || !secretKey) {
      throw new Error('METERED_APP_DOMAIN and METERED_SECRET_KEY are required');
    }
  }

  async fetchIceServers(): Promise<IceServerConfig> {
    let apiKey: string | null = null;
    let reuseExpiryInSeconds = EXPIRY_IN_SECONDS;
    try {
      const valid = this.pickValidCredential(
        await this.listCredentialsByLabel()
      );
      if (valid) {
        apiKey = valid.apiKey;
        reuseExpiryInSeconds = valid.expiryInSeconds;
      }
    } catch (err) {
      console.warn(
        'Metered listCredentialsByLabel failed; minting fresh credential:',
        err
      );
    }

    if (!apiKey) {
      apiKey = await this.createCredential();
    }

    let turnServers: IceServer[];
    try {
      turnServers = await this.fetchCredentials(apiKey);
    } catch (err) {
      if (
        apiKeyWasLikelyRevoked(err) &&
        reuseExpiryInSeconds !== EXPIRY_IN_SECONDS
      ) {
        console.warn(
          'Reused Metered credential rejected; minting a fresh one:',
          err
        );
        apiKey = await this.createCredential();
        turnServers = await this.fetchCredentials(apiKey);
      } else {
        throw err;
      }
    }

    return {
      iceServers: [...turnServers, STUN_FALLBACK],
      expiresAt: Date.now() + reuseExpiryInSeconds * 1000
    };
  }

  private pickValidCredential(
    items: MeteredCredential[]
  ): MeteredCredential | null {
    return (
      items.find(
        c => !c.expired && c.expiryInSeconds > CREDENTIAL_SAFETY_MARGIN_S
      ) ?? null
    );
  }

  private async listCredentialsByLabel(): Promise<MeteredCredential[]> {
    const url =
      `https://${this.appDomain}/api/v2/turn/credentials` +
      `?secretKey=${encodeURIComponent(this.secretKey)}` +
      `&label=${encodeURIComponent(SHARED_LABEL)}`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(METERED_REQUEST_TIMEOUT_MS)
    });

    if (!response.ok) {
      throw new Error(
        `Metered listCredentialsByLabel failed: ${response.status} ${response.statusText}${await readErrorBody(response)}`
      );
    }

    const data = (await response.json()) as ListCredentialsResponse;
    return data.data ?? [];
  }

  private async createCredential(): Promise<string> {
    const url =
      `https://${this.appDomain}/api/v1/turn/credential` +
      `?secretKey=${encodeURIComponent(this.secretKey)}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expiryInSeconds: EXPIRY_IN_SECONDS,
        label: SHARED_LABEL
      }),
      signal: AbortSignal.timeout(METERED_REQUEST_TIMEOUT_MS)
    });

    if (!response.ok) {
      throw new Error(
        `Metered createCredential failed: ${response.status} ${response.statusText}${await readErrorBody(response)}`
      );
    }

    const data = (await response.json()) as CreateCredentialResponse;
    if (!data.apiKey) {
      throw new Error('Metered createCredential response missing apiKey');
    }
    return data.apiKey;
  }

  private async fetchCredentials(apiKey: string): Promise<IceServer[]> {
    const url =
      `https://${this.appDomain}/api/v1/turn/credentials` +
      `?apiKey=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(METERED_REQUEST_TIMEOUT_MS)
    });

    if (!response.ok) {
      throw new Error(
        `Metered fetchCredentials failed: ${response.status} ${response.statusText}${await readErrorBody(response)}`
      );
    }

    const data = (await response.json()) as MeteredIceServer[];
    return data.map(server => ({
      urls: server.urls,
      username: server.username,
      credential: server.credential
    }));
  }
}

function apiKeyWasLikelyRevoked(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /\b(40[134]|404|410)\b/.test(message);
}
