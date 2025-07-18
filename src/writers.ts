import { createTroveOperationHandler, createBatchUpdatedHandler } from './TroveManager';
import { createTransferHandler } from './TroveNFT';
import { createCollateralRegistryAddressChangedHandler } from './USDU';
import { Context } from './index';

export function createStarknetWriters(context: Context) {
  const handleTroveOperation = createTroveOperationHandler(context);
  const handleCollateralRegistryAddressChanged =
    createCollateralRegistryAddressChangedHandler(context);
  const handleTransfer = createTransferHandler(context);
  const handleBatchUpdated = createBatchUpdatedHandler(context);

  return {
    handleTroveOperation,
    handleCollateralRegistryAddressChanged,
    handleTransfer,
    handleBatchUpdated
  };
}
