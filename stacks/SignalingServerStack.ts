import { StackContext, WebSocketApi, use } from "sst/constructs";
import { StorageStack } from './StorageStack';

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
      sendMessage: "packages/functions/src/sendMessage.main",
      videoOffer: "packages/functions/src/videoOffer.main",
      videoAnswer: "packages/functions/src/videoAnswer.main",
      newIceCandidate: "packages/functions/src/newIceCandidate.main",
      hangUp: "packages/functions/src/hangUp.main",
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
