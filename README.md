# Turborepo + Pulumi

Video chat (WebRTC) example with Turborepo and Pulumi.

- AWS API Gateway with Websockets.
- Turso database.
- Front: React + TypeScript + Vite.


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

