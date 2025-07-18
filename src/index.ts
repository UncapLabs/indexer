import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import Checkpoint, { starknet, LogLevel } from '@snapshot-labs/checkpoint';
import { createConfig } from './config';
import { createStarknetWriters } from './writers';
import { RpcProvider } from 'starknet';

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

// const mainnetConfig = createConfig('mainnet');
const sepoliaConfig = createConfig('sepolia');

// const mainnetIndexer = new starknet.StarknetIndexer(createStarknetWriters('mainnet'));
const context = {
  indexerName: 'sepolia',
  provider: new RpcProvider({ nodeUrl: 'https://rpc.snapshot.org/sn-sep' })
};
const sepoliaIndexer = new starknet.StarknetIndexer(createStarknetWriters(context));

const checkpoint = new Checkpoint(schema, {
  logLevel: LogLevel.Info,
  prettifyLogs: true,
  dbConnection: getDatabaseConnection()
});

// checkpoint.addIndexer('mainnet', mainnetConfig, mainnetIndexer);
checkpoint.addIndexer('sepolia', sepoliaConfig, sepoliaIndexer);

async function run() {
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
