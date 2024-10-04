import { APIGatewayProxyEvent } from 'aws-lambda';
import { turso } from '../lib/db-connection.js';
import { postToConnection } from '../lib/post-to-connection.js';
import { Actions, InitOfferMessage } from '@repo/signaling-types/messages';

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

  let otherAvailableConnectionId: string | null = null;

  try {
    const result = await turso.execute({
      sql: 'SELECT * FROM connection WHERE id <> ? AND isAvailable = 1 LIMIT 1',
      args: [event.requestContext.connectionId],
    });
    console.log('Retrieve available connections result', result);
    otherAvailableConnectionId = (result.rows?.[0]?.id as string) ?? null;
  } catch (e) {
    console.log('Retrieve available connections failed', e);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Retrieve available connections failed.',
      }),
    };
  }

  if (otherAvailableConnectionId) {
    try {
      // Set otherAvailableConnectionId in DB as unavailable
      await turso.execute({
        sql: 'UPDATE connection SET isAvailable = 0 WHERE id = ?',
        args: [otherAvailableConnectionId],
      });

      // Send INIT_OFFER to caller
      const messageToCaller: InitOfferMessage = {
        action: Actions.INI_OFFER,
        role: 'caller',
        strangerId: otherAvailableConnectionId,
      };
      await postToConnection(
        event,
        event.requestContext.connectionId,
        messageToCaller,
      );

      // Send INIT_OFFER to callee
      const messageToCallee: InitOfferMessage = {
        action: Actions.INI_OFFER,
        role: 'callee',
        strangerId: event.requestContext.connectionId,
      };
      await postToConnection(
        event,
        otherAvailableConnectionId,
        messageToCallee,
      );

      return {
        statusCode: 201,
        body: JSON.stringify({
          message: 'Init offer sent.',
        }),
      };
    } catch (e) {
      console.log('Send INIT_OFFER failed', e);
    }
  }

  try {
    await turso.execute({
      sql: 'UPDATE connection SET isAvailable = 1 WHERE id = ?',
      args: [event.requestContext.connectionId],
    });
    console.log(
      `Set connection ${event.requestContext.connectionId} available in DB`,
    );

    return {
      statusCode: 201,
      body: JSON.stringify({
        message: 'Available.',
      }),
    };
  } catch (e) {
    console.log('Failed to set available', e);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Failed to set available.',
      }),
    };
  }
};
