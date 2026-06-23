import { createFileRoute, redirect } from "@tanstack/react-router";

// The Interview Prep / Training Center feature was removed. Any existing link or
// bookmark now redirects to the dashboard so there are no broken routes.
export const Route = createFileRoute("/_app/dashboard/interview-prep")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
