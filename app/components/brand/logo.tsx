import { cn } from "~/lib/utils";

/**
 * OLat5 brand lockup (eagle + wordmark). Served from /public/olat5-logo.png.
 * `height` controls the rendered size; width scales automatically.
 */
export function Logo({
  className,
  height = 30,
  alt = "OLat5",
}: {
  className?: string;
  height?: number;
  alt?: string;
}) {
  return (
    <img
      src="/olat5-logo.png"
      alt={alt}
      height={height}
      style={{ height }}
      className={cn("w-auto select-none", className)}
      draggable={false}
    />
  );
}
