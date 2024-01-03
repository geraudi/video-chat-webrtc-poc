import { DeleteCommand } from '@aws-sdk/lib-dynamodb';

import handler from '@aws-server/core/handler';
import dynamoDB from '@aws-server/core/dynamoDB';

export const main = handler(async (event) => {
  const deleteCommand = new DeleteCommand({
    TableName: dynamoDB.tableName,
    Key: {
      id: event.requestContext.connectionId
    }
  });

  await dynamoDB.documentClient.send(deleteCommand);

  return 'Disconnected';
});
