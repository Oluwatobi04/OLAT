import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    defaultPreload: "intent",
    // Cache loader results so re-navigating between pages within 30s does not
    // re-run the _app auth loader (a Supabase getUser network call + DB queries)
    // or each page's loader. Mutations call router.invalidate() to stay fresh.
    defaultStaleTime: 30_000,
    defaultPreloadStaleTime: 30_000,
    defaultGcTime: 5 * 60_000,
    defaultErrorComponent: ({ error }) => (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        </div>
      </div>
    ),
    defaultNotFoundComponent: () => (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">404</h1>
          <p className="mt-2 text-sm text-muted-foreground">Page not found</p>
        </div>
      </div>
    ),
  });
  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
