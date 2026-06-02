"use client";

import { ChevronRight } from "lucide-react";
import { Loader } from "@/components/ui/loader";
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
  const content = (
    <>
      <Loader className="text-muted-foreground" size="sm" variant="pulse-dot" />
      <TextShimmer className="min-w-[4.5rem] font-medium leading-5">{text}</TextShimmer>
    </>
  );

  return (
    <div className={cn("flex min-h-5 w-full items-center justify-between", className)}>
      {onClick ? (
        <button className="flex items-center gap-1.5 text-sm transition-opacity hover:opacity-80" onClick={onClick} type="button">
          {content}
          <ChevronRight className="size-4 text-muted-foreground" />
        </button>
      ) : (
        <div className="flex cursor-default items-center gap-1.5 text-sm">{content}</div>
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
