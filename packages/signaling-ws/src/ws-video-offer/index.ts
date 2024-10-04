import { APIGatewayProxyEvent } from 'aws-lambda';
import {
  VideoOfferInputMessage,
  VideoOfferOutputMessage,
} from '@repo/signaling-types/messages';
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi'; // eslint-disable-next-line turbo/no-undeclared-env-vars

export const handler = async (event: APIGatewayProxyEvent) => {
  const messageData: VideoOfferOutputMessage = JSON.parse(event.body as string);
  const connectionId = event.requestContext.connectionId;

  const domain = event.requestContext.domainName;
  const stage = event.requestContext.stage;
  const callbackUrl = `https://${domain}/${stage}`;
  const client = new ApiGatewayManagementApiClient({ endpoint: callbackUrl });

  const offerVideoMessage: VideoOfferInputMessage = {
    ...messageData,
    senderId: connectionId as string,
  };

  const command = new PostToConnectionCommand({
    ConnectionId: messageData.strangerId,
    Data: JSON.stringify(offerVideoMessage),
  });

  try {
    // Send the message
    await client.send(command);
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Message videoOffer sent.',
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
