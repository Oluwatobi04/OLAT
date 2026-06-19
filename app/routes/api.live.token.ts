import { createFileRoute } from "@tanstack/react-router";
import { createDeepgramTempKey, isDeepgramConfigured } from "~/lib/deepgram.server";
import { authenticateBearer, jsonResponse, preflight } from "~/lib/api-auth.server";

// Issues a short-lived Deepgram key so the extension can stream audio directly.
export const Route = createFileRoute("/api/live/token")({
  server: {
    handlers: {
      OPTIONS: ({ request }: { request: Request }) => preflight(request),
      POST: async ({ request }: { request: Request }) => {
        const user = await authenticateBearer(request);
        if (!user) return jsonResponse(request, { error: "UNAUTHORIZED" }, 401);
        if (!isDeepgramConfigured()) {
          return jsonResponse(request, { error: "DEEPGRAM_NOT_CONFIGURED" }, 503);
        }
        try {
          const { key, expiresIn } = await createDeepgramTempKey(600);
          return jsonResponse(request, { key, expiresIn });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Token error";
          return jsonResponse(request, { error: message }, 502);
        }
      },
    },
  },
});
