import { APIGatewayProxyEvent } from 'aws-lambda';
import { HangUpMessage } from '@repo/signaling-types/messages';
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';

export const handler = async (event: APIGatewayProxyEvent) => {
  const originalMessage: HangUpMessage = JSON.parse(event.body as string);
  const connectionId = event.requestContext.connectionId as string;

  const domain = event.requestContext.domainName;
  const stage = event.requestContext.stage;
  const callbackUrl = `https://${domain}/${stage}`;
  const apiClient = new ApiGatewayManagementApiClient({
    endpoint: callbackUrl,
  });

  const hangUpMessage: HangUpMessage = {
    action: originalMessage.action,
    strangerId: connectionId,
  };

  try {
    // Send the message to stranger
    await apiClient.send(
      new PostToConnectionCommand({
        ConnectionId: originalMessage.strangerId,
        Data: JSON.stringify(hangUpMessage),
      }),
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Message hangUp sent.',
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
