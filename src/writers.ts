import { createTroveOperationHandler, createBatchUpdatedHandler } from './TroveManager';
import { createTransferHandler } from './TroveNFT';
import { createCollateralRegistryAddressChangedHandler } from './USDU';
import { createTroveUpdatedHandler } from './TroveManager';
import { createBatchedTroveUpdatedHandler } from './TroveManager';
import { Context } from './index';

export function createStarknetWriters(context: Context) {
  const handleTroveOperation = createTroveOperationHandler(context);
  const handleCollateralRegistryAddressChanged =
    createCollateralRegistryAddressChangedHandler(context);
  const handleTransfer = createTransferHandler(context);
  const handleBatchUpdated = createBatchUpdatedHandler(context);
  const handleTroveUpdated = createTroveUpdatedHandler(context);
  const handleBatchedTroveUpdated = createBatchedTroveUpdatedHandler(context);

  return {
    handleTroveOperation,
    handleCollateralRegistryAddressChanged,
    handleTransfer,
    handleBatchUpdated,
    handleTroveUpdated,
    handleBatchedTroveUpdated
  };
}
