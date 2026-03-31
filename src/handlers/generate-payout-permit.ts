import { PermitReward, TransferResult } from "../types";
import { Context } from "../types/context";
import { generateErc20PermitSignature } from "./generate-erc20-permit";
import { generateErc721PermitSignature } from "./generate-erc721-permit";
import { PermitRequest } from "../types/plugin-input";
import { transferErc20 } from "./transfer-erc20";

const DEFAULT_OPERATOR_FEE_PERCENT = 0;
const DEFAULT_OPERATOR_FEE_ADDRESS = "0xEF00395E555F71e8e274d57aC439F1bB1AaC1A89";

export type PayoutResult = PermitReward | TransferResult;

/**
 * Generates a payout permit based on the provided context.
 * If `transfer: true` is set in the config, executes automatic ERC20 transfers instead of generating permits.
 * @param context - The context object containing the configuration and payload.
 * @param permitRequests
 * @returns A Promise that resolves to the generated permit transaction data or transfer results.
 */
export async function generatePayoutPermit(context: Context, permitRequests: PermitRequest[]): Promise<PayoutResult[]> {
  const results: PayoutResult[] = [];
  const shouldTransfer = context.config.transfer ?? false;
  const operatorFeePercent = context.config.operatorFeePercent ?? DEFAULT_OPERATOR_FEE_PERCENT;
  const operatorFeeAddress = context.config.operatorFeeAddress ?? DEFAULT_OPERATOR_FEE_ADDRESS;

  for (const permitRequest of permitRequests) {
    const { type, amount, username, contributionType, tokenAddress } = permitRequest;

    if (shouldTransfer && type === "ERC20") {
      const { data: userData } = await context.octokit.rest.users.getByUsername({ username });
      if (!userData) {
        context.logger.error(`GitHub user was not found for username: ${username}`);
        continue;
      }
      const userId = userData.id;
      let issueNodeId: string;
      if ("issue" in context.payload) {
        issueNodeId = context.payload.issue.node_id;
      } else if ("pull_request" in context.payload) {
        issueNodeId = context.payload.pull_request.node_id;
      } else {
        context.logger.error("Issue Id is missing for transfer");
        continue;
      }

      const transferResult = await transferErc20(
        context,
        { username, amount, tokenAddress, userId, issueNodeId },
        operatorFeePercent,
        operatorFeeAddress
      );
      results.push(transferResult);
    } else if (type === "ERC20") {
      const permit = await generateErc20PermitSignature(context, username, amount, tokenAddress);
      results.push(permit);
    } else if (type === "ERC721") {
      const permit = await generateErc721PermitSignature(context, username, contributionType);
      results.push(permit);
    } else {
      context.logger.error(`Invalid permit type: ${type}`);
      continue;
    }
  }

  return results;
}
