import { cn } from "~/lib/utils";

/**
 * OLat5 Falcon brand — the official uploaded asset.
 * `Logo` renders the full lockup (falcon + wordmark); `FalconMark` renders the
 * square falcon-only mark for compact/square contexts. Both are transparent PNGs
 * that sit cleanly on white and light-blue surfaces.
 */
export function FalconMark({ size = 30, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/olat5-mark.png"
      alt="OLat5"
      style={{ height: size, width: "auto" }}
      className={cn("select-none", className)}
      draggable={false}
    />
  );
}

export function Logo({
  className,
  height = 30,
  alt = "OLat5",
  markOnly = false,
}: {
  className?: string;
  height?: number;
  alt?: string;
  markOnly?: boolean;
}) {
  if (markOnly) return <FalconMark size={height} className={className} />;
  return (
    <img
      src="/olat5-falcon.png"
      alt={alt}
      style={{ height }}
      className={cn("w-auto select-none", className)}
      draggable={false}
    />
  );
}
