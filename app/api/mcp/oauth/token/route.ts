import {
  exchangeAuthorizationCode,
  exchangeRefreshToken,
  getOAuthClient,
  OAuthRequestError,
} from "@/lib/agent-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function oauthResponse(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", Pragma: "no-cache" } });
}

export async function POST(request: Request) {
  let form: URLSearchParams;
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 16_384) {
      return oauthResponse({ error: "invalid_request", error_description: "Token request body is too large." }, 413);
    }
    form = new URLSearchParams(await request.text());
  } catch {
    return oauthResponse({ error: "invalid_request", error_description: "Invalid token request." }, 400);
  }
  try {
    const clientId = String(form.get("client_id") || "");
    const client = await getOAuthClient(clientId);
    if (!client) throw new OAuthRequestError("invalid_client", "Unknown OAuth client.", 401);
    const grantType = form.get("grant_type");
    if (grantType === "authorization_code") {
      return oauthResponse(await exchangeAuthorizationCode({
        code: String(form.get("code") || ""),
        clientId,
        redirectUri: String(form.get("redirect_uri") || ""),
        codeVerifier: String(form.get("code_verifier") || ""),
        resource: form.get("resource"),
      }));
    }
    if (grantType === "refresh_token") {
      return oauthResponse(await exchangeRefreshToken({
        refreshToken: String(form.get("refresh_token") || ""),
        clientId,
        scope: form.get("scope"),
      }));
    }
    throw new OAuthRequestError("unsupported_grant_type", "Only authorization_code and refresh_token grants are supported.");
  } catch (error) {
    if (error instanceof OAuthRequestError) {
      return oauthResponse({ error: error.errorCode, error_description: error.message }, error.status);
    }
    console.error("agent_oauth_token_failed", error);
    return oauthResponse({ error: "server_error", error_description: "Token exchange failed." }, 500);
  }
}
