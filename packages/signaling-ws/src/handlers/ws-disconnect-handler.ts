import type { APIGatewayProxyEvent } from 'aws-lambda';
import { getUseCases } from '../lib/di-container.js';

/**
 * AWS Lambda handler for the $disconnect action.
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<{ statusCode: number; body: string }> => {
  const connectionId = event.requestContext.connectionId!;

  const { disconnectPeer } = getUseCases();
  await disconnectPeer.execute(connectionId);

  return { statusCode: 200, body: JSON.stringify({ message: 'Disconnect.' }) };
};