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
        contract: '0x2e44310287e623fda88ee032c72d0083d037513a7d1fe666ad3f2b1a11116e6',
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
        contract: '0x2e375f67ffbc6d1a0e50d3ca104d814c4aabad01ebbe5c79cd491f47be09731',
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
        contract: '0x2e375f67ffbc6d1a0e50d3ca104d814c4aabad01ebbe5c79cd491f47be09731',
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
