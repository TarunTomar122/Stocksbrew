export function signedInHomeDestination(signedIn: boolean): "/watchlist" | null {
  return signedIn ? "/watchlist" : null;
}
