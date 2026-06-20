import { handleRequest } from "./src/server";

if (import.meta.main) {
    const server = Bun.serve({ port: 5174, fetch: handleRequest });
    console.log(`theme-playground server listening on http://localhost:${server.port}`);
}

