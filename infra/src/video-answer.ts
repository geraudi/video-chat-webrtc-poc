import { NodejsFunction } from '@exanubes/pulumi-nodejs-function';
import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import { Actions } from '@repo/signaling-types/messages';

export function getVideoAnswerLambda(
  api: aws.apigatewayv2.Api,
  stage: aws.apigatewayv2.Stage,
) {
  const videoAnswerLambda = new NodejsFunction('WebSocket_VideoAnswer', {
    code: new pulumi.asset.FileArchive(
      '../packages/signaling-ws/dist/ws-video-answer',
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

  const videoAnswerIntegration = new aws.apigatewayv2.Integration(
    'video-answer-integration',
    {
      apiId: api.id,
      integrationType: 'AWS_PROXY',
      integrationUri: videoAnswerLambda.handler.invokeArn,
    },
  );

  videoAnswerLambda.grantInvoke(
    'apigw-video-answer-grant-invoke',
    'apigateway.amazonaws.com',
    pulumi.interpolate`${api.executionArn}/${stage.name}/${Actions.VIDEO_ANSWER}`,
  );

  new aws.apigatewayv2.Route(`VideoAnswer_Route`, {
    apiId: api.id,
    routeKey: Actions.VIDEO_ANSWER,
    target: pulumi.interpolate`integrations/${videoAnswerIntegration.id}`,
  });
}
