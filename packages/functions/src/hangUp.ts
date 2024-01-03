import handler from '@aws-server/core/handler';
import apiGateway from '@aws-server/core/apiGateway';

export const main = handler(async (event) => {
  // strangerId
  const originalMessage = JSON.parse(event.body as string);
  const connectionId = event.requestContext.connectionId;

  const message = {
    action: originalMessage.action,
    strangerId: connectionId
  };

  // Send the message to the stranger
  apiGateway.setApiClient(event);
  await apiGateway.postToConnection(originalMessage.strangerId, message);

  return 'Message hangUp sent';

});
