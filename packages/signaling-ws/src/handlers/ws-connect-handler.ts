import type { APIGatewayProxyEvent } from 'aws-lambda';
import { getUseCases } from '../lib/di-container.js';

/**
 * AWS Lambda handler for the $connect action.
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<{ statusCode: number; body: string }> => {
  const connectionId = event.requestContext.connectionId!;

  const { connectPeer } = getUseCases();
  await connectPeer.execute(connectionId);

  return { statusCode: 200, body: JSON.stringify({ message: 'Connect.' }) };
};