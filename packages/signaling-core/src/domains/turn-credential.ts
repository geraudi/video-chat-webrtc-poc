import type { IceServer } from '@repo/signaling-types/messages';

/**
 * TURN credential config returned by a credential gateway.
 * `expiresAt` is epoch milliseconds; the frontend caches the iceServers
 * until that time (minus a safety margin) and re-requests afterwards.
 */
export interface IceServerConfig {
  iceServers: IceServer[];
  expiresAt: number;
}

/**
 * Port (interface) for issuing short-lived TURN credentials.
 * The concrete Metered adapter is the only thing that knows the protocol;
 * use cases stay free of any provider-specific I/O.
 */
export interface ITurnCredentialGateway {
  fetchIceServers(): Promise<IceServerConfig>;
}
