import { NodejsFunction } from '@exanubes/pulumi-nodejs-function';
import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';

export function getDisconnectLambda(
  api: aws.apigatewayv2.Api,
  stage: aws.apigatewayv2.Stage,
  dbUrl: string,
  dbToken: string | pulumi.Output<string>,
) {
  const disconnectLambda = new NodejsFunction('WebSocket_Disconnect', {
    code: new pulumi.asset.FileArchive(
      '../packages/signaling-ws/dist/ws-disconnect',
    ),
    handler: 'index.handler',
    environment: {
      variables: {
        NODE_OPTIONS: '--enable-source-maps',
        TURSO_DATABASE_URL: dbUrl,
        TURSO_AUTH_TOKEN: dbToken,
      },
    },
  });

  const disconnectIntegration = new aws.apigatewayv2.Integration(
    'disconnect-integration',
    {
      apiId: api.id,
      integrationType: 'AWS_PROXY',
      integrationUri: disconnectLambda.handler.invokeArn,
    },
  );

  disconnectLambda.grantInvoke(
    'apigw-disconnect-grant-invoke',
    'apigateway.amazonaws.com',
    pulumi.interpolate`${api.executionArn}/${stage.name}/$disconnect`,
  );

  new aws.apigatewayv2.Route(`Disconnect_Route`, {
    apiId: api.id,
    routeKey: '$disconnect',
    target: pulumi.interpolate`integrations/${disconnectIntegration.id}`,
  });
}
