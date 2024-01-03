import { StackContext, StaticSite, use } from "sst/constructs";
import { SignalingServerStack } from "./SignalingServerStack";

export function FrontendStack({ stack, app }: StackContext) {
  const { signalingServer } = use(SignalingServerStack);

  // Define our React app
  const site = new StaticSite(stack, "ReactSite", {
    path: "packages/frontend",
    buildCommand: "pnpm run build",
    buildOutput: "dist",
    // Pass in our environment variables
    environment: {
      VITE_SIGNALING_SERVER_URL: signalingServer.url,
      VITE_REGION: app.region
    },
  });

  // Show the url in the output
  stack.addOutputs({
    SiteUrl: site.url,
  });
}
