import type { APIGatewayProxyEvent } from 'aws-lambda';

export interface HandlerResult {
  statusCode: number;
  body: string;
}

/**
 * Wraps a Lambda handler so unexpected errors are logged with the action
 * name and returned as a controlled 500 instead of an opaque crash.
 */
export function wrapHandler(
  action: string,
  fn: (event: APIGatewayProxyEvent) => Promise<HandlerResult>
): (event: APIGatewayProxyEvent) => Promise<HandlerResult> {
  return async event => {
    try {
      return await fn(event);
    } catch (error) {
      console.error(`[${action}] handler error:`, error);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Internal server error.' })
      };
    }
  };
}
