import { getSessionUser } from "@/lib/auth-server";
import { issueAuthorizationCode, OAuthRequestError, validateAuthorizationRequest } from "@/lib/agent-oauth";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectWithError(redirectUri: string, state: string, error: string, description: string): string {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  url.searchParams.set("error_description", description);
  if (state) url.searchParams.set("state", state);
  return url.toString();
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_request", error_description: "Invalid JSON body." }, { status: 400 });
  }
  const params = new URLSearchParams();
  for (const key of ["response_type", "client_id", "redirect_uri", "state", "code_challenge", "code_challenge_method", "scope", "resource"]) {
    if (typeof body[key] === "string") params.set(key, body[key] as string);
  }

  try {
    const validated = await validateAuthorizationRequest(params);
    if (body.decision === "deny") {
      return Response.json({
        redirect_to: redirectWithError(validated.redirectUri, validated.state, "access_denied", "The user declined access."),
      }, { headers: { "Cache-Control": "no-store" } });
    }
    const session = await getSessionUser();
    if (!session) {
      return Response.json({ error: "login_required", error_description: "Sign in to stocksbrew first." }, { status: 401 });
    }
    const user = await getUserDoc(session.uid).catch(() => null);
    if (!resolveIsSubscribed(user)) {
      return Response.json({
        error: "pro_required",
        error_description: "Stocksbrew Pro is required to connect an agent.",
        subscribe_url: "/subscribe",
      }, { status: 403 });
    }
    const code = await issueAuthorizationCode(session.uid, validated);
    const redirect = new URL(validated.redirectUri);
    redirect.searchParams.set("code", code);
    if (validated.state) redirect.searchParams.set("state", validated.state);
    return Response.json({ redirect_to: redirect.toString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof OAuthRequestError) {
      return Response.json(
        { error: error.errorCode, error_description: error.message },
        { status: error.status, headers: { "Cache-Control": "no-store" } },
      );
    }
    console.error("agent_oauth_authorize_failed", error);
    return Response.json(
      { error: "server_error", error_description: "Authorization failed." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
