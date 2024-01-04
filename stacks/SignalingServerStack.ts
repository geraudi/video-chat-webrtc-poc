import { StackContext, WebSocketApi, use } from "sst/constructs";
import { StorageStack } from './StorageStack';
import { Actions } from '../packages/core/src/types/messages';

export function SignalingServerStack({ stack }: StackContext) {
  const { table } = use(StorageStack);

  // Create the WebSocket API
  const signalingServer = new WebSocketApi(stack, "Api", {
    defaults: {
      function: {
        bind: [table],
      },
    },
    routes: {
      $connect: "packages/functions/src/connect.main",
      $disconnect: "packages/functions/src/disconnect.main",
      [Actions.VIDEO_OFFER]: "packages/functions/src/videoOffer.main",
      [Actions.VIDEO_ANSWER]: "packages/functions/src/videoAnswer.main",
      [Actions.NEW_ICE_CANDIDATE]: "packages/functions/src/newIceCandidate.main",
      [Actions.HANG_UP]: "packages/functions/src/hangUp.main",
    },
  });

// Show the API endpoint in the output
  stack.addOutputs({
    ApiEndpoint: signalingServer.url,
  });

  // Return the API resource
  return {
    signalingServer,
  };
}
