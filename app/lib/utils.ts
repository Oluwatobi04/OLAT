import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function formatCurrency(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

// Maps server error codes to user-facing messages.
export function friendlyError(code: string): string {
  switch (code) {
    case "AI_NOT_CONFIGURED":
      return "AI isn't configured yet. Add an OpenRouter API key (OPENROUTER_API_KEY) to enable AI features.";
    case "INSUFFICIENT_CREDITS":
      return "You don't have enough credits for this action. Upgrade your plan to get more.";
    default:
      return code || "Something went wrong. Please try again.";
  }
}

export function initials(name: string | null | undefined, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  }
  return (email[0] ?? "?").toUpperCase();
}
