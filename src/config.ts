import { CheckpointConfig } from '@snapshot-labs/checkpoint';
import TroveManager from './abis/TroveManager.json';
import CollateralRegistry from './abis/CollateralRegistry.json';
import BorrowerOperations from './abis/BorrowerOperations.json';
import TroveManagerEventsEmitter from './abis/TroveManagerEventsEmitter.json';
import TroveNFT from './abis/TroveNFT.json';
import USDU from './abis/USDU.json';

const CONFIG = {
  sepolia: {
    networkNodeUrl: 'https://starknet-sepolia.infura.io/v3/c82b1cf516984b599108487a1b6481c4'
  }
};

// Trove Manger Event emitter: 0x074243f37fe2ebb3469499d8ee8480a443c115cdd381014be004fc1291ecbaae

export function createConfig(indexerName: keyof typeof CONFIG): CheckpointConfig {
  const { networkNodeUrl } = CONFIG[indexerName];

  return {
    network_node_url: networkNodeUrl,
    optimistic_indexing: false,
    fetch_interval: 15000,
    sources: [
      {
        contract: '0x3dceaae3f78fe55bb93e1ca2e0afa9dc5aeb1c2f352217e717b97107bce680f',
        start: 1060055,
        abi: 'USDU',
        events: [
          {
            name: 'CollateralRegistryAddressChanged',
            fn: 'handleCollateralRegistryAddressChanged'
          }
        ]
      }
      // {
      //   contract: '0x00d98cf01b5bea47490702ced60943cce619599dba09cf3aeae6993c4f1b2ef2',
      //   start: 1060055,
      //   abi: 'TroveManagerEventsEmitter',
      //   events: [
      //     {
      //       name: 'TroveOperation',
      //       fn: 'handleTroveOperation'
      //     }
      //   ]
      // }
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
      TroveManager,
      TroveManagerEventsEmitter,
      TroveNFT,
      USDU
    }
  };
}
