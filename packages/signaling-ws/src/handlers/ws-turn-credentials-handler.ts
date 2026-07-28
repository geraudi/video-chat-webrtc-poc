import { getUseCases } from '../lib/di-container.js';
import { wrapHandler } from '../lib/wrap-handler.js';

/**
 * AWS Lambda handler for the REQUEST_TURN_CREDENTIALS action.
 */
export const handler = wrapHandler('requestTurnCredentials', async event => {
  const connectionId = event.requestContext.connectionId;

  if (!connectionId) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'No connection id.' })
    };
  }

  const { requestTurnCredentials } = getUseCases(event);
  await requestTurnCredentials.execute(connectionId);

  return {
    statusCode: 201,
    body: JSON.stringify({ message: 'Turn credentials sent.' })
  };
});
