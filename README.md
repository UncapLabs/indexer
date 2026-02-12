# Uncap Protocol Indexer

Indexer service for the Uncap Protocol on Starknet. It uses Checkpoint to ingest on-chain events, persist them to Postgres, and expose a GraphQL API for querying protocol state.

## Features

- Indexes mainnet and sepolia with independent RPC providers.
- Watches USDU for new collateral branches and dynamically attaches templates.
- Tracks troves, borrowers, batches, and interest rate brackets.
- Exposes a GraphQL endpoint backed by a typed schema.
- Sends Telegram notifications for trove updates, liquidations, and redemptions (mainnet only).

## Architecture (high level)

- Entry point: [src/index.ts](src/index.ts)
- Checkpoint config and sources: [src/config.ts](src/config.ts)
- Event writers: [src/writers.ts](src/writers.ts)
- Domain handlers:
  - [src/USDU.ts](src/USDU.ts) (new collateral branches)
  - [src/TroveManager.ts](src/TroveManager.ts) (trove operations, batches, rate brackets)
  - [src/TroveNFT.ts](src/TroveNFT.ts) (ownership transfers)
- GraphQL schema: [src/schema.gql](src/schema.gql)

## Data model

The schema includes:

- `Collateral`, `CollateralAddresses`
- `Trove`, `TroveManagerEventsEmitter`, `TroveNFT`
- `BorrowerInfo`
- `InterestBatch`, `InterestRateBracket`

See [src/schema.gql](src/schema.gql) for full types and relations.

## Prerequisites

- Node.js 18+
- Postgres 15+

For local Postgres, use [docker-compose.yml](docker-compose.yml).

## Environment variables

Required:

- `DATABASE_URL` (or `DATABASE_URL_INDEX` with `DATABASE_URL_<index>` variants)
- `STARKNET_RPC_URL_MAINNET`
- `STARKNET_RPC_URL_SEPOLIA`

Optional:

- `PORT` (default: 3000)
- `NODE_ENV` (in production, startup is delayed by 60s to avoid double indexing)
- `CA_CERT` (PEM string; supports \n escaping)
- `START_BLOCK` (skip Telegram notifications below this block)
- `CMC_API_KEY` (CoinMarketCap API key for WBTC USD estimates)

Telegram notifications (mainnet only):

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `TELEGRAM_BOT_TOKEN_CRITICAL_ALERTS`
- `TELEGRAM_CHAT_ID_CRITICAL_ALERTS`

## Install

1. Install dependencies.
2. Configure env vars.
3. Start Postgres (optional Docker Compose).
4. Run the indexer.

## Scripts

- `yarn codegen`: generate Checkpoint models
- `yarn dev`: run in watch mode (includes codegen)
- `yarn build`: compile TypeScript
- `yarn start`: run compiled build
- `yarn lint`: lint and autofix

## Running locally

1. Start Postgres using [docker-compose.yml](docker-compose.yml).
2. Run `yarn dev`.
3. Open the GraphQL endpoint at http://localhost:3000.

The GraphQL API is mounted at `/`.

## Notes

- Mainnet and sepolia are indexed in the same process with separate contexts.
- New collateral branches are discovered from USDU events and templates are attached for:
  - `TroveManagerEventsEmitter`
  - `TroveNFT`
  - `BatchManager`
- Telegram notifications are skipped for historical events and for non-mainnet indexers.

## License

MIT
