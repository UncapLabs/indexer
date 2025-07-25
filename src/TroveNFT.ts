import { starknet } from '@snapshot-labs/checkpoint';
import { Context } from './index';
import { Trove, TroveManagerEventsEmitter } from '../.checkpoint/models';
import { updateBorrowerTrovesCount, BorrowerTrovesCountUpdate, toHexAddress } from './shared';

const ZERO_ADDRESS = toHexAddress('0');

export function createTransferHandler(ctx: Context): starknet.Writer {
  return async ({ event, rawEvent }) => {
    // Minting doesn’t need to be handled as we are already
    // handling OP_OPEN_TROVE & OP_OPEN_TROVE_AND_JOIN_BATCH
    // in TroveManager.mapping.ts.
    const fromAddress = toHexAddress(event.from);
    const toAddress = toHexAddress(event.to);
    const eventEmitter = toHexAddress(rawEvent.from_address);
    if (fromAddress == ZERO_ADDRESS) {
      return;
    }

    const troveManagerEventsEmitter = await TroveManagerEventsEmitter.loadEntity(
      eventEmitter,
      ctx.indexerName
    );
    const collId = troveManagerEventsEmitter.collId;
    const troveFullId = `${collId}:${event.token_id}`;

    const trove = await Trove.loadEntity(troveFullId, ctx.indexerName);
    if (!trove) {
      throw new Error(`Trove does not exist: ${troveFullId}`);
    }

    // update troves count & ownerIndex for the previous owner
    updateBorrowerTrovesCount(
      BorrowerTrovesCountUpdate.remove,
      fromAddress,
      Number(collId),
      ctx.indexerName
    );

    // update troves count & ownerIndex for the current owner (including zero address)
    updateBorrowerTrovesCount(
      BorrowerTrovesCountUpdate.add,
      toAddress,
      Number(collId),
      ctx.indexerName
    );

    // update the trove borrower
    trove.previousOwner = trove.borrower;
    trove.borrower = toAddress;
    await trove.save();
  };
}
