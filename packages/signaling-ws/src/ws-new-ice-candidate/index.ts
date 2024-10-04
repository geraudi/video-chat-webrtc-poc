import { APIGatewayProxyEvent } from 'aws-lambda';
import { NewIceCandidateMessage } from '@repo/signaling-types/messages';
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi'; // eslint-disable-next-line turbo/no-undeclared-env-vars

export const handler = async (event: APIGatewayProxyEvent) => {
  const originalMessage: NewIceCandidateMessage = JSON.parse(
    event.body as string,
  );
  const connectionId = event.requestContext.connectionId as string;

  const message = {
    action: originalMessage.action,
    candidate: originalMessage.candidate,
    strangerId: connectionId,
  };

  const domain = event.requestContext.domainName;
  const stage = event.requestContext.stage;
  const callbackUrl = `https://${domain}/${stage}`;
  const client = new ApiGatewayManagementApiClient({ endpoint: callbackUrl });

  const command = new PostToConnectionCommand({
    ConnectionId: originalMessage.strangerId,
    Data: JSON.stringify(message),
  });

  try {
    // Send the message
    await client.send(command);
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Message newIceCandidate sent.',
      }),
    };
  } catch (error) {
    console.error('Error sending message:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Failed to send message.',
      }),
    };
  }
};
