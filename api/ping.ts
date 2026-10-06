export async function GET(request: Request): Promise<Response> {
  return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
    headers: { "content-type": "application/json" },
    status: 200,
  })
}