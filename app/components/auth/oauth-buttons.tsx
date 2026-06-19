import { useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { oauthSignInFn } from "~/server/auth";

export function OAuthButtons() {
  const [loading, setLoading] = useState<"google" | "github" | null>(null);

  async function handle(provider: "google" | "github") {
    setLoading(provider);
    try {
      const res = await oauthSignInFn({ data: { provider } });
      if (res.ok && res.url) {
        window.location.href = res.url;
        return;
      }
      toast.error(res.ok ? "Could not start sign-in" : res.error);
    } catch {
      toast.error("OAuth sign-in failed");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <Button
        type="button"
        variant="outline"
        disabled={loading !== null}
        onClick={() => handle("google")}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
          <path
            fill="currentColor"
            d="M12 11v2.8h4c-.2 1-1.4 3-4 3-2.4 0-4.3-2-4.3-4.4S9.6 8 12 8c1.4 0 2.3.6 2.8 1.1l1.9-1.8C15.5 6.2 13.9 5.5 12 5.5 8.4 5.5 5.5 8.4 5.5 12s2.9 6.5 6.5 6.5c3.8 0 6.3-2.7 6.3-6.4 0-.4 0-.8-.1-1.1H12z"
          />
        </svg>
        {loading === "google" ? "..." : "Google"}
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={loading !== null}
        onClick={() => handle("github")}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
          <path
            fill="currentColor"
            d="M12 2C6.5 2 2 6.6 2 12.2c0 4.5 2.9 8.3 6.8 9.6.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.4-3.4-1.4-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.4 1.1 3 .9.1-.7.4-1.1.6-1.4-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.7 1a9.3 9.3 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.4 4.7-4.6 5 .4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5 3.9-1.3 6.8-5.1 6.8-9.6C22 6.6 17.5 2 12 2z"
          />
        </svg>
        {loading === "github" ? "..." : "GitHub"}
      </Button>
    </div>
  );
}
