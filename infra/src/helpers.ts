import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import * as fs from 'node:fs';

export function writeOutputsFile(
  api: aws.apigatewayv2.Api,
  stage: aws.apigatewayv2.Stage,
) {
  pulumi
    .all([api.apiEndpoint, stage.name])
    .apply(([apiEndpoint, stageName]) => {
      console.log(`API Endpoint ID: ${apiEndpoint}`);
      fs.writeFileSync(
        'outputs.json',
        JSON.stringify({ apiEndpoint: `${apiEndpoint}/${stageName}/` }),
      );
    });
}

export function toKebabCase(pascalString: string) {
  return pascalString.replace(/([a-z0–9])([A-Z])/g, '$1-$2').toLowerCase();
}

export function ucFirst(s: string) {
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}`;
}

export function getLambdaName(actionName: string) {
  return `WebSocket_${ucFirst(actionName)}`;
}

export function getCodePath(actionName: string) {
  return `../packages/signaling-ws/dist/ws-${toKebabCase(actionName)}`;
}

export function getIntegrationName(actionName: string) {
  return `${toKebabCase(actionName)}-integration`;
}

export function getApiGatewayPermissionName(actionName: string) {
  return `apigw-${toKebabCase(actionName)}-grant-invoke`;
}

export function getRouteName(actionName: string) {
  return `${ucFirst(actionName)}_Route`;
}
