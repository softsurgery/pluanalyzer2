"use client";

import React from "react";
import { ExternalLink, MoreHorizontal } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

export type NavTabItem = {
  href: string;
  title: string;
  icon?: React.ReactNode;
  badge?: string | number;
  badgeVariant?: "default" | "secondary" | "destructive" | "outline";
  disabled?: boolean;
  external?: boolean;
  description?: string;
};

export interface NavTabProps extends Omit<
  React.HTMLAttributes<HTMLElement>,
  "onSelect"
> {
  items?: NavTabItem[];
  onSelect?: (item: NavTabItem) => void;
  activeHref?: string;
}

const TAB_GAP = 4;
const MORE_WIDTH = 80;

export function NavTab({
  className,
  items = [],
  onSelect,
  activeHref,
  ...props
}: NavTabProps) {
  const router = useRouter();
  const pathname = usePathname();

  const containerRef = React.useRef<HTMLDivElement>(null);
  const measureRef = React.useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = React.useState(items.length);

  const normalizedPath = activeHref || pathname || "";

  const activeItem =
    items.find((item) => item.href === normalizedPath) || items[0];

  const handleNavigate = React.useCallback(
    (item: NavTabItem) => {
      if (item.disabled) return;

      if (onSelect) {
        onSelect(item);
        return;
      }

      if (item.external) {
        window.open(item.href, "_blank", "noopener,noreferrer");
      } else if (item.href && item.href !== "#") {
        router.push(item.href);
      }
    },
    [onSelect, router],
  );

  React.useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;

    if (!container || !measure) return;

    const calculate = () => {
      const availableWidth = container.clientWidth;
      const tabElements = Array.from(
        measure.querySelectorAll<HTMLElement>("[data-tab]"),
      );

      const widths = tabElements.map(
        (element) => element.getBoundingClientRect().width,
      );

      const totalWidth = widths.reduce((sum, width) => sum + width, 0);

      if (totalWidth <= availableWidth) {
        setVisibleCount(items.length);
        return;
      }

      let usedWidth = 0;
      let count = 0;

      // Reserve room for the More dropdown.
      const maxWidth = availableWidth - MORE_WIDTH - TAB_GAP;

      for (const width of widths) {
        if (usedWidth + width > maxWidth) break;

        usedWidth += width + TAB_GAP;
        count++;
      }

      // Keep the active tab accessible.
      const activeIndex = items.findIndex(
        (item) => item.href === normalizedPath,
      );

      if (activeIndex >= count && activeIndex !== -1) {
        count = Math.max(0, count - 1);
      }

      setVisibleCount(count);
    };

    const observer = new ResizeObserver(calculate);

    observer.observe(container);
    observer.observe(measure);

    calculate();

    return () => observer.disconnect();
  }, [items, normalizedPath]);

  const visibleItems = items.slice(0, visibleCount);
  const overflowItems = items.slice(visibleCount);

  const renderTab = (item: NavTabItem) => {
    const isActive = normalizedPath === item.href;

    return (
      <Button
        key={item.href}
        variant="ghost"
        size="sm"
        disabled={item.disabled}
        onClick={() => handleNavigate(item)}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "h-10 shrink-0 gap-2 rounded-none border-b-2 border-transparent px-3",
          isActive
            ? "border-primary bg-transparent text-primary hover:bg-transparent hover:text-primary"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
        )}
      >
        {item.icon}

        <span>{item.title}</span>

        {item.badge !== undefined && (
          <Badge
            variant={item.badgeVariant || "secondary"}
            className="h-5 px-1.5 py-0 text-[10px]"
          >
            {item.badge}
          </Badge>
        )}

        {item.external && <ExternalLink className="size-3.5 opacity-60" />}
      </Button>
    );
  };

  return (
    <div
      ref={containerRef}
      className={cn("relative w-full min-w-0", className)}
      {...props}
    >
      {/* Hidden measurement container */}
      <div
        ref={measureRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute left-0 top-0 flex w-max gap-1"
      >
        {items.map((item) => (
          <div key={item.href} data-tab>
            {renderTab(item)}
          </div>
        ))}
      </div>

      {/* Visible tabs */}
      <nav
        aria-label="Page navigation"
        className="flex min-w-0 items-center gap-1 overflow-hidden border-b"
      >
        {visibleItems.map(renderTab)}

        {overflowItems.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-10 shrink-0 gap-2 rounded-none border-b-2 border-transparent px-3",
                  overflowItems.some((item) => item.href === normalizedPath) &&
                    "border-primary text-primary",
                )}
              >
                More
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="min-w-48">
              {overflowItems.map((item) => (
                <DropdownMenuItem
                  key={item.href}
                  disabled={item.disabled}
                  onSelect={() => handleNavigate(item)}
                  className={cn(
                    "gap-2",
                    normalizedPath === item.href &&
                      "bg-accent font-semibold text-primary",
                  )}
                >
                  {item.icon}
                  <span className="flex-1">{item.title}</span>

                  {item.badge !== undefined && (
                    <Badge variant={item.badgeVariant || "secondary"}>
                      {item.badge}
                    </Badge>
                  )}

                  {item.external && (
                    <ExternalLink className="size-3.5 opacity-60" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </nav>
    </div>
  );
}
