import { Context } from './index';
import BorrowerOperationsAbi from './abis/BorrowerOperations.json';
import CollateralRegistryAbi from './abis/CollateralRegistry.json';
import TroveManagerAbi from './abis/TroveManager.json';
import { Contract } from 'starknet';
import { starknet } from '@snapshot-labs/checkpoint';
import { Collateral, CollateralAddresses, TroveManagerEventsEmitter } from '../.checkpoint/models';
import { Instance } from '@snapshot-labs/checkpoint';
import { FullBlock } from '@snapshot-labs/checkpoint/dist/src/providers/starknet';
import { toHexAddress } from './shared';

const ZERO_ADDRESS = toHexAddress('0');

export function createCollateralRegistryAddressChangedHandler(ctx: Context): starknet.Writer {
  return async ({ block, event, helpers }) => {
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
        await addCollateral(
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

  const collateral = new Collateral(collId, ctx.indexerName);
  collateral.collIndex = collIndex;

  const troveManagerContract = new Contract(TroveManagerAbi, troveManagerAddress, ctx.provider);

  const addresses = new CollateralAddresses(collId, ctx.indexerName);
  addresses.collateral = collId;
  addresses.borrowerOperations = toHexAddress(await troveManagerContract.get_borrower_operations());
  addresses.sortedTroves = toHexAddress(await troveManagerContract.get_sorted_troves());
  addresses.stabilityPool = toHexAddress(await troveManagerContract.get_stability_pool());
  addresses.token = tokenAddress;
  addresses.troveManagerEventsEmitter = troveManagerEventsEmitterAddress;
  addresses.troveManager = troveManagerAddress;
  addresses.troveNft = toHexAddress(await troveManagerContract.get_trove_nft());
  addresses.liquidationManager = toHexAddress(await troveManagerContract.get_liquidation_manager());
  addresses.redemptionManager = toHexAddress(await troveManagerContract.get_redemption_manager());

  const borrowerOperationsContract = new Contract(
    BorrowerOperationsAbi,
    addresses.borrowerOperations,
    ctx.provider
  );
  collateral.minCollRatio = await borrowerOperationsContract.get_mcr();

  await collateral.save();
  await addresses.save();

  const troveManager = new TroveManagerEventsEmitter(
    troveManagerEventsEmitterAddress,
    ctx.indexerName
  );
  troveManager.collId = collId;

  await troveManager.save();

  await helpers.executeTemplate('TroveManagerEventsEmitter', {
    contract: addresses.troveManagerEventsEmitter,
    start: block.block_number
  });
  await helpers.executeTemplate('TroveNFT', {
    contract: addresses.troveNft,
    start: block.block_number
  });
}
