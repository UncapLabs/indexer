import { BorrowerInfo } from '../.checkpoint/models';

export enum BorrowerTrovesCountUpdate {
  add,
  remove
}

export async function updateBorrowerTrovesCount(
  update: BorrowerTrovesCountUpdate,
  borrower: string,
  collIndex: number,
  indexerName: string
): Promise<BorrowerInfo> {
  const borrowerId = borrower;
  let borrowerInfo = await BorrowerInfo.loadEntity(borrowerId, indexerName);

  const maxCollateralsCount = 20;

  if (!borrowerInfo) {
    borrowerInfo = new BorrowerInfo(borrowerId, indexerName);
    borrowerInfo.troves = 0;
    borrowerInfo.trovesByCollateral = new Array<number>(maxCollateralsCount).fill(0);
    borrowerInfo.nextOwnerIndexes = new Array<number>(maxCollateralsCount).fill(0);
  }

  // track the amount of troves per collateral
  const trovesByCollateral = borrowerInfo.trovesByCollateral;
  trovesByCollateral[collIndex] += update === BorrowerTrovesCountUpdate.add ? 1 : -1;
  borrowerInfo.trovesByCollateral = trovesByCollateral;

  // track the total amount of troves
  borrowerInfo.troves += update === BorrowerTrovesCountUpdate.add ? 1 : -1;

  // nextOwnerIndexes only ever goes up
  if (update === BorrowerTrovesCountUpdate.add) {
    const nextOwnerIndexes = borrowerInfo.nextOwnerIndexes;
    nextOwnerIndexes[collIndex] += 1;
    borrowerInfo.nextOwnerIndexes = nextOwnerIndexes;
  }

  await borrowerInfo.save();

  return borrowerInfo;
}

export function toHexAddress(address: string | bigint | number): string {
  let addy: bigint;
  if (typeof address === 'string' || typeof address === 'number') {
    addy = BigInt(address);
  } else {
    addy = address;
  }
  const hexString = addy.toString(16);
  const paddedHex = hexString.padStart(64, '0');
  return `0x${paddedHex}`;
}
