import handler from '@aws-server/core/handler';
import apiGateway from '@aws-server/core/apiGateway';

export const main = handler(async (event, context) => {
  // sdp and senderId
  const originalMessage = JSON.parse(event.body as string);
  const connectionId = event.requestContext.connectionId;

  const message = {
    action: originalMessage.action,
    sdp: originalMessage.sdp,
    strangerId: connectionId
  };

  // Send the message to the given client
  apiGateway.setApiClient(event);
  await apiGateway.postToConnection(originalMessage.senderId, message);

  return 'Message videoAnswer sent';
});
