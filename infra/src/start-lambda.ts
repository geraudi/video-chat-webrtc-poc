import { NodejsFunction } from '@exanubes/pulumi-nodejs-function';
import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import { Actions } from '@repo/signaling-types/messages';
import {
  getApiGatewayPermissionName,
  getCodePath,
  getIntegrationName,
  getLambdaName,
  getRouteName,
} from './helpers';

export function getStartLambda(
  api: aws.apigatewayv2.Api,
  stage: aws.apigatewayv2.Stage,
  dbUrl: string,
  dbToken: string | pulumi.Output<string>,
) {
  const actionName = Actions.START;

  const lambda = new NodejsFunction(getLambdaName(actionName), {
    code: new pulumi.asset.FileArchive(getCodePath(actionName)),
    handler: 'index.handler',
    environment: {
      variables: {
        NODE_OPTIONS: '--enable-source-maps',
        TURSO_DATABASE_URL: dbUrl,
        TURSO_AUTH_TOKEN: dbToken,
      },
    },
    architectures: ['arm64'],
    timeout: 5,
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
  });

  const integration = new aws.apigatewayv2.Integration(
    getIntegrationName(actionName),
    {
      apiId: api.id,
      integrationType: 'AWS_PROXY',
      integrationUri: lambda.handler.invokeArn,
    },
  );

  lambda.grantInvoke(
    getApiGatewayPermissionName(actionName),
    'apigateway.amazonaws.com',
    pulumi.interpolate`${api.executionArn}/${stage.name}/${actionName}`,
  );

  new aws.apigatewayv2.Route(getRouteName(actionName), {
    apiId: api.id,
    routeKey: Actions.START,
    target: pulumi.interpolate`integrations/${integration.id}`,
  });
}
