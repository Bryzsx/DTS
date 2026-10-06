export default async function handler(request: Request): Promise<Response> {
  return new Response(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }), {
    headers: { "content-type": "application/json" },
  })
}