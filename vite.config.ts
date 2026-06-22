import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  server: { port: 3000 },
  plugins: [
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    // Nitro builds the deployable server. On Vercel it auto-detects the
    // environment and emits .vercel/output (serverless SSR) so "/" is served
    // correctly; locally it emits a Node server at .output/server/index.mjs.
    tanstackStart({ srcDirectory: "app" }),
    nitro(),
    viteReact(),
  ],
});
