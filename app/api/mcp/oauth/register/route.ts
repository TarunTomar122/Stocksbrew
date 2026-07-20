import { consumeOAuthRegistrationQuota, OAuthRequestError, registerOAuthClient } from "@/lib/agent-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 32_768) {
      throw new OAuthRequestError("invalid_client_metadata", "Client registration body is too large.", 413);
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new OAuthRequestError("invalid_client_metadata", "Client registration body must be valid JSON.");
    }
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const fingerprint = forwarded || request.headers.get("x-real-ip") || "unknown";
    await consumeOAuthRegistrationQuota(fingerprint);
    const client = await registerOAuthClient(body);
    return Response.json({
      client_id: client.client_id,
      client_id_issued_at: Math.floor(Date.parse(client.created_at) / 1000),
      client_name: client.client_name,
      redirect_uris: client.redirect_uris,
      token_endpoint_auth_method: client.token_endpoint_auth_method,
      grant_types: client.grant_types,
      response_types: client.response_types,
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof OAuthRequestError) {
      return Response.json(
        { error: error.errorCode, error_description: error.message },
        { status: error.status, headers: { "Cache-Control": "no-store" } },
      );
    }
    console.error("agent_oauth_registration_failed", error);
    return Response.json(
      { error: "server_error", error_description: "Client registration failed." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
