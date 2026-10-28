import { Link } from "@tanstack/react-router";

export function AresLogo() {
  return (
    <Link to="/" className="flex items-center gap-2 font-display text-lg font-bold tracking-[0.3em]">
      <span className="inline-block h-3 w-3 rotate-45 bg-primary shadow-glow" />
      ARES<span className="text-primary">·</span>MOBILITY
    </Link>
  );
}
