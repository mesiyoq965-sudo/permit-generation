import { BigNumber, Contract, ethers, utils } from "ethers";
import { Context, Logger } from "../types/context";
import { TransferResult, TokenType } from "../types/permits";
import { decrypt, parseDecryptedPrivateKey } from "../utils";
import { getRpcProvider } from "../utils/get-fastest-provider";

const DEFAULT_OPERATOR_FEE_ADDRESS = "0xEF00395E555F71e8e274d57aC439F1bB1AaC1A89"; // ubq.eth resolver

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) public returns (bool)",
  "function decimals() public view returns (uint8)",
  "function balanceOf(address account) public view returns (uint256)",
];

export interface TransferRequest {
  username: string;
  amount: number;
  tokenAddress: string;
  userId: number;
  issueNodeId: string;
}

export async function transferErc20(
  context: Context,
  request: TransferRequest,
  operatorFeePercent: number,
  operatorFeeAddress: string
): Promise<TransferResult> {
  const { logger, adapters, config, octokit } = context;
  const { username, amount, tokenAddress, userId, issueNodeId } = request;
  const { evmNetworkId, evmPrivateEncrypted } = config;

  const provider = await getRpcProvider(evmNetworkId);
  if (!provider) {
    throw new Error("Provider is not defined");
  }

  const privateKey = await getPrivateKey(evmPrivateEncrypted, logger);
  const adminWallet = new ethers.Wallet(privateKey, provider);
  const tokenDecimals = await getTokenDecimals(tokenAddress, provider, logger);

  const { wallet } = adapters.supabase;
  const beneficiaryAddress = await wallet.getWalletByUserId(userId);

  if (!beneficiaryAddress) {
    throw new Error(`Wallet not found for user: ${username}`);
  }

  const parsedAmount = BigNumber.from(utils.parseUnits(amount.toString(), tokenDecimals));
  const operatorFee = parsedAmount.mul(Math.floor(operatorFeePercent * 100)).div(10000);
  const amountAfterFee = parsedAmount.sub(operatorFee);

  const tokenContract = new Contract(tokenAddress, ERC20_ABI, adminWallet);

  const signerBalance: BigNumber = await tokenContract.balanceOf(adminWallet.address);
  if (signerBalance.lt(parsedAmount)) {
    throw new Error(`Insufficient balance. Required: ${parsedAmount}, Available: ${signerBalance}`);
  }

  let transferTx;
  try {
    logger.info(`Executing ERC20 transfer to ${beneficiaryAddress}, amount: ${amountAfterFee}`);
    transferTx = await tokenContract.transfer(beneficiaryAddress, amountAfterFee, {
      gasLimit: 100000,
    });
  } catch (error) {
    logger.error(`Failed to execute transfer: ${error}`);
    throw error;
  }

  const receipt = await Promise.race([
    transferTx.wait(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Transfer confirmation timeout (120s)")), 120_000)
    ),
  ]);

  logger.info(`Transfer confirmed in block ${receipt.blockNumber}, tx: ${receipt.transactionHash}`);

  let operatorTransferTx;
  if (operatorFee.gt(0) && operatorFeeAddress !== adminWallet.address) {
    logger.info(`Transferring operator fee ${operatorFee} to ${operatorFeeAddress}`);
    operatorTransferTx = await tokenContract.transfer(operatorFeeAddress, operatorFee, {
      gasLimit: 100000,
    });
    await Promise.race([
      operatorTransferTx.wait(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Operator fee transfer confirmation timeout (120s)")), 120_000)
      ),
    ]);
  }

  const result: TransferResult = {
    tokenType: TokenType.ERC20,
    tokenAddress,
    beneficiary: beneficiaryAddress,
    amount: amountAfterFee.toString(),
    operatorFee: operatorFee.toString(),
    networkId: evmNetworkId,
    transactionHash: receipt.transactionHash,
    sender: adminWallet.address,
  };

  logger.info("Automatic transfer completed", result);
  return result;
}

async function getPrivateKey(evmPrivateEncrypted: string, logger: Logger): Promise<string> {
  try {
    const privateKeyDecrypted = await decrypt(evmPrivateEncrypted, String(process.env.X25519_PRIVATE_KEY));
    const privateKeyParsed = parseDecryptedPrivateKey(privateKeyDecrypted);
    const privateKey = privateKeyParsed.privateKey;
    if (!privateKey) throw new Error("Private key is not defined");
    return privateKey;
  } catch (error) {
    const errorMessage = `Failed to decrypt a private key: ${error}`;
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }
}

async function getTokenDecimals(tokenAddress: string, provider: ethers.providers.Provider, logger: Logger): Promise<number> {
  try {
    const tokenContract = new Contract(tokenAddress, ERC20_ABI, provider);
    return await tokenContract.decimals();
  } catch (error) {
    const errorMessage = `Failed to get token decimals for token: ${tokenAddress}, ${error}`;
    logger.debug(errorMessage, { error });
    throw new Error(errorMessage);
  }
}
