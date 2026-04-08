type Handler = (req: Request, url: URL) => Promise<Response>;

interface Route {
  method: string;
  pathname: string;
  handler: Handler;
}

export class Router {
  private routes: Route[] = [];

  on(method: string, pathname: string, handler: Handler): void {
    this.routes.push({ method, pathname, handler });
  }

  async handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const method = req.method.toUpperCase();

    for (const route of this.routes) {
      if (route.method === method && route.pathname === url.pathname) {
        try {
          return await route.handler(req, url);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return jsonResponse(500, { error: message });
        }
      }
    }

    return jsonResponse(404, { error: "not found" });
  }
}

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
