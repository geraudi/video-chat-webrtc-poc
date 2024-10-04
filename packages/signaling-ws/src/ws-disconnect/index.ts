import { APIGatewayProxyEvent } from 'aws-lambda';
import { turso } from '../lib/db-connection.js';

export const handler = async function handler(event: APIGatewayProxyEvent) {
  if (event.requestContext.connectionId === undefined) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'No connection id.',
      }),
    };
  }

  try {
    const result = await turso.execute({
      sql: 'DELETE FROM connection WHERE id = ?',
      args: [event.requestContext.connectionId],
    });
    console.log(
      'Delete connection success',
      event.requestContext.connectionId,
      result,
    );
  } catch (e) {
    console.log(
      'Delete connection failed',
      event.requestContext.connectionId,
      e,
    );
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'disconnected.',
    }),
  };
};
