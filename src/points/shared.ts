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
  // Try the address as-is first
  let position = weightsConfig.positions[address];

  if (!position || !position.weight) {
    // Try removing leading zeros after 0x prefix
    let modifiedAddress = address;

    // Try up to 6 times to remove leading zeros
    for (let i = 0; i < 6; i++) {
      // Remove one leading zero after 0x if it exists
      if (modifiedAddress.startsWith('0x0')) {
        modifiedAddress = `0x${modifiedAddress.slice(3)}`;
        position = weightsConfig.positions[modifiedAddress];

        if (position && position.weight) {
          return BigInt(Math.floor(position.weight * 1e18));
        }
      } else {
        break; // No more leading zeros to remove
      }
    }

    // If still not found, try adding leading zeros (in case config has more padding)
    modifiedAddress = address;
    for (let i = 0; i < 6; i++) {
      // Add one leading zero after 0x
      modifiedAddress = `0x0${modifiedAddress.slice(2)}`;
      position = weightsConfig.positions[modifiedAddress];

      if (position && position.weight) {
        // Scale weight by 1e18 to preserve precision for small values
        return BigInt(Math.floor(position.weight * 1e18));
      }
    }

    throw new Error(`Weight not found for address: ${address} (tried multiple padding variations)`);
  }

  console.log('position.weight: ', position.weight);
  // Scale weight by 1e18 to preserve precision for small values
  return BigInt(Math.floor(position.weight * 1e18));
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
    const newRate = (BigInt(stabilityPoolPosition.value) * weight) / BigInt(1e18);

    stabilityPoolPosition.earningRate = newRate.toString();
    const timeDiff = timestamp - stabilityPoolPosition.lastUpdateTime;

    // If SP just got updated, timeDiff will be 0, so pointsEarned will be 0
    const pointsEarnedSinceLastUpdate =
      BigInt(stabilityPoolPosition.earningRate) * BigInt(timeDiff);
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

    const newRate = (BigInt(ekuboPosition.value) * weight) / BigInt(1e18);
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

    const newRate = (BigInt(vesuPosition.value) * weight) / BigInt(1e18);
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
