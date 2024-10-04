import { APIGatewayProxyEvent } from 'aws-lambda';
import { turso } from '../lib/db-connection.js';

export const handler = async (event: APIGatewayProxyEvent) => {
  console.log('connectionId (1): ', event.requestContext.connectionId);

  if (event.requestContext.connectionId === undefined) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'No connection id.',
      }),
    };
  }

  try {
    await turso.execute({
      sql: 'INSERT INTO connection (id, isAvailable) VALUES (?, ?)',
      args: [event.requestContext.connectionId, 0],
    });
    console.log('Insert event.requestContext.connectionId into DB');
  } catch (e) {
    console.log(e);
  }

  return {
    statusCode: 201,
    body: JSON.stringify({
      message: 'Connected.',
    }),
  };
};
