import { Contract } from 'starknet';
import TroveManagerAbi from './abis/TroveManager.json';
import { starknet } from '@snapshot-labs/checkpoint';
import { Collateral, InterestBatch, Trove } from '../.checkpoint/models';
import {
  InterestRateBracket,
  TroveManagerEventsEmitter,
  CollateralAddresses
} from '../.checkpoint/models';
import { updateBorrowerTrovesCount, BorrowerTrovesCountUpdate } from './shared';
import { Context } from './index';
import { toHexAddress } from './shared';
import { CairoCustomEnum } from 'starknet';

// decides whether to update the flag indicating
// that a trove might be leveraged or not.
enum LeverageUpdate {
  yes,
  no,
  unchanged
}

function touchedByUser(trove: Trove, timestamp: number, status: string): void {
  trove.status = status;
  trove.lastUserActionAt = timestamp;
  trove.redemptionCount = 0;
  trove.redeemedColl = BigInt(0).toString();
  trove.redeemedDebt = BigInt(0).toString();
}

// see Operation enum in contracts
//
const OP_OPEN_TROVE = 'OpenTrove';
const OP_CLOSE_TROVE = 'CloseTrove';
const OP_ADJUST_TROVE = 'AdjustTrove';
const OP_ADJUST_TROVE_INTEREST_RATE = 'AdjustTroveInterestRate';
const OP_APPLY_PENDING_DEBT = 'ApplyPendingDebt';
const OP_LIQUIDATE = 'Liquidate';
const OP_REDEEM_COLLATERAL = 'RedeemCollateral';
const OP_OPEN_TROVE_AND_JOIN_BATCH = 'OpenTroveAndJoinBatch';
const OP_SET_INTEREST_BATCH_MANAGER = 'SetInterestBatchManager';
const OP_REMOVE_FROM_BATCH = 'RemoveFromBatch';

const FLASH_LOAN_TOPIC = 'TODO'; // TODO: should be the hash of the flash loan event

export function createTroveOperationHandler(context: Context): starknet.Writer {
  return async ({ block, event, rawEvent }) => {
    if (!block || !event || !rawEvent) return;
    const operation: string = new CairoCustomEnum(event.operation.variant).activeVariant();

    const indexerName = context.indexerName;
    const provider = context.provider;

    const timestamp = block.timestamp;
    const troveId = event.trove_id;

    const troveManagerEventsEmitterAddress = toHexAddress(rawEvent.from_address);
    const collId = (
      await TroveManagerEventsEmitter.loadEntity(troveManagerEventsEmitterAddress, indexerName)
    ).collId;

    const collateral = await Collateral.loadEntity(collId, indexerName);

    if (!collateral) {
      throw new Error(`Collateral not found: ${collId}`);
    }

    const tmAddress = (await CollateralAddresses.loadEntity(collId, indexerName)).troveManager;
    const tm = new Contract(TroveManagerAbi, tmAddress, provider);
    let trove: Trove | null = null;

    if (operation === OP_OPEN_TROVE) {
      trove = await updateTrove(
        collateral,
        tm,
        troveId,
        timestamp,
        getLeverageUpdate(event),
        true,
        context
      );
      return;
    }

    if (operation === OP_ADJUST_TROVE) {
      trove = await updateTrove(
        collateral,
        tm,
        troveId,
        timestamp,
        getLeverageUpdate(event),
        false,
        context
      );
      touchedByUser(trove, timestamp, 'active');
      await trove.save();
      return;
    }

    if (operation === OP_APPLY_PENDING_DEBT) {
      await updateTrove(
        collateral,
        tm,
        troveId,
        timestamp,
        LeverageUpdate.unchanged,
        false,
        context
      );
      return;
    }

    if (operation === OP_OPEN_TROVE_AND_JOIN_BATCH) {
      await updateTrove(
        collateral,
        tm,
        troveId,
        timestamp,
        getLeverageUpdate(event),
        true,
        context
      );
      const batchManager = await tm.get_trove(troveId).interest_batch_manager;
      await enterBatch(collId, troveId, timestamp, batchManager, indexerName);
      return;
    }

    if (operation === OP_ADJUST_TROVE_INTEREST_RATE) {
      trove = await updateTrove(
        collateral,
        tm,
        troveId,
        timestamp,
        getLeverageUpdate(event),
        false,
        context
      );
      touchedByUser(trove, timestamp, 'active');
      await trove.save();
      return;
    }

    if (operation === OP_SET_INTEREST_BATCH_MANAGER) {
      const batchManager = await tm.get_trove(troveId).interest_batch_manager;
      trove = await enterBatch(collId, troveId, timestamp, batchManager, indexerName);
      touchedByUser(trove, timestamp, 'active');
      await trove.save();
      return;
    }

    if (operation === OP_REMOVE_FROM_BATCH) {
      trove = await leaveBatch(collId, troveId, timestamp, event.annualInterestRate, indexerName);
      touchedByUser(trove, timestamp, 'active');
      await trove.save();
      return;
    }

    if (operation === OP_REDEEM_COLLATERAL) {
      trove = await updateTrove(
        collateral,
        tm,
        troveId,
        timestamp,
        LeverageUpdate.unchanged,
        false,
        context
      );
      trove.status = 'redeemed';
      trove.redemptionCount += 1;
      trove.redeemedColl = (
        BigInt(trove.redeemedColl) - BigInt(event.coll_change_from_operation)
      ).toString();
      trove.redeemedDebt = (
        BigInt(trove.redeemedDebt) - BigInt(event.debt_change_from_operation)
      ).toString();
      await trove.save();
      return;
    }

    if (operation === OP_CLOSE_TROVE) {
      trove = await updateTrove(
        collateral,
        tm,
        troveId,
        timestamp,
        LeverageUpdate.unchanged,
        false,
        context
      );
      if (trove.interestBatch !== null) {
        await leaveBatch(collId, troveId, timestamp, BigInt(0), indexerName);
      }

      await updateBorrowerTrovesCount(
        BorrowerTrovesCountUpdate.remove,
        trove.borrower,
        collateral.collIndex,
        indexerName
      );

      trove.closedAt = timestamp;
      touchedByUser(trove, timestamp, 'closed');
      await trove.save();
      return;
    }

    if (operation === OP_LIQUIDATE) {
      trove = await updateTrove(
        collateral,
        tm,
        troveId,
        timestamp,
        LeverageUpdate.unchanged,
        false,
        context
      );
      if (trove.interestBatch !== null) {
        await leaveBatch(collId, troveId, timestamp, BigInt(0), indexerName);
      }

      trove.debt = event.debt_increase_from_redist;
      trove.deposit = event.coll_increase_from_redist;
      trove.closedAt = timestamp;
      trove.status = 'liquidated';
      await trove.save();
      return;
    }

    throw new Error(`Unsupported operation: ${operation.toString()}`);
  };
}

async function createTrove(
  collateral: Collateral,
  troveId: bigint,
  debt: bigint,
  deposit: bigint,
  stake: bigint,
  interestRate: bigint,
  timestamp: number,
  mightBeLeveraged: boolean,
  ctx: Context
): Promise<Trove> {
  const collId = collateral.collIndex.toString();
  const troveFullId = `${collId}:${toHexAddress(troveId)}`;

  let trove = await Trove.loadEntity(troveFullId, ctx.indexerName);
  // Trove might should already have been created by the transfer handler

  // create trove
  trove = new Trove(troveFullId, ctx.indexerName);
  trove.borrower = toHexAddress(0);
  trove.previousOwner = toHexAddress(0);
  trove.collateral = collId;
  trove.createdAt = timestamp;
  trove.debt = debt.toString();
  trove.deposit = deposit.toString();
  trove.stake = stake.toString();
  trove.status = 'active';
  trove.troveId = toHexAddress(troveId);
  trove.updatedAt = timestamp;
  trove.lastUserActionAt = timestamp;
  trove.redemptionCount = 0;
  trove.redeemedColl = BigInt(0).toString();
  trove.redeemedDebt = BigInt(0).toString();

  // We leave out .borrower and .previousOwner as they are set by the transfer handler

  // batches are handled separately, not
  // when creating the trove but right after
  trove.interestRate = interestRate.toString();
  trove.interestBatch = null;
  trove.mightBeLeveraged = mightBeLeveraged;

  await trove.save();

  return trove;
}

// When a trove gets updated (either on TroveUpdated or BatchedTroveUpdated):
//  1. update the collateral (branch) total deposited & debt
//  2. create the trove entity if it doesn't exist
//  3. create the borrower entity if it doesn't exist
//  4. update the borrower's total trove count & trove count by collateral (branch)
//  5. for non-batched troves, update the prev & current interest rate brackets
//  6. update the trove's deposit, debt & stake
async function updateTrove(
  collateral: Collateral,
  troveManagerContract: Contract,
  troveId: bigint,
  timestamp: number,
  leverageUpdate: LeverageUpdate,
  createIfMissing: boolean,
  ctx: Context
): Promise<Trove> {
  const collId = collateral.id.toString();

  const troveFullId = `${collId}:${toHexAddress(troveId)}`;
  const trove = await Trove.loadEntity(troveFullId, ctx.indexerName);

  const prevDebt = trove ? BigInt(trove.debt) : BigInt(0);
  const prevInterestRate = trove ? BigInt(trove.interestRate) : BigInt(0);

  const troveData = await troveManagerContract.get_latest_trove_data(troveId);
  const newDebt = troveData.entire_debt;
  const newDeposit = troveData.entire_coll;
  const newInterestRate = troveData.annual_interest_rate;
  const newStake = (await troveManagerContract.get_trove(troveId)).stake;

  await collateral.save();

  // create trove if needed
  if (!trove) {
    if (!createIfMissing) {
      throw new Error(`Trove not found: ${troveFullId}`);
    }
    const trove = await createTrove(
      collateral,
      troveId,
      newDebt,
      newDeposit,
      newStake,
      newInterestRate,
      timestamp,
      leverageUpdate === LeverageUpdate.yes,
      ctx
    );

    // update interest rate brackets (no need to check if the trove
    // is in a batch as this is done after calling updateTrove())
    await updateRateBracketDebt(
      collId,
      prevInterestRate,
      newInterestRate,
      prevDebt,
      newDebt,
      ctx.indexerName
    );
    return trove;
  }

  // update interest rate brackets for non-batched troves
  if (trove.interestBatch === null) {
    await updateRateBracketDebt(
      collId,
      BigInt(prevInterestRate),
      newInterestRate,
      BigInt(prevDebt),
      newDebt,
      ctx.indexerName
    );
  }

  trove.debt = newDebt;
  trove.deposit = newDeposit;
  trove.interestRate = trove.interestBatch === null ? newInterestRate : BigInt(0);
  trove.stake = newStake;

  if (leverageUpdate !== LeverageUpdate.unchanged) {
    trove.mightBeLeveraged = leverageUpdate === LeverageUpdate.yes;
  }

  trove.updatedAt = timestamp;
  await trove.save();

  return trove;
}

function getLeverageUpdate(event: starknet.ParsedEvent): LeverageUpdate {
  const receipt = event.receipt;
  const logs = receipt ? receipt.logs : [];
  for (let i = 0; i < logs.length; i++) {
    if (logs[i].topics[0].equals(FLASH_LOAN_TOPIC)) {
      return LeverageUpdate.yes;
    }
  }
  return LeverageUpdate.no;
}

// When a trove leaves a batch:
//  1. remove the interest batch on the trove
//  2. set the interest rate to the new rate
//  3. add its debt to the rate bracket of the current rate
async function leaveBatch(
  collId: string,
  troveId: bigint,
  timestamp: number,
  interestRate: bigint,
  indexerName: string
): Promise<Trove> {
  const troveFullId = `${collId}:${toHexAddress(troveId)}`;

  const trove = await Trove.loadEntity(troveFullId, indexerName);
  if (trove === null) {
    throw new Error(`Trove not found: ${troveFullId}`);
  }

  if (trove.interestBatch === null) {
    throw new Error(`Trove is not in a batch: ${troveFullId}`);
  }

  await updateRateBracketDebt(
    collId,
    BigInt(0), // coming from rate 0 (in batch)
    interestRate,
    BigInt(0), // debt was 0 too (in batch)
    BigInt(trove.debt),
    indexerName
  );

  trove.interestBatch = null;
  trove.interestRate = interestRate.toString();
  trove.status = 'active'; // always reset the status when leaving a batch
  trove.updatedAt = timestamp;
  await trove.save();

  return trove;
}

async function updateRateBracketDebt(
  collId: string,
  prevRate: bigint | null,
  newRate: bigint,
  prevDebt: bigint,
  newDebt: bigint,
  indexerName: string
): Promise<void> {
  const prevRateFloored = prevRate ? getRateFloored(prevRate) : null;
  const newRateFloored = getRateFloored(newRate);

  // remove debt from prev bracket
  if (prevRateFloored !== null) {
    const prevRateBracket = await InterestRateBracket.loadEntity(
      `${collId}:${prevRateFloored.toString()}`,
      indexerName
    );
    if (prevRateBracket) {
      prevRateBracket.totalDebt = (BigInt(prevRateBracket.totalDebt) - prevDebt).toString();
      await prevRateBracket.save();
    }
  }

  // add debt to new bracket
  const newRateBracket = await loadOrCreateInterestRateBracket(collId, newRateFloored, indexerName);
  newRateBracket.totalDebt = (BigInt(newRateBracket.totalDebt) + newDebt).toString();
  // newRateBracket.totalDebt = newDebt.toString(); TODO check
  await newRateBracket.save();
}

async function loadOrCreateInterestRateBracket(
  collId: string,
  rateFloored: bigint,
  indexerName: string
): Promise<InterestRateBracket> {
  const rateBracketId = `${collId}:${rateFloored.toString()}`;
  let rateBracket = await InterestRateBracket.loadEntity(rateBracketId, indexerName);

  if (!rateBracket) {
    rateBracket = new InterestRateBracket(rateBracketId, indexerName);
    rateBracket.collateral = collId;
    rateBracket.rate = rateFloored.toString();
    rateBracket.totalDebt = BigInt(0).toString();
  }

  return rateBracket;
}

function floorToDecimals(value: bigint, decimals: number): bigint {
  const factor = BigInt(10) ** BigInt(18 - decimals);
  return (value / factor) * factor;
}

function getRateFloored(rate: bigint): bigint {
  return floorToDecimals(rate, 3);
}

// When a trove enters a batch:
//  1. set the interest batch on the trove
//  2. set the interest rate to 0 (indicating that the trove is in a batch)
//  3. remove its debt from its rate bracket (handled at the batch level)
async function enterBatch(
  collId: string,
  troveId: bigint,
  timestamp: number,
  batchManager: string,
  indexerName: string
): Promise<Trove> {
  const troveFullId = `${collId}:${toHexAddress(troveId)}`;
  const batchId = `${collId}:${batchManager}`;

  const trove = await Trove.loadEntity(troveFullId, indexerName);
  if (trove === null) {
    throw new Error(`Trove not found: ${troveFullId}`);
  }

  await updateRateBracketDebt(
    collId,
    BigInt(trove.interestRate),
    BigInt(0), // moving rate to 0 (in batch)
    BigInt(trove.debt),
    BigInt(0), // debt is 0 too (handled at the batch level)
    indexerName
  );

  trove.interestBatch = batchId;
  trove.interestRate = BigInt(0).toString();
  trove.updatedAt = timestamp;
  await trove.save();

  return trove;
}

// when a batch gets updated:
//  1. if needed, remove the debt from the previous rate bracket
//  2. update the total debt on the current rate bracket
//  3. update the batch, creating it if needed
export function createBatchUpdatedHandler(ctx: Context): starknet.Writer {
  return async ({ block, event, rawEvent }) => {
    if (!block || !event) return;

    const indexerName = ctx.indexerName;

    const troveManagerEventsEmitterAddress = toHexAddress(rawEvent.from_address);
    const collId = (
      await TroveManagerEventsEmitter.loadEntity(troveManagerEventsEmitterAddress, indexerName)
    ).collId;

    const batchId = `${collId}:${event.interest_batch_manager}`;
    let batch = await InterestBatch.loadEntity(batchId, indexerName);

    const prevRate = batch ? batch.annualInterestRate : null;
    const newRate = event.annual_interest_rate;

    const prevDebt = batch ? batch.debt : BigInt(0);
    const newDebt = event.debt;

    await updateRateBracketDebt(
      collId,
      BigInt(prevRate),
      BigInt(newRate),
      BigInt(prevDebt),
      BigInt(newDebt),
      indexerName
    );

    // update batch
    if (!batch) {
      batch = new InterestBatch(batchId, indexerName);
      batch.collateral = collId;
      batch.batchManager = event.interest_batch_manager;
    }

    batch.collateral = collId;
    batch.batchManager = event.interest_batch_manager;
    batch.debt = newDebt;
    batch.coll = event.coll;
    batch.annualInterestRate = event.annual_interest_rate;
    batch.annualManagementFee = event.annual_management_fee;
    await batch.save();
  };
}
