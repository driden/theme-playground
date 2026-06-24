import { routes } from "./src/server";

if (import.meta.main) {
  const server = Bun.serve({
    port: 5174,
    routes: routes,
    error(error) {
      console.error(error);
      return new Response(`Error: ${error.message}`, {
        status: 500,
      });
    },
  });
  console.log(`theme-playground server listening on http://localhost:${server.port}`);
}
