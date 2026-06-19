import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { getOrganizationFn, updateOrganizationFn } from "~/server/dashboard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Badge } from "~/components/ui/badge";

export const Route = createFileRoute("/_app/dashboard/organization")({
  loader: () => getOrganizationFn(),
  component: OrganizationPage,
});

function OrganizationPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  if (!data) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          No organization found.
        </CardContent>
      </Card>
    );
  }

  const canEdit = ["OWNER", "ADMIN"].includes(data.role);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setSaving(true);
    try {
      const res = await updateOrganizationFn({
        data: {
          name: String(form.get("name") ?? ""),
          billingEmail: String(form.get("billingEmail") ?? "") || undefined,
        },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Organization updated");
      await router.invalidate();
    } catch {
      toast.error("Could not update organization");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Organization</h1>
        <p className="text-sm text-muted-foreground">
          Manage your workspace settings and details.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge>{data.org.subscription?.plan ?? "FREE"}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Members</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.org._count.memberships}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Teams</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.org.teams.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>
            {canEdit ? "Update your organization information." : "You have view-only access."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid max-w-lg gap-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="name">Organization name</Label>
              <Input id="name" name="name" defaultValue={data.org.name} disabled={!canEdit} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input id="slug" defaultValue={data.org.slug} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="billingEmail">Billing email</Label>
              <Input
                id="billingEmail"
                name="billingEmail"
                type="email"
                defaultValue={data.org.billingEmail ?? ""}
                disabled={!canEdit}
              />
            </div>
            {canEdit ? (
              <div>
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving..." : "Save changes"}
                </Button>
              </div>
            ) : null}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
