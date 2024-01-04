import { ScanCommand, ScanCommandOutput } from '@aws-sdk/lib-dynamodb';

import handler from '@aws-server/core/handler';
import dynamoDB from '@aws-server/core/dynamoDB';
import apiGateway from '@aws-server/core/apiGateway';
import { VideoOffertInputMessage, VideoOffertOutputMessage } from '@aws-server/core/types/messages';

export const main = handler(async (event) => {
  const messageData: VideoOffertOutputMessage = JSON.parse(event.body as string);
  const connectionId = event.requestContext.connectionId as string;

  // Get all the connections
  const scanCommand = new ScanCommand({
    ProjectionExpression: 'id',
    TableName: dynamoDB.tableName
  });
  // Get all the connections
  const connections: ScanCommandOutput = await dynamoDB.documentClient.send(scanCommand);

  if (connectionId && connections && connections.Count) {
    const availableConnections = (connections.Items || []).filter(connection => connection.id !== connectionId);
    const randomConnection = availableConnections[Math.floor(Math.random() * availableConnections.length)];

    const offerVideoMessage: VideoOffertInputMessage = {
      ...messageData,
      senderId: connectionId
    };

    apiGateway.setApiClient(event);
    await apiGateway.postToConnection(randomConnection.id, offerVideoMessage);
  }

  return 'Message videoOffer sent';
});
