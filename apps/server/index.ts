import { HttpError } from "./src/http.error";
import { routes } from "./src/server";

if (import.meta.main) {
  const server = Bun.serve({
    port: 5174,
    routes: routes,
    error(error) {
      console.error(error);
      const status = error instanceof HttpError ? error.status : 500;
      return new Response(JSON.stringify({ error: error.message }), {
        status,
        headers: { "content-type": "application/json" },
      });
    },
  });
  console.log(`theme-playground server listening on http://localhost:${server.port}`);
}
