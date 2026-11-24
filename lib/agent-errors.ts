/** A known, user-facing failure from an agent tool: REST sends `status`, MCP sends `code` and the message. */
export class AgentDataError extends Error {
  constructor(
    message: string,
    public readonly code = "data_error",
    public readonly status = 400,
  ) {
    super(message);
    this.name = "AgentDataError";
  }
}

/**
 * A tool, or an argument, the account's plan does not include (lib/agent-tiers.ts). It is one tool's error, not a
 * refused session: over MCP the model gets the code, a sentence to pass on and where to upgrade, and the free tools
 * keep working. REST answers 403 with the same body.
 */
export class AgentPlanError extends AgentDataError {
  constructor(
    message: string,
    public readonly upgradeUrl: string,
  ) {
    super(message, "pro_required", 403);
    this.name = "AgentPlanError";
  }
}
