import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand
} from '@aws-sdk/client-apigatewaymanagementapi';
import type { PostToConnectionCommandOutput } from '@aws-sdk/client-apigatewaymanagementapi/dist-types/commands/PostToConnectionCommand.js';
import type { Message } from '@repo/signaling-types/messages';
import type { APIGatewayProxyEvent } from 'aws-lambda';

export function postToConnection(
  event: APIGatewayProxyEvent,
  toConnectionId: string,
  message: Message
): Promise<PostToConnectionCommandOutput> {
  const domain = event.requestContext.domainName;
  const stage = event.requestContext.stage;
  const callbackUrl = `https://${domain}/${stage}`;
  const client = new ApiGatewayManagementApiClient({ endpoint: callbackUrl });

  const command = new PostToConnectionCommand({
    ConnectionId: toConnectionId,
    Data: JSON.stringify(message)
  });

  return client.send(command);
}
