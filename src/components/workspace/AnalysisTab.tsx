"use client";

import type React from "react";
import { Loader2, Play, Search } from "lucide-react";
import type { ParcelRecord } from "@/types/parcels";
import type { ProjectItem } from "@/types/projects";
import { MarkerPicker, type MarkerCoordinates } from "@/components/MarkerPicker";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const AUTO_PARCEL_VALUE = "__auto__";

export type LocationInputMode = "address" | "parcel" | "map";

export interface AnalysisTabProps {
  projects: ProjectItem[];
  parcels: ParcelRecord[];
  projectId: string;
  hideProjectSelect?: boolean;
  onProjectChange: (nextProjectId: string) => void;
  locationMode: LocationInputMode;
  onLocationModeChange: (mode: LocationInputMode) => void;
  address: string;
  onAddressChange: (value: string) => void;
  idu: string;
  onIduChange: (value: string) => void;
  selectedParcelId: string;
  onParcelSelect: (parcelId: string, parcel?: ParcelRecord) => void;
  pickedLocation: MarkerCoordinates | null;
  onPickedLocationChange: (coords: MarkerCoordinates) => void;
  prompt: string;
  onPromptChange: (value: string) => void;
  onLookupParcel: () => void;
  isLookingUpParcel: boolean;
  onSubmit: (e: React.FormEvent) => void;
  isRunningAnalysis: boolean;
}

const LOCATION_MODES: Array<{
  value: LocationInputMode;
  label: string;
  description: string;
}> = [
  {
    value: "address",
    label: "Adresse française",
    description: "Recherche via BAN / Géoplateforme",
  },
  {
    value: "parcel",
    label: "IDU Cadastral ou Parcelle enregistrée",
    description: "Saisie d'IDU ou sélection en base",
  },
  {
    value: "map",
    label: "Point sur la carte",
    description: "Sélection directe via MarkerPicker",
  },
];

export function AnalysisTab({
  projects,
  parcels,
  projectId,
  hideProjectSelect = false,
  onProjectChange,
  locationMode,
  onLocationModeChange,
  address,
  onAddressChange,
  idu,
  onIduChange,
  selectedParcelId,
  onParcelSelect,
  pickedLocation,
  onPickedLocationChange,
  prompt,
  onPromptChange,
  onLookupParcel,
  isLookingUpParcel,
  onSubmit,
  isRunningAnalysis,
}: AnalysisTabProps) {
  const isAddressMode = locationMode === "address";
  const isParcelMode = locationMode === "parcel";
  const isMapMode = locationMode === "map";

  const lookupDisabled =
    isLookingUpParcel || (isMapMode && !pickedLocation);

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Lancer une analyse PLU</CardTitle>
        <CardDescription>
          Choisissez le mode de localisation (adresse, IDU / parcelle ou carte),
          puis saisissez votre prompt de faisabilité.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-5">
          {!hideProjectSelect && (
            <div className="max-w-md space-y-1.5">
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
          )}

          {/* Location mode radio selector */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium leading-none">
              Mode de localisation de la parcelle
            </legend>
            <div className="grid gap-3 sm:grid-cols-3">
              {LOCATION_MODES.map((mode) => {
                const checked = locationMode === mode.value;
                return (
                  <label
                    key={mode.value}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
                      checked
                        ? "border-primary bg-primary/5"
                        : "border-input hover:bg-muted/50",
                    )}
                  >
                    <input
                      type="radio"
                      name="location-mode"
                      value={mode.value}
                      checked={checked}
                      onChange={() => onLocationModeChange(mode.value)}
                      className="mt-1 h-4 w-4 accent-primary"
                    />
                    <div className="space-y-0.5">
                      <div className="text-sm font-semibold leading-tight">
                        {mode.label}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {mode.description}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {/* Address & Parcel inputs */}
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="space-y-1.5 lg:col-span-4">
              <Label
                htmlFor="ws-address"
                className={cn(!isAddressMode && "text-muted-foreground")}
              >
                Adresse française (BAN / Géoplateforme)
              </Label>
              <Input
                id="ws-address"
                value={address}
                onChange={(e) => onAddressChange(e.target.value)}
                placeholder="Ex: 12 Avenue Sextius, Aix-en-Provence"
                disabled={!isAddressMode}
              />
            </div>

            <div className="space-y-1.5 lg:col-span-3">
              <Label
                htmlFor="ws-idu"
                className={cn(!isParcelMode && "text-muted-foreground")}
              >
                IDU Cadastral
              </Label>
              <Input
                id="ws-idu"
                value={idu}
                onChange={(e) => onIduChange(e.target.value)}
                placeholder="IDU (ex: 13001000AB0123)"
                className="font-mono"
                disabled={!isParcelMode}
              />
            </div>

            <div className="space-y-1.5 lg:col-span-3">
              <Label
                htmlFor="ws-parcel"
                className={cn(!isParcelMode && "text-muted-foreground")}
              >
                Ou parcelle enregistrée en base
              </Label>
              <Select
                value={selectedParcelId || AUTO_PARCEL_VALUE}
                disabled={!isParcelMode}
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

            <div className="flex items-end lg:col-span-2">
              <Button
                type="button"
                variant="outline"
                onClick={onLookupParcel}
                disabled={lookupDisabled}
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
          </div>

          {/* Direct Map Picker */}
          <div className="space-y-1.5">
            <Label className={cn(!isMapMode && "text-muted-foreground")}>
              Sélection directe sur la carte
            </Label>
            <MarkerPicker
              value={pickedLocation}
              onChange={onPickedLocationChange}
              disabled={!isMapMode}
            />
          </div>

          {/* Analysis Prompt Textarea & Submit */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ws-prompt">
                Prompt d&apos;analyse de faisabilité (chaque envoi crée une
                nouvelle version immuable)
              </Label>
              <Textarea
                id="ws-prompt"
                rows={3}
                required
                value={prompt}
                onChange={(e) => onPromptChange(e.target.value)}
              />
            </div>

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={
                  isRunningAnalysis ||
                  !projectId ||
                  (isMapMode && !pickedLocation)
                }
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
