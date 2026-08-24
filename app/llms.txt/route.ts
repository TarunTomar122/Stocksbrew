import { buildLlmsMarkdown } from "@/lib/llms";

export const revalidate = 300;

export async function GET() {
  return new Response(await buildLlmsMarkdown(), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Vary: "Accept",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
