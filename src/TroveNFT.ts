import { starknet } from '@snapshot-labs/checkpoint';
import { Context } from './index';
import { Trove, TroveNFT } from '../.checkpoint/models';
import { updateBorrowerTrovesCount, BorrowerTrovesCountUpdate, toHexAddress } from './shared';

const ZERO_ADDRESS = toHexAddress('0');

export function createTransferHandler(ctx: Context): starknet.Writer {
  return async ({ event, rawEvent }) => {
    const fromAddress = toHexAddress(event.from);
    const toAddress = toHexAddress(event.to);
    const eventEmitter = toHexAddress(rawEvent.from_address);

    const troveNFT = await TroveNFT.loadEntity(eventEmitter, ctx.indexerName);
    const collId = troveNFT.collId;
    const troveFullId = `${collId}:${toHexAddress(event.token_id)}`;

    const trove = await Trove.loadEntity(troveFullId, ctx.indexerName);
    if (!trove) {
      throw new Error(`Trove does not exist: ${troveFullId}`);
    }

    if (fromAddress !== ZERO_ADDRESS) {
      // update troves count & ownerIndex for the previous owner
      await updateBorrowerTrovesCount(
        BorrowerTrovesCountUpdate.remove,
        fromAddress,
        Number(collId),
        ctx.indexerName
      );
    }

    // update troves count & ownerIndex for the current owner (including zero address)
    await updateBorrowerTrovesCount(
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
