import { NodejsFunction } from '@exanubes/pulumi-nodejs-function';
import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import { Actions } from '@repo/signaling-types/messages';

export function getHangUpLambda(
  api: aws.apigatewayv2.Api,
  stage: aws.apigatewayv2.Stage,
) {
  const lambda = new NodejsFunction('WebSocket_HangUp', {
    code: new pulumi.asset.FileArchive(
      '../packages/signaling-ws/dist/ws-hang-up',
    ),
    handler: 'index.handler',
    policy: {
      policy: pulumi
        .all([api.executionArn, stage.name])
        .apply(([executionArn, stageName]) =>
          JSON.stringify({
            Version: '2012-10-17',
            Statement: [
              {
                Action: ['execute-api:ManageConnections', 'execute-api:Invoke'],
                Effect: 'Allow',
                Resource: [`${executionArn}/${stageName}/POST/@connections/*`],
              },
            ],
          }),
        ),
    },
    environment: {
      variables: {
        NODE_OPTIONS: '--enable-source-maps',
      },
    },
  });

  const integration = new aws.apigatewayv2.Integration('hang-up-integration', {
    apiId: api.id,
    integrationType: 'AWS_PROXY',
    integrationUri: lambda.handler.invokeArn,
  });

  lambda.grantInvoke(
    'apigw-hang-up-grant-invoke',
    'apigateway.amazonaws.com',
    pulumi.interpolate`${api.executionArn}/${stage.name}/${Actions.HANG_UP}`,
  );

  new aws.apigatewayv2.Route(`HangUp_Route`, {
    apiId: api.id,
    routeKey: Actions.HANG_UP,
    target: pulumi.interpolate`integrations/${integration.id}`,
  });
}
