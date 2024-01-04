import handler from '@aws-server/core/handler';
import apiGateway from '@aws-server/core/apiGateway';
import { HangUpMessage } from '@aws-server/core/types/messages';

export const main = handler(async (event) => {
  // strangerId
  const originalMessage: HangUpMessage = JSON.parse(event.body as string);
  const connectionId = event.requestContext.connectionId as string;

  const message: HangUpMessage = {
    action: originalMessage.action,
    strangerId: connectionId
  };

  // Send the message to the stranger
  apiGateway.setApiClient(event);
  await apiGateway.postToConnection(originalMessage.strangerId, message);

  return 'Message hangUp sent';

});
