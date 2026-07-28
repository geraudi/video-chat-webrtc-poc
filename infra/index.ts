import * as pulumi from '@pulumi/pulumi';
import { getApi } from './src/api';
import { getConnectLambda } from './src/connect-lambda';
import { getDisconnectLambda } from './src/disconnect-lambda';
import { getHangUpLambda } from './src/hang-up-lambda';
import { writeOutputsFile } from './src/helpers';
import { getNewIceCandidateLambda } from './src/new-ice-candidate-lambda';
import { getStage } from './src/stage-api';
import { getStartLambda } from './src/start-lambda';
import { getTurnCredentialsLambda } from './src/turn-credentials-lambda';
import { getVideoAnswerLambda } from './src/video-answer';
import { getVideoOfferLambda } from './src/video-offer-lambda';

const config = new pulumi.Config();

const dbUrl = config.require('dbUrl');
const dbToken = config.requireSecret('dbToken');
const meteredAppDomain = config.require('meteredAppDomain');
const meteredSecretKey = config.requireSecret('meteredSecretKey');

const api = getApi();
const stage = getStage(api);

getConnectLambda(api, stage, dbUrl, dbToken);
getStartLambda(api, stage, dbUrl, dbToken);
getDisconnectLambda(api, stage, dbUrl, dbToken);
getVideoOfferLambda(api, stage, dbUrl, dbToken);
getVideoAnswerLambda(api, stage);
getNewIceCandidateLambda(api, stage);
getHangUpLambda(api, stage);
getTurnCredentialsLambda(api, stage, meteredAppDomain, meteredSecretKey);

writeOutputsFile(api, stage);

export const ws_api_url = pulumi.interpolate`${api.apiEndpoint}/${stage.name}/`;
