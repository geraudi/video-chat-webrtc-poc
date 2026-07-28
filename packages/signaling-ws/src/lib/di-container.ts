import type { APIGatewayProxyEvent } from 'aws-lambda';
import { AwsApiGatewaySignalingGateway } from '../adapters/gateways/aws-api-gateway-signaling-gateway.js';
import { MeteredTurnCredentialGateway } from '../adapters/gateways/metered-turn-credential-gateway.js';
import { TursoConnectionRepository } from '../adapters/repositories/turso-connection-repository.js';
import { ConnectPeer } from '../usecases/connect-peer.js';
import { DisconnectPeer } from '../usecases/disconnect-peer.js';
import { FindStranger } from '../usecases/find-stranger.js';
import { ForwardMessage } from '../usecases/forward-message.js';
import { RequestTurnCredentials } from '../usecases/request-turn-credentials.js';

/**
 * Production composition root.
 * Dependencies are created lazily (getters) so each Lambda only requires
 * the configuration its own use case consumes: forwarding Lambdas run
 * without TURSO_* variables, and no Lambda needs DOMAIN_NAME/STAGE since
 * the callback endpoint comes from the request context.
 */

// The repository is memoized so the Turso client is reused across warm invocations
let _repo: TursoConnectionRepository | undefined;

function getRepo(): TursoConnectionRepository {
  if (!_repo) {
    const dbUrl = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!dbUrl || !authToken) {
      throw new Error(
        'TURSO_DATABASE_URL and TURSO_AUTH_TOKEN environment variables are required'
      );
    }

    _repo = new TursoConnectionRepository(dbUrl, authToken);
  }
  return _repo;
}

function getGateway(
  event: APIGatewayProxyEvent
): AwsApiGatewaySignalingGateway {
  const { domainName, stage } = event.requestContext;

  if (!domainName || !stage) {
    throw new Error(
      'domainName and stage are missing from the request context'
    );
  }

  return new AwsApiGatewaySignalingGateway(domainName, stage);
}

/**
 * Builds the production TURN credential gateway. Only the ws-turn-credentials
 * Lambda reaches this getter, so METERED_* is only required there — the other
 * Lambdas never import the Metered adapter and never fail on missing env.
 */
function getTurnGateway(): MeteredTurnCredentialGateway {
  const appDomain = process.env.METERED_APP_DOMAIN;
  const secretKey = process.env.METERED_SECRET_KEY;

  if (!appDomain || !secretKey) {
    throw new Error(
      'METERED_APP_DOMAIN and METERED_SECRET_KEY environment variables are required'
    );
  }

  return new MeteredTurnCredentialGateway(appDomain, secretKey);
}

export function getUseCases(event: APIGatewayProxyEvent) {
  return {
    get findStranger() {
      return new FindStranger(getRepo(), getGateway(event));
    },
    get forwardMessage() {
      return new ForwardMessage(getGateway(event));
    },
    get connectPeer() {
      return new ConnectPeer(getRepo());
    },
    get disconnectPeer() {
      return new DisconnectPeer(getRepo());
    },
    get requestTurnCredentials() {
      return new RequestTurnCredentials(getTurnGateway(), getGateway(event));
    }
  };
}
