const OPENAPI = "https://www.stocksbrew.online/api/v1/openapi.json";

function response(request: Request) {
  return Response.json(
    {
      error: {
        code: "api_route_not_found",
        message: "The requested API route does not exist.",
        hint: `See ${OPENAPI} for supported routes.`,
        path: new URL(request.url).pathname,
      },
    },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return response(request);
}

export function POST(request: Request) {
  return response(request);
}

export function PUT(request: Request) {
  return response(request);
}

export function PATCH(request: Request) {
  return response(request);
}

export function DELETE(request: Request) {
  return response(request);
}

export function OPTIONS(request: Request) {
  return response(request);
}
