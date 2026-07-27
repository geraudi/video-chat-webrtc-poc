import { getUseCases } from '../lib/di-container.js';
import { wrapHandler } from '../lib/wrap-handler.js';

/**
 * AWS Lambda handler for the $disconnect action.
 */
export const handler = wrapHandler('$disconnect', async event => {
  const connectionId = event.requestContext.connectionId;

  if (!connectionId) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'No connection id.' })
    };
  }

  const { disconnectPeer } = getUseCases(event);
  await disconnectPeer.execute(connectionId);

  return { statusCode: 200, body: JSON.stringify({ message: 'Disconnect.' }) };
});
