import type { NextRequest } from "next/server";

export async function POST(req: NextRequest): Promise<Response> {
  return Response.redirect(new URL("/", req.url));
}
