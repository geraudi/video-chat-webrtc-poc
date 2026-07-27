import type { APIGatewayProxyEvent } from 'aws-lambda';
import { getUseCases } from '../lib/di-container.js';

/**
 * AWS Lambda handler for the videoAnswer action.
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<{ statusCode: number; body: string }> => {
  const connectionId = event.requestContext.connectionId!;
  const message = JSON.parse(event.body as string);

  const { forwardMessage } = getUseCases();
  await forwardMessage.execute(connectionId, message.strangerId, message);

  return { statusCode: 200, body: JSON.stringify({ message: 'Message videoAnswer sent.' }) };
};