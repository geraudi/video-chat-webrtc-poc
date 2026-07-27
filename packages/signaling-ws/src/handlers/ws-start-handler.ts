import type { APIGatewayProxyEvent } from 'aws-lambda';
import { getUseCases } from '../lib/di-container.js';

/**
 * AWS Lambda handler for the START action.
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<{ statusCode: number; body: string }> => {
  const connectionId = event.requestContext.connectionId;

  if (!connectionId) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'No connection id.' })
    };
  }

  const { findStranger } = getUseCases();
  const result = await findStranger.execute(connectionId);

  return {
    statusCode: 201,
    body: JSON.stringify({ message: result.status === 'waiting' ? 'Available.' : 'Init offer sent.' })
  };
};