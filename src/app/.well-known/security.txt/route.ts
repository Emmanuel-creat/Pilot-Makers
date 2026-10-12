import { securityTxt } from "@/lib/security-contact";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const origin = process.env.APP_URL?.replace(/\/$/, "") || new URL(req.url).origin;
  return new Response(securityTxt(origin), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=86400" } });
}
