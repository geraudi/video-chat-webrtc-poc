import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand
} from '@aws-sdk/client-apigatewaymanagementapi';
import type { ISignalingGateway } from '@repo/signaling-core/domains/signaling';
import type { Message } from '@repo/signaling-types/messages';

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
