import * as aws from '@pulumi/aws';

export function getStage(api: aws.apigatewayv2.Api) {
  return new aws.apigatewayv2.Stage(`api-dev-stage`, {
    name: 'dev',
    apiId: api.id,
    autoDeploy: true,
  });
}
