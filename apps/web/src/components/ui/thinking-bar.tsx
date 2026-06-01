"use client";

import { ChevronRight } from "lucide-react";
import { TextShimmer } from "@/components/ui/text-shimmer";
import { cn } from "@/lib/utils";

type ThinkingBarProps = {
  className?: string;
  onClick?: () => void;
  onStop?: () => void;
  stopLabel?: string;
  text?: string;
};

export function ThinkingBar({
  className,
  onClick,
  onStop,
  stopLabel = "Answer now",
  text = "Thinking"
}: ThinkingBarProps) {
  return (
    <div className={cn("flex min-h-5 w-full items-center justify-between", className)}>
      {onClick ? (
        <button className="flex items-center gap-1 text-sm transition-opacity hover:opacity-80" onClick={onClick} type="button">
          <TextShimmer className="min-w-[4.5rem] font-medium leading-5">{text}</TextShimmer>
          <ChevronRight className="size-4 text-muted-foreground" />
        </button>
      ) : (
        <TextShimmer className="min-w-[4.5rem] cursor-default font-medium leading-5">{text}</TextShimmer>
      )}
      {onStop ? (
        <button
          className="border-b border-dotted border-muted-foreground/50 text-sm text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
          onClick={onStop}
          type="button"
        >
          {stopLabel}
        </button>
      ) : null}
    </div>
  );
}
