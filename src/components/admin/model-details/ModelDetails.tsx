"use client";

import React, { useState } from "react";
import { FieldLabel } from "@payloadcms/ui";
import { cn } from "@/lib/utils";
import { Consumption } from "@/components/admin/model-details/Consumption";
import { ModelTest } from "@/components/admin/model-details/ModelTest";

interface ModelDetailsProps {
  className?: string;
}

export const ModelDetails = ({ className }: ModelDetailsProps) => {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  return (
    <div className={cn("field-type textarea mb-6", className)}>
      <FieldLabel
        htmlFor="field-aiResponsivenessTest"
        label="Test de réactivité IA & Quota OpenRouter"
      />
      <div className="flex flex-col gap-4 mt-2">
        <ModelTest onTestComplete={() => setRefreshTrigger((n) => n + 1)} />
        <Consumption refreshTrigger={refreshTrigger} />
      </div>
    </div>
  );
};
