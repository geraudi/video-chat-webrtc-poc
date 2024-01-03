import { SSTConfig } from "sst";
import { SignalingServerStack } from "./stacks/SignalingServerStack";
import { StorageStack } from './stacks/StorageStack';
import { FrontendStack } from './stacks/FrontendStack';

export default {
  config(_input) {
    return {
      name: "aws-websocket",
      region: "us-east-1",
    };
  },
  stacks(app) {
    app
      .stack(StorageStack)
      .stack(SignalingServerStack)
      .stack(FrontendStack)
  }
} satisfies SSTConfig;
