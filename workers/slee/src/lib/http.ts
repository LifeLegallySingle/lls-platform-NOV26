export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8" } });

export const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });

export function requireAdmin(req: Request, token: string): boolean {
  const h = req.headers.get("authorization") || "";
  return !!token && h === `Bearer ${token}`;
}
