import { starknet } from '@snapshot-labs/checkpoint';
import { Context } from './index';
import { Trove } from '../.checkpoint/models';
import { updateBorrowerTrovesCount, BorrowerTrovesCountUpdate } from './shared';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000000000000000000000000000';

export function createTransferHandler(ctx: Context): starknet.Writer {
  return async ({ event }) => {
    console.log('\n\nSCOTT event', event);
    // Minting doesn’t need to be handled as we are already
    // handling OP_OPEN_TROVE & OP_OPEN_TROVE_AND_JOIN_BATCH
    // in TroveManager.mapping.ts.
    if (event.from == ZERO_ADDRESS) {
      return;
    }

    const collId = '0';
    //   let collId = dataSource.context().getString('collId'); TODO: get from context
    const troveFullId = `${collId}:${event.token_id}`;

    const trove = await Trove.loadEntity(troveFullId, ctx.indexerName);
    if (!trove) {
      throw new Error(`Trove does not exist: ${troveFullId}`);
    }

    const collIndex = Number(trove.collateral);

    // update troves count & ownerIndex for the previous owner
    updateBorrowerTrovesCount(
      BorrowerTrovesCountUpdate.remove,
      event.from,
      collIndex,
      ctx.indexerName
    );

    // update troves count & ownerIndex for the current owner (including zero address)
    updateBorrowerTrovesCount(BorrowerTrovesCountUpdate.add, event.to, collIndex, ctx.indexerName);

    // update the trove borrower
    trove.borrower = event.to;
    await trove.save();
  };
}
