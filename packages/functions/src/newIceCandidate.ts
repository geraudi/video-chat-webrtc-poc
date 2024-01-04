import handler from '@aws-server/core/handler';
import apiGateway from '@aws-server/core/apiGateway';
import { NewIceCandidateMessage } from '@aws-server/core/types/messages';

export const main = handler(async (event) => {
  // strangerId, candidate
  const originalMessage: NewIceCandidateMessage = JSON.parse(event.body as string);
  const connectionId = event.requestContext.connectionId as string;

  const message = {
    action: originalMessage.action,
    candidate: originalMessage.candidate,
    strangerId: connectionId
  };

  // Send the message to the given client
  apiGateway.setApiClient(event);
  await apiGateway.postToConnection(originalMessage.strangerId, message);

  return 'Message newIceCandidate sent';
});
