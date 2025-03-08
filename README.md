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

### Pulumi
Set db token in env variable TURSO_AUTH_TOKEN
```
pulumi stack select dev
pulumi config set --secret infra:dbToken my-db-token
pulumi config set infra:dbUrl my-db-url
```
Replace `my-token-db` and `my-db-url`.

(The configuration is written to the file `infra/Pulumi.dev.yaml`)
