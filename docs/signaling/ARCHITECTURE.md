# `signaling-ws` — Architecture Ports & Adapters

Sept Lambdas WebSocket partagent un même cœur métier. Le domaine définit des contrats
(les **ports**), les use cases les consomment sans savoir qui les implémente, et les
**adapters** branchent le monde réel — Turso, API Gateway — ou des doublures locales pour le dev.

> **7** routes WS · **4** use cases · **2** ports · **4** adapters (2 prod / 2 dev) · runtime `nodejs20.x` / arm64

---

## La carte : qui appelle qui

Chaque bloc correspond à un dossier de `src/`. Les flèches pleines sont les appels à
l'exécution ; les flèches pointillées signifient « implémente ».

```mermaid
flowchart LR
  subgraph pilotes["Pilotes — qui déclenche"]
    GW["API Gateway WebSocket<br/>$connect · $disconnect · start<br/>videoOffer · videoAnswer<br/>newIceCandidate · hangUp"]
    H["handlers/ws-*-handler.ts<br/>event → use case, via wrapHandler"]
    LS["local-server/ (dev)<br/>serveur ws local"]
  end

  subgraph lib["lib/ — composition"]
    DI["di-container.ts<br/>getters paresseux,<br/>endpoint depuis l'event"]
  end

  subgraph usecases["usecases/ — le métier, pur"]
    FS["FindStranger"]
    FM["ForwardMessage"]
    CP["ConnectPeer"]
    DP["DisconnectPeer"]
  end

  subgraph domaine["domains/ — ports & modèle"]
    RP["IConnectionRepository<br/>findAvailable · create · delete<br/>setAvailable · setUnavailable"]
    SG["ISignalingGateway<br/>send(connectionId, message)"]
  end

  subgraph adapters["adapters/ — implémentations"]
    TU["TursoConnectionRepository (prod)"]
    AG["AwsApiGatewaySignalingGateway (prod)"]
    IM["InMemoryConnectionRepository (dev)"]
    LG["LocalWebSocketGateway (dev)"]
  end

  subgraph externe["Monde extérieur"]
    DB[("Turso<br/>table connection")]
    MGMT["API GW Management<br/>POST @connections/*"]
    BR["Navigateurs (pairs WebRTC)"]
  end

  GW --> H --> DI
  DI --> FS
  DI --> FM
  DI --> CP
  DI --> DP
  LS --> FS
  LS --> FM
  LS --> CP
  LS --> DP

  FS --> RP
  FS --> SG
  FM --> SG
  CP --> RP
  DP --> RP

  TU -. implémente .-> RP
  IM -. implémente .-> RP
  AG -. implémente .-> SG
  LG -. implémente .-> SG

  TU --> DB
  AG --> MGMT
  MGMT --> BR
  LG --> BR

  classDef entry fill:#eceaf8,stroke:#5d53b8,color:#1f2328
  classDef uc fill:#e8eefa,stroke:#2a5fc0,color:#1f2328
  classDef dom fill:#e3f1ee,stroke:#0e756b,color:#1f2328
  classDef adap fill:#f8eedc,stroke:#a3610f,color:#1f2328
  classDef ext fill:transparent,stroke:#5d6e73,stroke-dasharray:4 3

  class GW,H,LS,DI entry
  class FS,FM,CP,DP uc
  class RP,SG dom
  class TU,AG,IM,LG adap
  class DB,MGMT,BR ext
```

La flèche « implémente » est le cœur du pattern : les adapters dépendent de `domains/`,
jamais l'inverse. Le domaine ne connaît ni AWS, ni Turso, ni même l'existence des Lambdas —
il n'importe que les types `Message` de `@repo/signaling-types`.

---

## Règles de dépendance : ce que chaque brique a le droit d'importer

C'est cette règle qui rend le cœur testable et les adapters remplaçables. Toutes les
flèches d'import convergent vers `domains/`.

| Brique | Rôle | Importe | N'importe jamais |
|---|---|---|---|
| `domains/` | Modèle `Connection` + les 2 ports (interfaces pures) | `@repo/signaling-types` uniquement | use cases, adapters, SDK |
| `usecases/` | Logique de matching et de relais, sans I/O direct | `domains/` (les ports, en types) | un adapter concret, `@aws-sdk`, `@libsql` |
| `adapters/` | Implémentations techniques des ports | `domains/` + SDK externes (`@libsql/client/web`, `@aws-sdk`, `ws`) | use cases, handlers |
| `handlers/` | Event Lambda → use case → réponse HTTP | `lib/` (DI + `wrapHandler`) | un adapter directement |
| `lib/` | Composition root : le **seul** endroit qui connaît les adapters de prod | adapters + use cases + `aws-lambda` (types) | — |
| `ws-*/index.ts` | Points d'entrée bundlés (1 par Lambda), simples re-exports | son handler | — |
| `local-server/` | Harnais de dev : câble lui-même use cases + adapters in-memory | use cases + adapters locaux | adapters de prod |

Deux garde-fous transverses dans `lib/` :

- **`di-container.ts`** — getters paresseux : chaque Lambda ne paie que les dépendances de
  *son* use case. Le endpoint de callback vient de `event.requestContext`, pas d'une
  variable d'environnement.
- **`wrap-handler.ts`** — try/catch commun : erreur loggée avec le nom de l'action,
  réponse 500 contrôlée au lieu d'un crash opaque.

---

## Câblage route par route

Grâce au conteneur paresseux, les quatre routes de relais tournent **sans aucune variable
d'environnement**.

| Route WS | Lambda | Use case | Ports | Adapters (prod) | Env requises |
|---|---|---|---|---|---|
| `$connect` | `WebSocket_Connect` | ConnectPeer | repo | Turso | `TURSO_*` |
| `$disconnect` | `WebSocket_Disconnect` | DisconnectPeer | repo | Turso | `TURSO_*` |
| `start` | `WebSocket_Start` | FindStranger | repo + gateway | Turso + API GW Management | `TURSO_*` |
| `videoOffer` | `WebSocket_VideoOffer` | ForwardMessage | gateway | API GW Management | *aucune* |
| `videoAnswer` | `WebSocket_VideoAnswer` | ForwardMessage | gateway | API GW Management | *aucune* |
| `newIceCandidate` | `WebSocket_NewIceCandidate` | ForwardMessage | gateway | API GW Management | *aucune* |
| `hangUp` | `WebSocket_HangUp` | ForwardMessage | gateway | API GW Management | *aucune* |

Le gateway construit son endpoint depuis `event.requestContext.domainName` + `stage` —
plus besoin de `DOMAIN_NAME`/`STAGE` dans l'infra.

---

## Le flux `start` : matcher deux inconnus

Le seul scénario qui traverse les deux ports à la fois — c'est lui qui justifie l'architecture.

```mermaid
sequenceDiagram
  autonumber
  participant B as Client B
  participant GW as API Gateway WS
  participant L as Lambda ws-start
  participant UC as FindStranger
  participant R as repo (Turso)
  participant G as gateway (API GW Mgmt)
  participant A as Client A (en attente)

  B->>GW: {action: "start"}
  GW->>L: invoke(event)
  L->>UC: execute(connB)
  UC->>R: findAvailable(connB)
  alt un pair est disponible
    R-->>UC: connexion A
    UC->>R: setUnavailable(A)
    UC->>G: send(B, initOffer)
    G-->>B: initOffer {role: caller, strangerId: A}
    UC->>G: send(A, initOffer)
    G-->>A: initOffer {role: callee, strangerId: B}
  else personne en attente
    UC->>R: setAvailable(B)
    UC-->>L: {status: "waiting"}
  end
```

---

## Du source au Lambda : le trajet d'un handler

```text
src/ws-start/index.ts        re-export du handler
        │
        ▼
bundler.mjs                  esbuild · CJS · target node20 · minify + sourcemap
        │
        ▼
dist/ws-start/index.js+.map  bundle hermétique, toutes deps incluses (aucun `external`)
        │
        ▼
Pulumi FileArchive           infra/src/start-lambda.ts
        │
        ▼
λ WebSocket_Start            nodejs20.x · arm64 · handler `index.handler`
```

Les `.map` sont déployées dans le zip et lues par `NODE_OPTIONS=--enable-source-maps` :
les stack traces CloudWatch pointent sur le TypeScript, pas sur le bundle minifié.

---

## Où intervenir selon le besoin

- **Changer de base de données** — écrire un nouvel adapter de `IConnectionRepository` dans
  `adapters/repositories/`, puis changer une ligne dans `lib/di-container.ts`. Ni les use
  cases, ni les handlers ne bougent.
- **Ajouter une action WebSocket** — un handler dans `handlers/` + une entrée
  `src/ws-*/index.ts` déclarée dans `bundler.mjs` + la route côté `infra/`. Si c'est un
  simple relais, `ForwardMessage` existe déjà.
- **Tester la logique de matching** — instancier `FindStranger` avec
  `InMemoryConnectionRepository` et un faux gateway : aucun mock d'AWS nécessaire. C'est
  exactement ce que fait `local-server/` (`pnpm dev`).

---

*Schéma établi depuis le code réel de `packages/signaling-ws/src` — branche
`refactor-signaling-ws`, juillet 2026.*
