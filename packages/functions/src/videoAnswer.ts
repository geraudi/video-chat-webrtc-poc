import handler from '@aws-server/core/handler';
import apiGateway from '@aws-server/core/apiGateway';
import { VideoAnswerInputMessage, VideoAnswerOutputMessage } from '@aws-server/core/types/messages';

export const main = handler(async (event, context) => {
  const originalMessage: VideoAnswerOutputMessage = JSON.parse(event.body as string);
  const connectionId = event.requestContext.connectionId as string;

  const message: VideoAnswerInputMessage = {
    action: originalMessage.action,
    sdp: originalMessage.sdp,
    strangerId: connectionId
  };

  // Send the message to the given client
  apiGateway.setApiClient(event);
  await apiGateway.postToConnection(originalMessage.senderId, message);

  return 'Message videoAnswer sent';
});
