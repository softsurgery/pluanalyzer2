import { cn } from "@/lib/utils";

interface RenderInlineProps {
  className?: string;
  text: string;
}

export function RenderInline({ className, text }: RenderInlineProps) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong
          key={idx}
          className={cn("font-semibold text-foreground", className)}
        >
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={idx}
          className={cn(
            "rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground",
            className,
          )}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return (
        <em key={idx} className={cn("italic", className)}>
          {part.slice(1, -1)}
        </em>
      );
    }
    return part;
  });
}
