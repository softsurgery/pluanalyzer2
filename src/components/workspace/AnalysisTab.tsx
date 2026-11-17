"use client";

import type React from "react";
import { Loader2, Play, Search } from "lucide-react";
import type { ParcelRecord } from "@/types/parcels";
import type { ProjectItem } from "@/types/projects";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const AUTO_PARCEL_VALUE = "__auto__";

export interface AnalysisTabProps {
  projects: ProjectItem[];
  parcels: ParcelRecord[];
  projectId: string;
  onProjectChange: (nextProjectId: string) => void;
  address: string;
  onAddressChange: (value: string) => void;
  idu: string;
  onIduChange: (value: string) => void;
  selectedParcelId: string;
  onParcelSelect: (parcelId: string, parcel?: ParcelRecord) => void;
  prompt: string;
  onPromptChange: (value: string) => void;
  onLookupParcel: () => void;
  isLookingUpParcel: boolean;
  onSubmit: (e: React.FormEvent) => void;
  isRunningAnalysis: boolean;
}

export function AnalysisTab({
  projects,
  parcels,
  projectId,
  onProjectChange,
  address,
  onAddressChange,
  idu,
  onIduChange,
  selectedParcelId,
  onParcelSelect,
  prompt,
  onPromptChange,
  onLookupParcel,
  isLookingUpParcel,
  onSubmit,
  isRunningAnalysis,
}: AnalysisTabProps) {
  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Lancer une analyse PLU</CardTitle>
        <CardDescription>
          Sélectionnez un projet, localisez une parcelle cadastrale et saisissez
          votre prompt de faisabilité.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="space-y-1.5 lg:col-span-3">
              <Label htmlFor="ws-project">Projet</Label>
              <Select value={projectId} onValueChange={onProjectChange}>
                <SelectTrigger id="ws-project">
                  <SelectValue placeholder="Sélectionner un projet" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name} ({p.codeInsee})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 lg:col-span-4">
              <Label htmlFor="ws-address">
                Adresse française (BAN / Géoplateforme)
              </Label>
              <Input
                id="ws-address"
                value={address}
                onChange={(e) => onAddressChange(e.target.value)}
                placeholder="Ex: 12 Avenue Sextius, Aix-en-Provence"
              />
            </div>

            <div className="space-y-1.5 lg:col-span-3">
              <Label htmlFor="ws-idu">
                IDU Cadastral ou Parcelle enregistrée
              </Label>
              <Input
                id="ws-idu"
                value={idu}
                onChange={(e) => onIduChange(e.target.value)}
                placeholder="IDU (ex: 13001000AB0123)"
                className="font-mono"
              />
            </div>

            <div className="flex items-end lg:col-span-2">
              <Button
                type="button"
                variant="outline"
                onClick={onLookupParcel}
                disabled={isLookingUpParcel}
                className="w-full"
              >
                {isLookingUpParcel ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4 text-primary" />
                )}
                Localiser IGN
              </Button>
            </div>

            <div className="space-y-1.5 lg:col-span-3">
              <Label htmlFor="ws-parcel">Ou parcelle en base</Label>
              <Select
                value={selectedParcelId || AUTO_PARCEL_VALUE}
                onValueChange={(value) => {
                  const nextId = value === AUTO_PARCEL_VALUE ? "" : value;
                  const found = parcels.find((p) => String(p.id) === nextId);
                  onParcelSelect(nextId, found);
                }}
              >
                <SelectTrigger id="ws-parcel" className="font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AUTO_PARCEL_VALUE}>
                    — Auto via recherche —
                  </SelectItem>
                  {parcels.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.idu} ({p.surfaceM2 ?? "?"} m²)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 lg:col-span-7">
              <Label htmlFor="ws-prompt">
                Prompt d&apos;analyse de faisabilité (chaque envoi crée une
                nouvelle version immuable)
              </Label>
              <Input
                id="ws-prompt"
                required
                value={prompt}
                onChange={(e) => onPromptChange(e.target.value)}
              />
            </div>

            <div className="flex items-end lg:col-span-2">
              <Button
                type="submit"
                disabled={isRunningAnalysis || !projectId}
                className="w-full"
              >
                {isRunningAnalysis ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Analyser PLU
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
