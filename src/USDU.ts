import { Context } from './index';
import BorrowerOperationsAbi from './abis/BorrowerOperations.json';
import CollateralRegistryAbi from './abis/CollateralRegistry.json';
import TroveManagerAbi from './abis/TroveManager.json';
import { Contract } from 'starknet';
import { starknet } from '@snapshot-labs/checkpoint';
import { Collateral, CollateralAddresses } from '../.checkpoint/models';
import { Instance } from '@snapshot-labs/checkpoint';
import { FullBlock } from '@snapshot-labs/checkpoint/dist/src/providers/starknet';
import { toHexAddress } from './shared';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000000000000000000000000000';

export function createCollateralRegistryAddressChangedHandler(ctx: Context): starknet.Writer {
  return async ({ block, event, helpers }) => {
    console.log('SCOTT event', event);
    const registry = new Contract(
      CollateralRegistryAbi,
      event.new_collateral_registry,
      ctx.provider
    );
    const totalCollaterals: number = await registry.get_total_collaterals();

    for (let index = 0; index < totalCollaterals; index++) {
      const tokenAddress = toHexAddress(await registry.get_collateral(index));

      const troveManagerAddress = toHexAddress(await registry.get_trove_manager(index));
      const troveManager = new Contract(TroveManagerAbi, troveManagerAddress, ctx.provider);
      const troveManagerEventsEmitterAddress = toHexAddress(
        await troveManager.get_trove_manager_events_emitter()
      );

      if (tokenAddress === ZERO_ADDRESS || troveManagerAddress === ZERO_ADDRESS) {
        break;
      }

      // we use the token address as the id for the collateral
      const coll = await Collateral.loadEntity(tokenAddress, ctx.indexerName);
      if (!coll) {
        addCollateral(
          helpers,
          block,
          index,
          totalCollaterals,
          tokenAddress,
          troveManagerEventsEmitterAddress,
          troveManagerAddress,
          ctx
        );
      }
    }
  };
}

async function addCollateral(
  helpers: ReturnType<Instance['getWriterHelpers']>,
  block: FullBlock,
  collIndex: number,
  totalCollaterals: number,
  tokenAddress: string,
  troveManagerEventsEmitterAddress: string,
  troveManagerAddress: string,
  ctx: Context
): Promise<void> {
  const collId = collIndex.toString();

  // TODO: why is collateral a const, when it's being mutated?
  const collateral = new Collateral(collId, ctx.indexerName);
  collateral.collIndex = collIndex;

  const troveManagerContract = new Contract(TroveManagerAbi, troveManagerAddress, ctx.provider);

  console.log('SCOTT collId', collId);
  const addresses = new CollateralAddresses(collId, ctx.indexerName);
  addresses.collateral = collId;
  addresses.borrowerOperations = toHexAddress(await troveManagerContract.get_borrower_operations());
  addresses.sortedTroves = toHexAddress(await troveManagerContract.get_sorted_troves());
  addresses.stabilityPool = toHexAddress(await troveManagerContract.get_stability_pool());
  addresses.token = tokenAddress;
  addresses.troveManagerEventsEmitter = troveManagerEventsEmitterAddress;
  addresses.troveManager = troveManagerAddress;
  addresses.troveNft = toHexAddress(await troveManagerContract.get_trove_nft());

  const borrowerOperationsContract = new Contract(
    BorrowerOperationsAbi,
    addresses.borrowerOperations,
    ctx.provider
  );
  collateral.minCollRatio = await borrowerOperationsContract.get_mcr();

  await collateral.save();
  await addresses.save();

  const toto = await Collateral.loadEntity(collId, ctx.indexerName);
  console.log(`\nSCOTT ${toto}\n`);

  // TODO: find a way to pass context
  //   let context = new DataSourceContext();
  //   context.setBytes('address:borrowerOperations', addresses.borrowerOperations);
  //   context.setBytes('address:sortedTroves', addresses.sortedTroves);
  //   context.setBytes('address:stabilityPool', addresses.stabilityPool);
  //   context.setBytes('address:token', addresses.token);
  //   context.setBytes('address:troveManager', addresses.troveManager);
  //   context.setBytes('address:troveNft', addresses.troveNft);
  //   context.setString('collId', collId);
  //   context.setI32('collIndex', collIndex);
  //   context.setI32('totalCollaterals', totalCollaterals);
  // SET troveManagerEventsEmitterAddress
  // Simply need to add this to a new entity and fetch if from inside the template. TODO Later on we can cache it so it's loaded once per ID

  // TODO: execute templates here
  //   await helpers.executeTemplate('TroveManagerEventsEmitter', {
  //     contract: '0xd98cf01b5bea47490702ced60943cce619599dba09cf3aeae6993c4f1b2ef2',
  //     start: block.block_number
  //   });
  //   console.log('started the first one');
  //   await helpers.executeTemplate('TroveNFT', {
  //     contract: addresses.troveNft,
  //     start: block.block_number
  //   });
  //   console.log('started the second one');
}
