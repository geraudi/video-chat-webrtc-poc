# Turborepo + Pulumi

Video chat (WebRTC) example with Turborepo and Pulumi.

- AWS API Gateway with Websockets.
- Turso database.
- Front: React + TypeScript + Vite.

1. Install turbo repo globally
https://turbo.build/repo/docs/getting-started/installation
```pnpm install turbo --global```

2. Install dependencies
```pnpm i```

3. Install Pulumi
```brew install pulumi/tap/pulumi```

4. Configure AWS credential
https://www.pulumi.com/registry/packages/aws/installation-configuration

4. Deploy stask
```
cd infra
pnpm run deploy
```

test websocket
The websocket url can find here: infra/outputs.json
wscat -c wss://4l60aayocd.execute-api.us-east-1.amazonaws.com/dev/

4. Deploy infra
```turbo run deploy```


### DB Turso
Usefully commands: 

```
turso db show --url my-turborepo 
turso db tokens create my-turborepo
turso db tokens invalidate
```

### Local Development (No AWS Deployment Required)

You can run the entire application locally without deploying to AWS:

**1. Start the local signaling server:**
```bash
cd packages/signaling-ws
pnpm install  # Install tsx and ws if not already installed
node local-server.mjs
# Server starts on http://localhost:3001
```

**2. In a separate terminal, start the frontend in local mode:**
```bash
cd apps/frontend
pnpm install  # Ensure dependencies are installed
pnpm run dev:local
# Frontend starts on http://localhost:5173
```

**How it works:**
- The local signaling server uses an in-memory store (no Turso DB needed)
- The frontend detects `VITE_LOCAL_MODE=true` and connects to `ws://localhost:3001` instead of the AWS WebSocket endpoint
- Peer matching happens locally via WebSocket
- Video streams connect directly P2P via WebRTC

**Notes:**
- Open two browser tabs/windows to `http://localhost:5173` to test a call between peers
- The local server runs on port 3001, the frontend on port 5173

### Pulumi
Set db token in env variable TURSO_AUTH_TOKEN
```
pulumi stack select dev
pulumi config set --secret infra:dbToken my-db-token
pulumi config set infra:dbUrl my-db-url
```
Replace `my-token-db` and `my-db-url`.

(The configuration is written to the file `infra/Pulumi.dev.yaml`)
