import { getCloudflareContext } from "@opennextjs/cloudflare";

export const gatewayId = () => process.env.AI_GATEWAY_ID ?? "default";

/**
 * Calls a third-party model ("openai/gpt-5-mini", "anthropic/claude-haiku-5.5") through the AI binding and AI Gateway.
 * Cloudflare holds the provider credentials and bills the account's Unified Billing credits: no provider API keys.
 * The input is the provider's own request body (Responses API for OpenAI, Messages API for Anthropic), and so is the output.
 */
export async function runGatewayModel<T>(model: string, input: Record<string, unknown>): Promise<T> {
  // A narrow signature: resolving the binding's full overload set for third-party models exhausts the type checker.
  const ai = getCloudflareContext().env.AI as unknown as {
    run(model: string, input: Record<string, unknown>, options: { gateway: { id: string } }): Promise<unknown>;
  };
  return (await ai.run(model, input, { gateway: { id: gatewayId() } })) as T;
}
