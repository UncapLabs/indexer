import { starknet } from '@snapshot-labs/checkpoint';
import { updateUserPointsAndTotals } from './shared';
import { StabilityPoolPosition, User } from '../../.checkpoint/models';
import { Context } from '../index';
import { toHexAddress } from './shared';
import { CairoCustomEnum } from 'starknet';

const OP_PROVIDE_TO_SP = 'provide_to_sp';
const OP_WITHDRAW_FROM_SP = 'withdraw_from_sp';
const OP_CLAIM_ALL_COLL_GAINS = 'claim_all_coll_gains';

// Updates the position's value, points earned, and stashed coll.
async function handleProvideToSP(
  stabilityPoolPosition: StabilityPoolPosition | null,
  user: string,
  userEntity: User,
  spAddress: string,
  topUpOrWithdrawal: bigint,
  yieldGain: bigint,
  yieldGainClaimed: bigint,
  depositLoss: bigint,
  colGainSinceLastOperation: bigint,
  colGainClaimed: bigint,
  timestamp: bigint,
  indexerName: string
): Promise<StabilityPoolPosition> {
  if (!stabilityPoolPosition) {
    // Create position since it doesn't exist
    const stabilityPoolPositionId = `${user}-${spAddress}`;
    stabilityPoolPosition = new StabilityPoolPosition(stabilityPoolPositionId, indexerName);
    stabilityPoolPosition.user = user;
    stabilityPoolPosition.value = topUpOrWithdrawal.toString();
    stabilityPoolPosition.pointsEarned = '0';
    stabilityPoolPosition.stashedColl = '0';
    stabilityPoolPosition.poolAddress = spAddress;
  } else {
    // Update existing position
    const pointsEarnedSinceLastUpdate =
      BigInt(stabilityPoolPosition.earningRate) *
      (timestamp - BigInt(stabilityPoolPosition.lastUpdateTime));

    stabilityPoolPosition.pointsEarned = (
      BigInt(stabilityPoolPosition.pointsEarned) + pointsEarnedSinceLastUpdate
    ).toString();

    const newStashedColl =
      BigInt(stabilityPoolPosition.stashedColl) + colGainSinceLastOperation - colGainClaimed;
    stabilityPoolPosition.stashedColl = newStashedColl.toString();

    const balanceChange = topUpOrWithdrawal + (yieldGain - yieldGainClaimed) - depositLoss;
    stabilityPoolPosition.value = (BigInt(stabilityPoolPosition.value) + balanceChange).toString();
  }
  return stabilityPoolPosition;
}

async function handleWithdrawFromSP(
  stabilityPoolPosition: StabilityPoolPosition | null,
  user: string,
  userEntity: User,
  topUpOrWithdrawal: bigint,
  yieldGain: bigint,
  yieldGainClaimed: bigint,
  depositLoss: bigint,
  colGainSinceLastOperation: bigint,
  colGainClaimed: bigint,
  timestamp: bigint
): Promise<StabilityPoolPosition> {
  if (!stabilityPoolPosition) {
    throw new Error(`Stability pool position not found for user: ${user}`);
  }

  const earned =
    BigInt(stabilityPoolPosition.earningRate) * (timestamp - BigInt(userEntity.lastUpdateTime));
  stabilityPoolPosition.pointsEarned = (
    BigInt(stabilityPoolPosition.pointsEarned) + earned
  ).toString();

  if (topUpOrWithdrawal > 0n) {
    console.log('Withdrawal is positive, converting to negative');
    topUpOrWithdrawal = -topUpOrWithdrawal;
  }

  const newStashedColl =
    BigInt(stabilityPoolPosition.stashedColl) + colGainSinceLastOperation - colGainClaimed;
  stabilityPoolPosition.stashedColl = newStashedColl.toString();

  const balanceChange = topUpOrWithdrawal + depositLoss - (yieldGain - yieldGainClaimed);

  if (balanceChange > BigInt(stabilityPoolPosition.value)) {
    throw new Error(
      `Stability pool balance change is greater than the position value: ${balanceChange} > ${stabilityPoolPosition.value}`
    );
  }

  stabilityPoolPosition.value = (BigInt(stabilityPoolPosition.value) - balanceChange).toString();

  return stabilityPoolPosition;
}

async function handleClaimAllCollGains(
  stabilityPoolPosition: StabilityPoolPosition | null,
  user: string
): Promise<StabilityPoolPosition> {
  if (!stabilityPoolPosition) {
    throw new Error(`Stability pool position not found for user: ${user}`);
  }
  stabilityPoolPosition.value = '0'; // Must be 0 to call this function
  stabilityPoolPosition.stashedColl = '0'; // All stashed coll is claimed
  return stabilityPoolPosition;
}

export function createStabilityPoolOperationHandler(context: Context): starknet.Writer {
  return async ({ block, event, rawEvent }) => {
    if (!block || !event || !rawEvent) return;

    // Parse DepositOperation event (used both for deposit and withdrawal)
    const user = toHexAddress(event.depositor);
    const spAddress = toHexAddress(rawEvent.from_address);
    const operation: string = new CairoCustomEnum(event.operation.variant).activeVariant();
    const yieldGain = BigInt(event.yield_gain_since_last_operation);
    const yieldGainClaimed = BigInt(event.yield_gain_claimed);
    const depositLoss = BigInt(event.deposit_loss_since_last_operation);
    const colGainSinceLastOperation = BigInt(event.col_gain_since_last_operation);
    const colGainClaimed = BigInt(event.col_gain_claimed);
    const topUpOrWithdrawal = BigInt(event.top_up_or_withdrawal.abs);

    const indexerName = context.indexerName;

    const timestamp = BigInt(block.timestamp);

    // Load user
    let userEntity = await User.loadEntity(user, indexerName);
    // Create user if doesn't exist, set default values
    if (!userEntity) {
      userEntity = new User(user, indexerName);
      userEntity.totalPoints = '0';
      userEntity.totalValue = '0';
      userEntity.totalRate = '0';
      // We don't save the user now, we save it at the end
    }

    const stabilityPoolPositionId = `${user}-${spAddress}`;
    let stabilityPoolPosition = await StabilityPoolPosition.loadEntity(
      stabilityPoolPositionId,
      indexerName
    );

    // Handle different operations
    if (operation === OP_PROVIDE_TO_SP) {
      stabilityPoolPosition = await handleProvideToSP(
        stabilityPoolPosition,
        user,
        userEntity,
        spAddress,
        topUpOrWithdrawal,
        yieldGain,
        yieldGainClaimed,
        depositLoss,
        colGainSinceLastOperation,
        colGainClaimed,
        timestamp,
        indexerName
      );
    } else if (operation === OP_WITHDRAW_FROM_SP) {
      stabilityPoolPosition = await handleWithdrawFromSP(
        stabilityPoolPosition,
        user,
        userEntity,
        topUpOrWithdrawal,
        yieldGain,
        yieldGainClaimed,
        depositLoss,
        colGainSinceLastOperation,
        colGainClaimed,
        timestamp
      );
    } else if (operation === OP_CLAIM_ALL_COLL_GAINS) {
      stabilityPoolPosition = await handleClaimAllCollGains(stabilityPoolPosition, user);
    } else {
      throw new Error(`Unknown operation: ${operation}`);
    }
    // Update last update time so that points are calculated correctly in the updateUserPointsAndTotals function
    stabilityPoolPosition.lastUpdateTime = Number(timestamp);
    await stabilityPoolPosition.save();

    // Check if position already exists in array before adding
    if (!userEntity.stabilityPoolPositions.includes(stabilityPoolPositionId)) {
      // Create a new array with the position added (in case the array is immutable)
      userEntity.stabilityPoolPositions = [
        ...userEntity.stabilityPoolPositions,
        stabilityPoolPositionId
      ];
    }

    // Update all points and totals
    await updateUserPointsAndTotals(userEntity, Number(timestamp), indexerName);
  };
}
