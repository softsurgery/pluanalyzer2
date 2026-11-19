"use client";

import React, { useState } from "react";
import axios from "axios";
import { Button, TextareaInput, useFormFields } from "@payloadcms/ui";
import { cn } from "@/lib/utils";
import type { TestAiResponse } from "@/types/openrouter";

export interface ModelTestProps {
  className?: string;
  onTestComplete?: () => void;
}

export const ModelTest: React.FC<ModelTestProps> = ({
  className,
  onTestComplete,
}) => {
  const selectedModelId = useFormFields(([fields]) => {
    const val = fields.defaultAiModel?.value;
    if (typeof val === "string" || typeof val === "number") return val;
    if (val && typeof val === "object" && "id" in val) {
      return (val as { id: string | number }).id;
    }
    return undefined;
  });

  const [prompt, setPrompt] = useState(
    'Réponds brièvement par "OK" et précise le nom de ton modèle.',
  );
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<TestAiResponse | null>(null);

  const handleTest = async () => {
    if (!prompt.trim() || isLoading) return;
    setIsLoading(true);
    setResult(null);
    try {
      const res = await axios.post<TestAiResponse>(
        "/api/plu/test-ai",
        {
          prompt: prompt.trim(),
          modelId: selectedModelId,
        },
        { validateStatus: () => true },
      );
      setResult(res.data);
      onTestComplete?.();
    } catch (err) {
      setResult({
        ok: false,
        error: err instanceof Error ? err.message : "Erreur réseau",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={className}>
      <TextareaInput
        path="aiResponsivenessTest"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Saisissez un prompt de test pour le modèle sélectionné ci-dessus..."
        rows={3}
      />
      <div className="mt-3">
        <Button
          type="button"
          buttonStyle="primary"
          onClick={handleTest}
          disabled={isLoading || !prompt.trim()}
        >
          {isLoading ? "Test en cours..." : "Tester l'IA"}
        </Button>
      </div>

      {result && (
        <div
          className={cn(
            "mt-3.5 rounded border border-solid bg-[var(--theme-elevation-50)] p-3 text-[13px]",
            result.ok
              ? "border-[var(--theme-success-500)]"
              : "border-[var(--theme-error-500)]",
          )}
        >
          <div className="mb-1.5 font-semibold">
            {result.ok ? "Succès" : "Échec"}
            {result.model ? ` · ${result.model}` : ""}
            {typeof result.durationMs === "number"
              ? ` · ${result.durationMs} ms`
              : ""}
          </div>
          <pre className="m-0 whitespace-pre-wrap break-words font-mono text-xs">
            {result.ok ? result.reply || "(Réponse vide)" : result.error}
          </pre>
        </div>
      )}
    </div>
  );
};
