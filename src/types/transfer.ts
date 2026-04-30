import { Type as T } from "@sinclair/typebox";
import { StaticDecode } from "@sinclair/typebox";

// Transfer settings schema - controls automatic transfer behavior
export const transferSettingsSchema = T.Object({
  transfer: T.Optional(T.Boolean()), // Enable/disable automatic transfers
  operatorFeePercent: T.Optional(T.Number()), // Fee percentage for @ubiquity operator (e.g., 5 = 5%)
  ubqAddress: T.Optional(T.String()), // Ubiquity Dollars address for operator fees
});

// Extended permit generation settings with transfer option
export const permitGenerationSettingsWithTransferSchema = T.Object({
  evmNetworkId: T.Number(),
  evmPrivateEncrypted: T.String(),
  permitRequests: T.Array(
    T.Object({
      type: T.Union([T.Literal("ERC20"), T.Literal("ERC721")]),
      username: T.String(),
      amount: T.Number(),
      contributionType: T.String(),
      tokenAddress: T.String(),
    })
  ),
  // Transfer settings
  transfer: T.Optional(T.Boolean()),
  operatorFeePercent: T.Optional(T.Number()),
  ubqAddress: T.Optional(T.String()),
});

export type TransferSettings = StaticDecode<typeof transferSettingsSchema>;
export type PermitGenerationSettingsWithTransfer = StaticDecode<typeof permitGenerationSettingsWithTransferSchema>;

// Transfer result interface
export interface TransferResult {
  success: boolean;
  txHash?: string;
  beneficiary: string;
  amount: string;
  error?: string;
}

// Transfer summary for multiple beneficiaries
export interface TransferSummary {
  totalTransfers: number;
  successfulTransfers: number;
  failedTransfers: number;
  results: TransferResult[];
  totalGasEstimate?: string;
  operatorFee?: string;
}