import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand
} from '@aws-sdk/client-apigatewaymanagementapi';
import type { Message } from '@repo/signaling-types/messages';
import type { ISignalingGateway } from '../../domains/signaling.js';

/**
 * Production transport adapter using AWS API Gateway WebSocket
 */
export class AwsApiGatewaySignalingGateway implements ISignalingGateway {
  constructor(
    private domainName: string,
    private stage: string
  ) {}

  async send(connectionId: string, message: Message): Promise<void> {
    const client = new ApiGatewayManagementApiClient({
      endpoint: `https://${this.domainName}/${this.stage}`
    });

    await client.send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: JSON.stringify(message)
      })
    );
  }
}