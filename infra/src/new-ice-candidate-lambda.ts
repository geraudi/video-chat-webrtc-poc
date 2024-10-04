import { NodejsFunction } from '@exanubes/pulumi-nodejs-function';
import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import { Actions } from '@repo/signaling-types/messages';

export function getNewIceCandidateLambda(
  api: aws.apigatewayv2.Api,
  stage: aws.apigatewayv2.Stage,
) {
  const newIceCandidateLambda = new NodejsFunction(
    'WebSocket_NewIceCandidate',
    {
      code: new pulumi.asset.FileArchive(
        '../packages/signaling-ws/dist/ws-new-ice-candidate',
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
                  Action: [
                    'execute-api:ManageConnections',
                    'execute-api:Invoke',
                  ],
                  Effect: 'Allow',
                  Resource: [
                    `${executionArn}/${stageName}/POST/@connections/*`,
                  ],
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
    },
  );

  const newIceCandidateIntegration = new aws.apigatewayv2.Integration(
    'new-ice-candidate-integration',
    {
      apiId: api.id,
      integrationType: 'AWS_PROXY',
      integrationUri: newIceCandidateLambda.handler.invokeArn,
    },
  );

  newIceCandidateLambda.grantInvoke(
    'apigw-new-ice-candidate-grant-invoke',
    'apigateway.amazonaws.com',
    pulumi.interpolate`${api.executionArn}/${stage.name}/${Actions.NEW_ICE_CANDIDATE}`,
  );

  new aws.apigatewayv2.Route(`NewIceCandidate_Route`, {
    apiId: api.id,
    routeKey: Actions.NEW_ICE_CANDIDATE,
    target: pulumi.interpolate`integrations/${newIceCandidateIntegration.id}`,
  });
}
