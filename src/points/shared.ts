import { EkuboPosition, StabilityPoolPosition, User, VesuPosition } from '../../.checkpoint/models';
import * as weightsConfig from './weights.config.json';

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

// Helper function to get weight for a position by address
export function getWeightByAddress(address: string): bigint {
  const position = weightsConfig.positions[address];
  if (!position || !position.weight) {
    throw new Error(`Weight not found for address: ${address}`);
  }
  return BigInt(Math.floor(position.weight));
}

// Update users's totals and positions' rates
export async function updateUserPointsAndTotals(
  userEntity: User,
  timestamp: number,
  indexerName: string
) {
  let totalPoints = BigInt(0);
  let totalValue = BigInt(0);
  let totalRate = BigInt(0);

  // Update all stability pool positions
  for (const position of userEntity.stabilityPoolPositions) {
    const stabilityPoolPosition = await StabilityPoolPosition.loadEntity(position, indexerName);
    if (!stabilityPoolPosition) {
      throw new Error(`Stability pool position not found for address: ${position}`);
    }
    // Update Rates:
    const weight = getWeightByAddress(stabilityPoolPosition.poolAddress);
    const newRate = BigInt(stabilityPoolPosition.value) * weight;

    stabilityPoolPosition.earningRate = newRate.toString();
    const timeDiff = timestamp - stabilityPoolPosition.lastUpdateTime;

    // If SP just got updated, timeDiff will be 0, so pointsEarned will be 0
    const pointsEarnedSinceLastUpdate =
      BigInt(stabilityPoolPosition.earningRate) * BigInt(timeDiff);
    console.log('pointsEarnedSinceLastUpdate 2:', pointsEarnedSinceLastUpdate);
    stabilityPoolPosition.pointsEarned = (
      BigInt(stabilityPoolPosition.pointsEarned) + pointsEarnedSinceLastUpdate
    ).toString();
    stabilityPoolPosition.lastUpdateTime = timestamp;

    // Update totals
    totalPoints += BigInt(stabilityPoolPosition.pointsEarned);
    totalValue += BigInt(stabilityPoolPosition.value);
    totalRate += BigInt(stabilityPoolPosition.earningRate);

    await stabilityPoolPosition.save();
  }

  // Update all ekubo positions
  for (const position of userEntity.ekuboPositions) {
    const ekuboPosition = await EkuboPosition.loadEntity(position, indexerName);
    // Get weight by pool address
    const weight = getWeightByAddress(ekuboPosition.poolAddress);

    const newRate = BigInt(ekuboPosition.value) * weight;
    ekuboPosition.earningRate = newRate.toString();
    const pointEarned =
      BigInt(ekuboPosition.earningRate) * BigInt(timestamp - ekuboPosition.lastUpdateTime); // Will be 0 if lastUpdateTime is 0
    ekuboPosition.pointsEarned = (BigInt(ekuboPosition.pointsEarned || 0) + pointEarned).toString();
    ekuboPosition.lastUpdateTime = timestamp;
    await ekuboPosition.save();

    totalPoints += BigInt(ekuboPosition.pointsEarned);
    totalValue += BigInt(ekuboPosition.value);
    totalRate += BigInt(ekuboPosition.earningRate);
  }

  // Update all vesu positions
  for (const position of userEntity.vesuPositions) {
    const vesuPosition = await VesuPosition.loadEntity(position, indexerName);
    // Get weight by market address
    // Note: You may need to handle different weights for deposits vs borrows
    const weight = getWeightByAddress(vesuPosition.market);

    const newRate = BigInt(vesuPosition.value) * weight;
    vesuPosition.earningRate = newRate.toString();
    const pointEarned =
      BigInt(vesuPosition.earningRate) * BigInt(timestamp - vesuPosition.lastUpdateTime); // Will be 0 if lastUpdateTime is 0
    vesuPosition.pointsEarned = (BigInt(vesuPosition.pointsEarned || 0) + pointEarned).toString();
    vesuPosition.lastUpdateTime = timestamp;
    await vesuPosition.save();

    totalPoints += BigInt(vesuPosition.pointsEarned);
    totalValue += BigInt(vesuPosition.value);
    totalRate += BigInt(vesuPosition.earningRate);
  }

  // Finally, update points, last update time, total rate, and total value
  userEntity.totalPoints = totalPoints.toString();
  userEntity.totalValue = totalValue.toString();
  userEntity.totalRate = totalRate.toString();
  userEntity.lastUpdateTime = timestamp;
  await userEntity.save();
}
