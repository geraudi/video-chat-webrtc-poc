import type { IceServer } from '@repo/signaling-types/messages';

export interface IceServerConfig {
  iceServers: IceServer[];
  expiresAt: number;
}

export interface ITurnCredentialGateway {
  fetchIceServers(): Promise<IceServerConfig>;
}
