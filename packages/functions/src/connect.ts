import { PutCommand } from "@aws-sdk/lib-dynamodb";

import handler from '@aws-server/core/handler';
import dynamoDB from '@aws-server/core/dynamoDB';

export const main = handler(async (event) => {
  const command = new PutCommand ({
    TableName: dynamoDB.tableName,
    Item: {
      id: event.requestContext.connectionId,
      available: true
    }
  });

  await dynamoDB.documentClient.send(command);

  return 'Connected';
});
