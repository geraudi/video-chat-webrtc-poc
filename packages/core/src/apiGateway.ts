import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import dynamoDB from './dynamoDB';
import { APIGatewayProxyEvent } from 'aws-lambda';

let apiClient: ApiGatewayManagementApiClient | null = null;

function setApiClient(event: APIGatewayProxyEvent) {
  if (apiClient === null) {
    const {stage, domainName, connectionId} = event.requestContext;

    apiClient = new ApiGatewayManagementApiClient({
      endpoint: `https://${domainName}/${stage}`
    });
  }
}

async function postToConnection (id: string, data: any) {
  if (apiClient === null) {
    throw new Error('Call setApiClient.');
  }

  if (id === null) return;

  try {
    const command = new PostToConnectionCommand({
      Data: JSON.stringify(data),
      ConnectionId: id
    });
    const response = await apiClient.send(command);
  } catch (e) {
    // ApiGatewayManagementApiServiceException
    // @ts-ignore
    if (e?.$response?.statusCode === 410) {
      // Remove stale connections
      await dynamoDB.deleteConnection(id);
    }

    console.log(e);
  }
}

export default {
  setApiClient,
  postToConnection
}
