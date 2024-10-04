import { NodejsFunction } from '@exanubes/pulumi-nodejs-function';
import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import { Actions } from '@repo/signaling-types/messages';

export function getVideoOfferLambda(
  api: aws.apigatewayv2.Api,
  stage: aws.apigatewayv2.Stage,
  dbUrl: string,
  dbToken: string | pulumi.Output<string>,
) {
  const videoOfferLambda = new NodejsFunction('WebSocket_VideoOffer', {
    code: new pulumi.asset.FileArchive(
      '../packages/signaling-ws/dist/ws-video-offer',
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
                // arn:aws:execute-api:{region}:{accountId}:{apiId}/{stage}/POST/@connections/{connectionId}
                Resource: [`${executionArn}/${stageName}/POST/@connections/*`],
              },
            ],
          }),
        ),
    },
    environment: {
      variables: {
        TURSO_DATABASE_URL: dbUrl,
        TURSO_AUTH_TOKEN: dbToken,
        NODE_OPTIONS: '--enable-source-maps',
      },
    },
  });

  const videoOfferIntegration = new aws.apigatewayv2.Integration(
    'video-offer-integration',
    {
      apiId: api.id,
      integrationType: 'AWS_PROXY',
      integrationUri: videoOfferLambda.handler.invokeArn,
    },
  );

  videoOfferLambda.grantInvoke(
    'apigw-video-offer-grant-invoke',
    'apigateway.amazonaws.com',
    pulumi.interpolate`${api.executionArn}/${stage.name}/${Actions.VIDEO_OFFER}`,
  );

  new aws.apigatewayv2.Route(`VideoOffer_Route`, {
    apiId: api.id,
    routeKey: Actions.VIDEO_OFFER,
    target: pulumi.interpolate`integrations/${videoOfferIntegration.id}`,
  });
}
