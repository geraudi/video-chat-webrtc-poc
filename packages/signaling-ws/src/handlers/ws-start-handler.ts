import { getUseCases } from '../lib/di-container.js';
import { wrapHandler } from '../lib/wrap-handler.js';

/**
 * AWS Lambda handler for the START action.
 */
export const handler = wrapHandler('start', async event => {
  const connectionId = event.requestContext.connectionId;

  if (!connectionId) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'No connection id.' })
    };
  }

  const { findStranger } = getUseCases(event);
  const result = await findStranger.execute(connectionId);

  return {
    statusCode: 201,
    body: JSON.stringify({
      message: result.status === 'waiting' ? 'Available.' : 'Init offer sent.'
    })
  };
});
