import { cn } from "@/lib/utils";

type PulseDotLoaderProps = {
  className?: string;
  dotClassName?: string;
  label?: string;
};

export function PulseDotLoader({
  className,
  dotClassName,
  label = "Working"
}: PulseDotLoaderProps) {
  return (
    <span
      aria-label={label}
      className={cn("inline-flex h-4 w-6 shrink-0 items-center justify-center gap-1", className)}
      role="status"
    >
      <span className={cn("size-1 rounded-full bg-current animate-pulse", dotClassName)} />
      <span className={cn("size-1 rounded-full bg-current animate-pulse [animation-delay:120ms]", dotClassName)} />
      <span className={cn("size-1 rounded-full bg-current animate-pulse [animation-delay:240ms]", dotClassName)} />
    </span>
  );
}
