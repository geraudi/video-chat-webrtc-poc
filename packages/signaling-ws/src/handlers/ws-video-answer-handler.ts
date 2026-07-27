import { getUseCases } from '../lib/di-container.js';
import { wrapHandler } from '../lib/wrap-handler.js';

/**
 * AWS Lambda handler for the videoAnswer action.
 */
export const handler = wrapHandler('videoAnswer', async event => {
  const connectionId = event.requestContext.connectionId;
  const message = JSON.parse(event.body ?? '{}');

  if (!connectionId || !message.strangerId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Missing connection or stranger id.' })
    };
  }

  const { forwardMessage } = getUseCases(event);
  await forwardMessage.execute(connectionId, message.strangerId, message);

  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Message videoAnswer sent.' })
  };
});
