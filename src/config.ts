import { CheckpointConfig } from '@snapshot-labs/checkpoint';
import TroveManager from './abis/TroveManager.json';
import CollateralRegistry from './abis/CollateralRegistry.json';
import BorrowerOperations from './abis/BorrowerOperations.json';
import StabilityPool from './abis/StabilityPool.json';
import TroveManagerEventsEmitter from './abis/TroveManagerEventsEmitter.json';
import TroveNFT from './abis/TroveNFT.json';
import USDU from './abis/USDU.json';

const CONFIG = {
  sepolia: {
    networkNodeUrl: 'https://starknet-sepolia.infura.io/v3/c82b1cf516984b599108487a1b6481c4'
  }
};

export function createConfig(indexerName: keyof typeof CONFIG): CheckpointConfig {
  const { networkNodeUrl } = CONFIG[indexerName];

  return {
    network_node_url: networkNodeUrl,
    optimistic_indexing: false,
    fetch_interval: 1000,
    sources: [
      {
        contract: '0x4e673401f1db9f478d9c9092f3a1ec56cb3b2b6b6ea583029c6f4729693a7af',
        start: 1760464,
        abi: 'USDU',
        events: [
          {
            name: 'CollateralRegistryAddressChanged',
            fn: 'handleCollateralRegistryAddressChanged'
          }
        ]
      },
      {
        contract: '0x239ea2fe06841aa7651ae3eba7da15322838e2dbc490aaf3304c4cfe5b50fd6',
        start: 1760464,
        abi: 'StabilityPool',
        events: [
          {
            name: 'DepositOperation',
            fn: 'handleStabilityPoolOperation'
          }
        ]
      },
      {
        contract: '0x93e433139cd2d79faf1ce8000ca68a29d2eb15986887c39e055d266866a1d8',
        start: 1760464,
        abi: 'StabilityPool',
        events: [
          {
            name: 'DepositOperation',
            fn: 'handleStabilityPoolOperation'
          }
        ]
      }
    ],
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
      }
    },
    abis: {
      BorrowerOperations,
      CollateralRegistry,
      StabilityPool,
      TroveManager,
      TroveManagerEventsEmitter,
      TroveNFT,
      USDU
    }
  };
}
