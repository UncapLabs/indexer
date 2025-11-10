import { CheckpointConfig } from '@snapshot-labs/checkpoint';
import TroveManager from './abis/TroveManager.json';
import BatchManager from './abis/BatchManager.json';
import CollateralRegistry from './abis/CollateralRegistry.json';
import BorrowerOperations from './abis/BorrowerOperations.json';
import StabilityPool from './abis/StabilityPool.json';
import TroveManagerEventsEmitter from './abis/TroveManagerEventsEmitter.json';
import TroveNFT from './abis/TroveNFT.json';
import USDU from './abis/USDU.json';

export function createConfig(chain: string): CheckpointConfig {
  const networkNodeUrl =
    chain === 'mainnet'
      ? process.env.STARKNET_RPC_URL_MAINNET
      : process.env.STARKNET_RPC_URL_SEPOLIA;

  const mainnetSources = [
    {
      contract: '0x02f94539f80158f9a48a7acf3747718dfbec9b6f639e2742c1fb44ae7ab5aa04',
      start: 2753629,
      abi: 'USDU',
      events: [
        {
          name: 'TroveManagerAddressAdded',
          fn: 'handleNewBranch'
        }
      ]
    }
  ];

  const sepoliaSources = [
    {
      contract: '0x2f05a7b79478c064d338af2706e19ddbbbd77c102ba46cb293f4e2f9dccf751',
      start: 2840776,
      abi: 'USDU',
      events: [
        {
          name: 'TroveManagerAddressAdded',
          fn: 'handleNewBranch'
        }
      ]
    }
  ];

  return {
    network_node_url: networkNodeUrl,
    optimistic_indexing: false,
    fetch_interval: 2000,
    sources: chain === 'mainnet' ? mainnetSources : sepoliaSources,
    templates: {
      TroveManagerEventsEmitter: {
        abi: 'TroveManagerEventsEmitter',
        events: [
          {
            name: 'TroveOperation',
            fn: 'handleTroveOperation'
          },
          {
            name: 'TroveUpdated',
            fn: 'handleTroveUpdated'
          },
          {
            name: 'BatchedTroveUpdated',
            fn: 'handleBatchedTroveUpdated'
          },
          {
            name: 'BatchUpdated',
            fn: 'handleBatchUpdated'
          }
        ]
      },
      TroveNFT: {
        abi: 'TroveNFT',
        events: [
          {
            name: 'Transfer',
            fn: 'handleTransfer'
          }
        ]
      },
      BatchManager: {
        abi: 'BatchManager',
        events: [
          {
            name: 'BatchUpdated',
            fn: 'handleBatchUpdated'
          }
        ]
      }
    },
    abis: {
      BorrowerOperations,
      BatchManager,
      CollateralRegistry,
      StabilityPool,
      TroveManager,
      TroveManagerEventsEmitter,
      TroveNFT,
      USDU
    }
  };
}
