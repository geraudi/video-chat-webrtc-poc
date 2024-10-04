import { NodejsFunction } from '@exanubes/pulumi-nodejs-function';
import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';

export function getConnectLambda(
  api: aws.apigatewayv2.Api,
  stage: aws.apigatewayv2.Stage,
  dbUrl: string,
  dbToken: string | pulumi.Output<string>,
) {
  const connectLambda = new NodejsFunction('WebSocket_Connect', {
    code: new pulumi.asset.FileArchive(
      '../packages/signaling-ws/dist/ws-connect',
    ),
    handler: 'index.handler',
    environment: {
      variables: {
        NODE_OPTIONS: '--enable-source-maps',
        TURSO_DATABASE_URL: dbUrl,
        TURSO_AUTH_TOKEN: dbToken,
      },
    },
    architectures: ['arm64'],
    timeout: 10,
  });

  const connectIntegration = new aws.apigatewayv2.Integration(
    'connect-integration',
    {
      apiId: api.id,
      integrationType: 'AWS_PROXY',
      integrationUri: connectLambda.handler.invokeArn,
    },
  );

  connectLambda.grantInvoke(
    'apigw-connect-grant-invoke',
    'apigateway.amazonaws.com',
    pulumi.interpolate`${api.executionArn}/${stage.name}/$connect`,
  );

  new aws.apigatewayv2.Route(`Connect_Route`, {
    apiId: api.id,
    routeKey: '$connect',
    target: pulumi.interpolate`integrations/${connectIntegration.id}`,
  });
}
