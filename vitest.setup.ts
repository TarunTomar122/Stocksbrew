// The suite pins today's Free/Pro line. A PAYWALL_V2 set in the shell or an env file must not flip it under the
// tests that assert today's numbers; the tighter line is tested on purpose with vi.stubEnv (lib/paywall-v2.test.ts).
// Vitest only: vite-node job runs that share vitest.config.ts do not load setup files, so the jobs still read the flag.
delete process.env.PAYWALL_V2;
