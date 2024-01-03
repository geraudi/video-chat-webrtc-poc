import { StackContext, Table } from "sst/constructs";

export function StorageStack({ stack }: StackContext) {
  // Create the DynamoDB table
  const table = new Table(stack, "Connections", {
    fields: {
      id: "string"
    },
    primaryIndex: { partitionKey: "id" }
  });

  return {
    table,
  };
}
