import { EmitterWebhookEvent as WebhookEvent, EmitterWebhookEventName as WebhookEventName } from "@octokit/webhooks";
import { SupportedEvents } from "./context";
import { StaticDecode, Type as T } from "@sinclair/typebox";

export interface PluginInputs<T extends WebhookEventName = SupportedEvents> {
  stateId: string;
  eventName: T;
  eventPayload: WebhookEvent<T>["payload"];
  settings: PermitGenerationSettings;
  authToken: string;
  ref: string;
}

export const permitRequestSchema = T.Object({
  type: T.Union([T.Literal("ERC20"), T.Literal("ERC721")]),
  username: T.String(),
  amount: T.Number(),
  contributionType: T.String(),
  tokenAddress: T.String(),
});

export type PermitRequest = StaticDecode<typeof permitRequestSchema>;

export const permitGenerationSettingsSchema = T.Object({
  evmNetworkId: T.Number(),
  evmPrivateEncrypted: T.String(),
  permitRequests: T.Array(permitRequestSchema),
  /**
   * If true, automatically transfer funds to the beneficiary after generating the permit.
   */
  transfer: T.Optional(T.Boolean()),
  /**
   * Optional operator fee percentage (0-100) deducted from each transfer.
   */
  operatorFeePercent: T.Optional(T.Number({ minimum: 0, maximum: 100 })),
});

export type PermitGenerationSettings = StaticDecode<typeof permitGenerationSettingsSchema>;
