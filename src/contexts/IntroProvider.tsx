"use client";

import React from "react";

interface IntroContextProps {
  title: string;
  description: string;
  floating: React.ReactNode;
  setIntro: (title: string, description: string) => void;
  setFloating: (node: React.ReactNode) => void;
  clearIntro: () => void;
  clearFloating: () => void;
}

export const IntroContext = React.createContext<Partial<IntroContextProps>>(
  {},
);

export const IntroProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [title, setTitle] = React.useState<string>("");
  const [description, setDescription] = React.useState<string>("");
  const [floating, setFloatingState] = React.useState<React.ReactNode>(null);

  const setIntro = React.useCallback(
    (nextTitle: string, nextDescription: string) => {
      setTitle(nextTitle);
      setDescription(nextDescription);
    },
    [],
  );

  const setFloating = React.useCallback((node: React.ReactNode) => {
    setFloatingState(node);
  }, []);

  const clearIntro = React.useCallback(() => {
    setTitle("");
    setDescription("");
  }, []);

  const clearFloating = React.useCallback(() => {
    setFloatingState(null);
  }, []);

  const value = React.useMemo(
    () => ({
      title,
      description,
      floating,
      setIntro,
      setFloating,
      clearIntro,
      clearFloating,
    }),
    [
      title,
      description,
      floating,
      setIntro,
      setFloating,
      clearIntro,
      clearFloating,
    ],
  );

  const hasIntro = Boolean(title || description || floating);

  return (
    <IntroContext.Provider value={value}>
      {hasIntro ? (
        <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            {(title || description) && (
              <div className="space-y-1">
                {title && (
                  <h1 className="text-2xl font-bold tracking-tight text-foreground">
                    {title}
                  </h1>
                )}
                {description && (
                  <p className="text-sm text-muted-foreground">{description}</p>
                )}
              </div>
            )}
            {floating ? (
              <div className="flex items-center gap-3">{floating}</div>
            ) : null}
          </div>
        </div>
      ) : null}
      {children}
    </IntroContext.Provider>
  );
};

export const useIntro = () => React.useContext(IntroContext);
