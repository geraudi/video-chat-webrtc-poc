import { getUseCases } from '../lib/di-container.js';
import { wrapHandler } from '../lib/wrap-handler.js';

/**
 * AWS Lambda handler for the $connect action.
 */
export const handler = wrapHandler('$connect', async event => {
  const connectionId = event.requestContext.connectionId;

  if (!connectionId) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'No connection id.' })
    };
  }

  const { connectPeer } = getUseCases(event);
  await connectPeer.execute(connectionId);

  return { statusCode: 200, body: JSON.stringify({ message: 'Connect.' }) };
});
