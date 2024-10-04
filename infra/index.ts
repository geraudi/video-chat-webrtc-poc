import * as pulumi from '@pulumi/pulumi';
import { getApi } from './src/api';
import { getStage } from './src/stage-api';
import { getConnectLambda } from './src/connect-lambda';
import { getDisconnectLambda } from './src/disconnect-lambda';
import { getVideoOfferLambda } from './src/video-offer-lambda';
import { getVideoAnswerLambda } from './src/video-answer';
import { getNewIceCandidateLambda } from './src/new-ice-candidate-lambda';
import { getHangUpLambda } from './src/hang-up-lambda';
import { writeOutputsFile } from './src/helpers';
import { getStartLambda } from './src/start-lambda';

const config = new pulumi.Config();

const dbUrl = config.require('dbUrl');
const dbToken = config.requireSecret('dbToken');

const api = getApi();
const stage = getStage(api);

getConnectLambda(api, stage, dbUrl, dbToken);
getStartLambda(api, stage, dbUrl, dbToken);
getDisconnectLambda(api, stage, dbUrl, dbToken);
getVideoOfferLambda(api, stage, dbUrl, dbToken);
getVideoAnswerLambda(api, stage);
getNewIceCandidateLambda(api, stage);
getHangUpLambda(api, stage);

writeOutputsFile(api, stage);

export const ws_api_url = pulumi.interpolate`${api.apiEndpoint}/${stage.name}/`;
