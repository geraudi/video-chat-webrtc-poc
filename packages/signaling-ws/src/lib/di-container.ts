import { TursoConnectionRepository } from '../adapters/repositories/turso-connection-repository.js';
import { AwsApiGatewaySignalingGateway } from '../adapters/gateways/aws-api-gateway-signaling-gateway.js';
import { FindStranger } from '../usecases/find-stranger.js';
import { ForwardMessage } from '../usecases/forward-message.js';
import { ConnectPeer } from '../usecases/connect-peer.js';
import { DisconnectPeer } from '../usecases/disconnect-peer.js';

/**
 * Production dependency injection container.
 * Creates singleton instances of use cases with their dependencies.
 */
let _findStranger: FindStranger | undefined;
let _forwardMessage: ForwardMessage | undefined;
let _connectPeer: ConnectPeer | undefined;
let _disconnectPeer: DisconnectPeer | undefined;

function getRepo() {
  const dbUrl = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!dbUrl || !authToken) {
    throw new Error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN environment variables are required');
  }

  return new TursoConnectionRepository(dbUrl, authToken);
}

function getGateway() {
  const domainName = process.env.DOMAIN_NAME;
  const stage = process.env.STAGE;

  if (!domainName || !stage) {
    throw new Error('DOMAIN_NAME and STAGE environment variables are required');
  }

  return new AwsApiGatewaySignalingGateway(domainName, stage);
}

export function getUseCases() {
  const repo = getRepo();
  const gateway = getGateway();

  return {
    findStranger: _findStranger ??= new FindStranger(repo, gateway),
    forwardMessage: _forwardMessage ??= new ForwardMessage(gateway),
    connectPeer: _connectPeer ??= new ConnectPeer(repo),
    disconnectPeer: _disconnectPeer ??= new DisconnectPeer(repo)
  };
}