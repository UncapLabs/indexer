import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import Checkpoint, { starknet, LogLevel } from '@snapshot-labs/checkpoint';
import { createConfig } from './config';
import { createStarknetWriters } from './writers';
import { RpcProvider } from 'starknet';
import overrides from './overrides.json';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const PRODUCTION_INDEXER_DELAY = 60 * 1000;

export type Context = {
  indexerName: string;
  provider: RpcProvider;
};

if (process.env.CA_CERT) {
  process.env.CA_CERT = process.env.CA_CERT.replace(/\\n/g, '\n');
}

function getDatabaseConnection() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  if (process.env.DATABASE_URL_INDEX) {
    return process.env[`DATABASE_URL_${process.env.DATABASE_URL_INDEX}`];
  }

  throw new Error('No valid database connection URL found.');
}

const dir = __dirname.endsWith('dist/src') ? '../' : '';
const schemaFile = path.join(__dirname, `${dir}../src/schema.gql`);
const schema = fs.readFileSync(schemaFile, 'utf8');

const checkpoint = new Checkpoint(schema, {
  logLevel: LogLevel.Info,
  prettifyLogs: true,
  dbConnection: getDatabaseConnection(),
  overridesConfig: overrides
});

const config = createConfig();
const mainnetContext = {
  indexerName: 'mainnet',
  provider: new RpcProvider({ nodeUrl: config.network_node_url })
};
const mainnetIndexer = new starknet.StarknetIndexer(createStarknetWriters(mainnetContext));

checkpoint.addIndexer('mainnet', config, mainnetIndexer);

const sepoliaContext = {
  indexerName: 'sepolia',
  provider: new RpcProvider({ nodeUrl: config.network_node_url })
};
const sepoliaIndexer = new starknet.StarknetIndexer(createStarknetWriters(sepoliaContext));

checkpoint.addIndexer('sepolia', config, sepoliaIndexer);

async function run() {
  if (process.env.NODE_ENV === 'production') {
    console.log('Delaying indexer to prevent multiple processes indexing at the same time.');
    await sleep(PRODUCTION_INDEXER_DELAY);
  }
  // No need to reset
  await checkpoint.resetMetadata();
  await checkpoint.reset();
  await checkpoint.start();
}
run();

const app = express();
app.use(express.json({ limit: '4mb' }));
app.use(express.urlencoded({ limit: '4mb', extended: false }));
app.use(cors({ maxAge: 86400 }));
app.use('/', checkpoint.graphql);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening at http://localhost:${PORT}`));
