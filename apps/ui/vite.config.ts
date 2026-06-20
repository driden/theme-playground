import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  root: __dirname,
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:5174" },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
