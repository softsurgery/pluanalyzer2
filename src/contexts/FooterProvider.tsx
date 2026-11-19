"use client";

import React from "react";
import { Toaster } from "@/components/ui/sonner";

interface FooterContextProps {
  content: React.ReactNode;
  setContent: (content: React.ReactNode) => void;
  clearContent: () => void;
}

export const FooterContext = React.createContext<Partial<FooterContextProps>>(
  {},
);

export const FooterProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [content, setContent] = React.useState<React.ReactNode>(null);

  const clearContent = React.useCallback(() => setContent(null), []);

  const value = React.useMemo(
    () => ({ content, setContent, clearContent }),
    [content, clearContent],
  );

  return (
    <FooterContext.Provider value={value}>
      <div className="flex min-h-screen flex-col">
        <div className={content ? "flex-1 pb-20" : "flex-1"}>{children}</div>
        {content ? (
          <footer className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <div className="mx-auto flex max-w-7xl items-center justify-end gap-3 px-4 py-3 sm:px-6">
              {content}
            </div>
          </footer>
        ) : null}
      </div>
      <Toaster
        offset={content ? { bottom: 80 } : undefined}
        mobileOffset={content ? { bottom: 80 } : undefined}
      />
    </FooterContext.Provider>
  );
};

export const useFooter = () => React.useContext(FooterContext);
