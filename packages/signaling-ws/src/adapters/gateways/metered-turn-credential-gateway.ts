import type { IceServer } from '@repo/signaling-types/messages';
import type {
  IceServerConfig,
  ITurnCredentialGateway
} from '../../domains/turn-credential.js';

/**
 * Credential lifetime in seconds. 14400 (4h) is Metered's minimum and far
 * exceeds any plausible single call in this PoC, so no mid-call renewal is
 * needed. See the plan's lifetime section.
 */
const EXPIRY_IN_SECONDS = 14400;

/**
 * Each individual Metered call is bounded so a hung upstream cannot burn the
 * full Lambda timeout. The frontend waits at most 4s before falling back to
 * STUN-only, so this gives a comfortable margin under the 8s Lambda timeout.
 */
const METERED_REQUEST_TIMEOUT_MS = 8_000;

/**
 * Treat a credential as stale this far (in seconds) before its real expiry, to
 * absorb clock skew and avoid handing a client a credential that dies mid
 * call-setup. Mirrors the frontend's CREDENTIAL_SAFETY_MARGIN_MS.
 */
const CREDENTIAL_SAFETY_MARGIN_S = 60;

const STUN_FALLBACK: IceServer = { urls: 'stun:stun.l.google.com:19302' };

/**
 * Fixed label shared by every credential this app mints. Metered credentials
 * are app-scoped (the API takes no client identifier), so one valid credential
 * can serve every browser. Posting a credential with a label that already
 * exists overwrites the old one, and expired credentials don't count against
 * the account's create-time cap — so a single shared label keeps the live set
 * at ~1 regardless of how many Lambda instances mint concurrently.
 */
const SHARED_LABEL = 'wc-poc-shared';

/**
 * Best-effort: read the failure body so Metered's diagnostic (e.g. a
 * "Maximum credential limit reached" message) lands in CloudWatch alongside
 * the HTTP status. Uses `.text()` (not `.json()`) because Metered may return
 * non-JSON on infra failures, and text is always loggable. Never throws — body
 * reading must not mask the original status failure.
 */
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

/** A single credential row from the v2 LIST endpoint. */
interface MeteredCredential {
  apiKey: string;
  expiryInSeconds: number;
  label: string;
  expired: boolean;
}

interface ListCredentialsResponse {
  data: MeteredCredential[];
}

/**
 * Production TURN credential gateway. The ONLY adapter that knows the Metered
 * URL, the permanent secretKey and the credential protocol.
 *
 * Reuse-first: lists existing non-expired credentials under the shared label
 * and reuses one if present; mints a new one (overwriting the label) only when
 * none is valid. Returns the final iceServers array (TURN entries from Metered
 * + a Google STUN entry) so callers are ignorant of the provider.
 *
 * Reads METERED_APP_DOMAIN and METERED_SECRET_KEY from the constructor so the
 * env lookup is explicit and the adapter stays unit-testable.
 */
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
    // 1. Try to reuse an existing, still-valid credential under the shared
    //    label — avoids minting (and hitting the account's create-time cap).
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
      // Listing is best-effort for reuse; if it fails, fall through to mint.
      console.warn(
        'Metered listCredentialsByLabel failed; minting fresh credential:',
        err
      );
    }

    // 2. Mint only when reuse found nothing valid.
    if (!apiKey) {
      apiKey = await this.createCredential();
    }

    // 3. Fetch the iceServers for the chosen apiKey. Self-heal: if the reused
    //    credential was revoked/invalid (4xx), mint a fresh one and retry once.
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

    // When reusing, derive expiresAt from the credential's actual remaining
    // lifetime rather than the full 14400s window.
    return {
      iceServers: [...turnServers, STUN_FALLBACK],
      expiresAt: Date.now() + reuseExpiryInSeconds * 1000
    };
  }

  /** Select the first non-expired credential with a usable remaining lifetime. */
  private pickValidCredential(
    items: MeteredCredential[]
  ): MeteredCredential | null {
    return (
      items.find(
        c => !c.expired && c.expiryInSeconds > CREDENTIAL_SAFETY_MARGIN_S
      ) ?? null
    );
  }

  /** GET v2: list non-expired credentials under the shared label. */
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

/** A 4xx from the fetch step suggests the reused credential is no longer valid. */
function apiKeyWasLikelyRevoked(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /\b(40[134]|404|410)\b/.test(message);
}
