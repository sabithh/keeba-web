import type { NextRequest } from "next/server";

export function GET(request: NextRequest): Response {
  const iconUrl = new URL("/app-icon/180", request.url);
  return Response.redirect(iconUrl, 308);
}
