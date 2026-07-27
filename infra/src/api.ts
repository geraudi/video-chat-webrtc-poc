import * as aws from '@pulumi/aws';

export function getApi() {
  return new aws.apigatewayv2.Api('websocket-api', {
    name: 'webrtc-poc-websocket-api',
    protocolType: 'WEBSOCKET',
    routeSelectionExpression: '$request.body.action'
  });
}
