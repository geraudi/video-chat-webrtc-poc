import { Table } from 'sst/node/table';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const tableName = Table.Connections.tableName;

const client = new DynamoDBClient({});
const documentClient = DynamoDBDocumentClient.from(client);

async function deleteConnection(connectionId: string) {
  const deleteCommand = new DeleteCommand({
    TableName: tableName,
    Key: {
      id: connectionId
    }
  });

  await documentClient.send(deleteCommand);
}

export default {
  documentClient,
  tableName,
  deleteConnection
}
