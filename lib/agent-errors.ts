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
