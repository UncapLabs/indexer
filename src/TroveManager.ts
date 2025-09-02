import { starknet } from '@snapshot-labs/checkpoint';
import { Collateral, Trove } from '../.checkpoint/models';
import { InterestBatch } from '../.checkpoint/models';
import { InterestRateBracket, TroveManagerEventsEmitter } from '../.checkpoint/models';
import { Context } from './index';
import { toHexAddress } from './shared';
import { CairoCustomEnum } from 'starknet';

// see Operation enum in contracts
//
const OP_OPEN_TROVE = 'OpenTrove';
const OP_CLOSE_TROVE = 'CloseTrove';
const OP_ADJUST_TROVE = 'AdjustTrove';
// const OP_ADJUST_TROVE_INTEREST_RATE = 'AdjustTroveInterestRate';
const OP_APPLY_PENDING_DEBT = 'ApplyPendingDebt';
const OP_LIQUIDATE = 'Liquidate';
const OP_REDEEM_COLLATERAL = 'RedeemCollateral';
const OP_OPEN_TROVE_AND_JOIN_BATCH = 'OpenTroveAndJoinBatch';
// const OP_SET_INTEREST_BATCH_MANAGER = 'SetInterestBatchManager';
// const OP_REMOVE_FROM_BATCH = 'RemoveFromBatch';

const FLASH_LOAN_TOPIC = 'TODO'; // TODO: should be the hash of the flash loan event

export function createTroveOperationHandler(context: Context): starknet.Writer {
  return async ({ block, event, rawEvent }) => {
    if (!block || !event || !rawEvent) return;
    const operation: string = new CairoCustomEnum(event.operation.variant).activeVariant();

    const indexerName = context.indexerName;

    const timestamp = block.timestamp;

    const troveManagerEventsEmitterAddress = toHexAddress(rawEvent.from_address);
    const collId = (
      await TroveManagerEventsEmitter.loadEntity(troveManagerEventsEmitterAddress, indexerName)
    ).collId;

    const collateral = await Collateral.loadEntity(collId, indexerName);

    if (!collateral) {
      throw new Error(`Collateral not found: ${collId}`);
    }

    const troveId = `${collId}:${event.trove_id}`;
    const trove = await Trove.loadEntity(troveId, indexerName);

    if (!trove) {
      throw new Error(`Trove not found: ${troveId}`);
    }

    // Opening
    if (operation === OP_OPEN_TROVE || operation === OP_OPEN_TROVE_AND_JOIN_BATCH) {
      trove.createdAt = timestamp;
    }

    // Closing
    if (operation === OP_CLOSE_TROVE || operation === OP_LIQUIDATE) {
      trove.closedAt = timestamp;
    }

    // User action
    if (
      operation !== OP_REDEEM_COLLATERAL &&
      operation !== OP_LIQUIDATE &&
      operation !== OP_APPLY_PENDING_DEBT
    ) {
      trove.lastUserActionAt = timestamp;
      trove.redemptionCount = 0;
      trove.redeemedColl = BigInt(0).toString();
      trove.redeemedDebt = BigInt(0).toString();
      trove.status = operation === OP_CLOSE_TROVE ? 'closed' : 'active';
    }

    // Redemption
    if (operation === OP_REDEEM_COLLATERAL) {
      trove.status = 'redeemed';
      trove.redemptionCount = trove.redemptionCount + 1;
      trove.redeemedColl = (
        BigInt(trove.redeemedColl) - BigInt(event.coll_change_from_operation.abs)
      ).toString();
      trove.redeemedDebt = (
        BigInt(trove.redeemedDebt) + BigInt(event.debt_change_from_operation.abs)
      ).toString();
    }

    // Liquidation
    if (operation === OP_LIQUIDATE) {
      trove.status = 'liquidated';
    }

    // Infer leverage flag on opening & adjustment
    if (
      operation === OP_OPEN_TROVE ||
      operation === OP_OPEN_TROVE_AND_JOIN_BATCH ||
      operation === OP_ADJUST_TROVE
    ) {
      trove.mightBeLeveraged = inferLeverage(event);
    }

    trove.save();
  };
}

function inferLeverage(event: starknet.ParsedEvent): boolean {
  const receipt = event.receipt;
  const logs = receipt ? receipt.logs : [];
  for (let i = 0; i < logs.length; i++) {
    if (logs[i].topics[0].equals(FLASH_LOAN_TOPIC)) {
      return true;
    }
  }
  return false;
}

async function updateRateBracketDebt(
  collId: string,
  prevRate: bigint | null,
  newRate: bigint,
  prevDebt: bigint,
  newDebt: bigint,
  indexerName: string,
  prevTime: number,
  newTime: number
): Promise<void> {
  let rateBracket: InterestRateBracket | null = null;

  // remove debt from prev bracket
  if (prevRate !== 0n) {
    const rateFloored = getRateFloored(prevRate);
    const rateBracketId = `${collId}:${rateFloored.toString()}`;
    rateBracket = await InterestRateBracket.loadEntity(rateBracketId, indexerName);
    if (!rateBracket) {
      throw new Error(`Prev rate bracket not found: ${rateBracketId}`);
    }

    rateBracket.totalDebt = (BigInt(rateBracket.totalDebt) - prevDebt).toString();
    // Break down the computation into meaningful parts
    const currentBracketInterestAccrual =
      (BigInt(newTime) - BigInt(rateBracket.updatedAt)) * BigInt(rateBracket.sumDebtTimesRateD36);
    const previousBracketInterestAccrual =
      (BigInt(newTime) - BigInt(prevTime)) * prevDebt * prevRate;

    rateBracket.pendingDebtTimesOneYearD36 = (
      BigInt(rateBracket.pendingDebtTimesOneYearD36) +
      currentBracketInterestAccrual -
      previousBracketInterestAccrual
    ).toString();

    rateBracket.sumDebtTimesRateD36 = (
      BigInt(rateBracket.sumDebtTimesRateD36) -
      prevDebt * prevRate
    ).toString();
    rateBracket.updatedAt = newTime;
  }

  // add debt to new bracket
  if (newRate !== 0n) {
    const rateFloored = getRateFloored(newRate);
    const rateBracketId = `${collId}:${rateFloored.toString()}`;

    if (!rateBracket || rateBracket.id !== rateBracketId) {
      if (rateBracket) {
        await rateBracket.save();
      }

      if (!(rateBracket = await InterestRateBracket.loadEntity(rateBracketId, indexerName))) {
        rateBracket = new InterestRateBracket(rateBracketId, indexerName);
        rateBracket.collateral = collId;
        rateBracket.rate = rateFloored.toString();
        rateBracket.totalDebt = BigInt(0).toString();
        rateBracket.sumDebtTimesRateD36 = BigInt(0).toString();
        rateBracket.pendingDebtTimesOneYearD36 = BigInt(0).toString();
        rateBracket.updatedAt = newTime;
      }
    }

    rateBracket.totalDebt = (BigInt(rateBracket.totalDebt) + newDebt).toString();
    rateBracket.pendingDebtTimesOneYearD36 = (
      BigInt(rateBracket.pendingDebtTimesOneYearD36) +
      BigInt(newTime - rateBracket.updatedAt) * BigInt(rateBracket.sumDebtTimesRateD36)
    ).toString();
    rateBracket.sumDebtTimesRateD36 = (
      BigInt(rateBracket.sumDebtTimesRateD36) +
      newDebt * newRate
    ).toString();
    rateBracket.updatedAt = newTime;
  }

  if (rateBracket) {
    await rateBracket.save();
  }
}

function floorToDecimals(value: bigint, decimals: number): bigint {
  const factor = BigInt(10) ** (BigInt(18) - BigInt(decimals));
  return (value / factor) * factor;
}

function getRateFloored(rate: bigint): bigint {
  return floorToDecimals(rate, 3);
}

export function createBatchUpdatedHandler(ctx: Context): starknet.Writer {
  return async ({ block, event, rawEvent }) => {
    if (!block || !event) return;

    const indexerName = ctx.indexerName;

    const troveManagerEventsEmitterAddress = toHexAddress(rawEvent.from_address);
    const collId = (
      await TroveManagerEventsEmitter.loadEntity(troveManagerEventsEmitterAddress, indexerName)
    ).collId;

    const batchId = `${collId}:${toHexAddress(event.interest_batch_manager)}`;
    let batch = await InterestBatch.loadEntity(batchId, indexerName);
    if (!batch) {
      batch = new InterestBatch(batchId, indexerName);
      batch.collateral = collId;
      batch.batchManager = event.params._interestBatchManager;
      batch.annualInterestRate = BigInt(0).toString();
      batch.debt = BigInt(0).toString();
      batch.updatedAt = event.block.timestamp;
    }

    await updateRateBracketDebt(
      collId,
      BigInt(batch.annualInterestRate),
      BigInt(event.annual_interest_rate),
      BigInt(batch.debt),
      BigInt(event.debt),
      indexerName,
      batch.updatedAt,
      block.timestamp
    );

    batch.debt = BigInt(event.debt).toString();
    batch.coll = BigInt(event.coll).toString();
    batch.annualInterestRate = BigInt(event.annual_interest_rate).toString();
    batch.annualManagementFee = BigInt(event.annual_management_fee).toString();
    batch.updatedAt = block.timestamp;
    await batch.save();
  };
}

export function createTrove(troveId: string, indexerName: string): Trove {
  const trove = new Trove(troveId, indexerName);
  trove.borrower = toHexAddress(0);
  trove.createdAt = 0;
  trove.debt = BigInt(0).toString();
  trove.deposit = BigInt(0).toString();
  trove.stake = BigInt(0).toString();
  trove.status = 'active';
  trove.troveId = troveId;
  trove.updatedAt = 0;
  trove.lastUserActionAt = 0;
  trove.previousOwner = toHexAddress(0);
  trove.redemptionCount = 0;
  trove.redeemedColl = BigInt(0).toString();
  trove.redeemedDebt = BigInt(0).toString();
  trove.interestRate = BigInt(0).toString();
  trove.interestBatch = null;
  trove.mightBeLeveraged = false;

  // Don't save here - let the calling handler save after updating all fields
  return trove;
}

export function createTroveUpdatedHandler(ctx: Context): starknet.Writer {
  return async ({ block, event, rawEvent }) => {
    if (!block || !event) return;

    const indexerName = ctx.indexerName;

    const troveManagerEventsEmitterAddress = toHexAddress(rawEvent.from_address);
    const collId = (
      await TroveManagerEventsEmitter.loadEntity(troveManagerEventsEmitterAddress, indexerName)
    ).collId;

    const troveId = `${collId}:${event.trove_id}`;
    let trove = await Trove.loadEntity(troveId, indexerName);
    if (!trove) {
      trove = createTrove(troveId, indexerName);
    }

    await updateRateBracketDebt(
      collId,
      BigInt(trove.interestRate),
      BigInt(event.annual_interest_rate),
      BigInt(trove.debt),
      BigInt(event.debt),
      indexerName,
      trove.updatedAt,
      block.timestamp
    );

    trove.debt = BigInt(event.debt).toString();
    trove.deposit = BigInt(event.coll).toString();
    trove.stake = BigInt(event.stake).toString();
    trove.interestRate = BigInt(event.annual_interest_rate).toString();
    trove.interestBatch = null;
    trove.updatedAt = block.timestamp;
    await trove.save();
  };
}

export function createBatchedTroveUpdatedHandler(ctx: Context): starknet.Writer {
  return async ({ block, event, rawEvent }) => {
    if (!block || !event) return;

    const indexerName = ctx.indexerName;

    const troveManagerEventsEmitterAddress = toHexAddress(rawEvent.from_address);
    const collId = (
      await TroveManagerEventsEmitter.loadEntity(troveManagerEventsEmitterAddress, indexerName)
    ).collId;

    const troveId = `${collId}:${event.trove_id}`;
    const trove = await Trove.loadEntity(troveId, indexerName);

    if (!trove) {
      throw new Error(`Trove not found: ${troveId}`);
    }

    await updateRateBracketDebt(
      collId,
      BigInt(trove.interestRate),
      0n,
      BigInt(trove.debt),
      0n, // batched debt handled at batch level
      indexerName,
      trove.updatedAt,
      block.timestamp
    );

    if (event.total_debt_shares !== 0) {
      trove.debt = (
        (BigInt(event.debt) * BigInt(event.batch_debt_shares)) /
        BigInt(event.total_debt_shares)
      ).toString();
    } else {
      trove.debt = 0n.toString();
    }
    trove.deposit = BigInt(event.coll).toString();
    trove.stake = BigInt(event.stake).toString();
    trove.interestRate = 0n.toString();
    trove.interestBatch = `${collId}:${toHexAddress(event.interest_batch_manager)}`;
    trove.updatedAt = block.timestamp;
    await trove.save();
  };
}
