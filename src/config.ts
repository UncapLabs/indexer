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
    networkNodeUrl: process.env.STARKNET_RPC_URL || 'https://starknet-sepolia.infura.io/v3/c82b1cf516984b599108487a1b6481c4'
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
        contract: '0x4b3b579eb56214f871b5d41c3f0673a4cc964abd2f94ada41d59bdf7ffbc262',
        start: 2229948,
        abi: 'USDU',
        events: [
          {
            name: 'CollateralRegistryAddressChanged',
            fn: 'handleCollateralRegistryAddressChanged'
          }
        ]
      },
      {
        contract: '0x3b2236705adcd078a1657415a9a8324a37da72b8aa681f4930166bfbf0f8b18',
        start: 2229967,
        abi: 'StabilityPool',
        events: [
          {
            name: 'DepositOperation',
            fn: 'handleStabilityPoolOperation'
          }
        ]
      },
      {
        contract: '0x3743a157e081243a86a01e1ac31f1747becf7e01a660389c8f577f0510acfc4',
        start: 2230011,
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
