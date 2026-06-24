import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Toaster } from "sonner";
import type { ReactNode } from "react";
import appCss from "~/styles/app.css?url";
import { ThemeProvider, THEME_INIT_SCRIPT } from "~/components/theme-provider";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "OLat5 Interview Copilot" },
      {
        name: "description",
        content:
          "OLat5 is an interview copilot with real time transcription, instant responses, resume context, and coaching for interviews and meetings.",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <ThemeProvider>
        <Outlet />
        <Toaster richColors position="top-right" theme="system" />
      </ThemeProvider>
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        {/* Apply the saved theme before first paint to avoid a flash. The script
            mutates <html> class/color-scheme pre-hydration, so suppress the
            expected attribute mismatch on this element. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body className="h-full min-h-screen bg-background text-foreground antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}
