"use client";

import React from "react";
import { Box } from "lucide-react";
import { useDialog } from "@/hooks/useDialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Label } from "@/components/ui/label";

type Option = {
  label: string;
  value: string;
};

interface DataTableEventFilterProps {
  className?: string;
  title?: string;
  options?: Option[];
  selectedValues?: string[];
  onOptionClick?: (selectedOptions: Option[]) => void;
}

export function DataTableNoContextFacetedFilter({
  className,
  title,
  options = [],
  selectedValues = [], // Default to empty array
  onOptionClick,
}: DataTableEventFilterProps) {
  const [selected, setSelected] = React.useState<Option[]>([]);

  // Sync selected with selectedValues when it changes externally
  React.useEffect(() => {
    setSelected(
      options.filter((option) => selectedValues.includes(option.value)),
    );
  }, [selectedValues, options]);

  const toggleSelection = (option: Option) => {
    const updatedSelected = selected.some((opt) => opt.value === option.value)
      ? selected.filter((opt) => opt.value !== option.value)
      : [...selected, option];

    setSelected(updatedSelected);
  };

  const applySelection = () => {
    if (onOptionClick) onOptionClick(selected);
  };

  const resetSelection = () => {
    setSelected([]);
    if (onOptionClick) onOptionClick([]);
  };

  const { DialogFragment, openDialog, closeDialog } = useDialog({
    children: (
      <div className="flex flex-col gap-4">
        <Command>
          <CommandInput placeholder={`Filtrer ${title ?? ""}...`} />
          <CommandList>
            <CommandEmpty>Aucun résultat</CommandEmpty>
            <CommandGroup heading="Suggestions">
              {options.map((option) => {
                const isChecked = selected.some(
                  (opt) => opt.value === option.value,
                );
                return (
                  <CommandItem
                    key={option.value}
                    className="flex items-center gap-2"
                    onClickCapture={() => {
                      toggleSelection(option);
                    }}
                  >
                    <Checkbox checked={isChecked} />
                    <Label>{option.label}</Label>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
        <div className="flex justify-end gap-2">
          <Button
            variant="default"
            onClick={() => {
              applySelection();
              closeDialog();
            }}
          >
            Appliquer
          </Button>
          <Button variant="outline" onClick={resetSelection}>
            Réinitialiser
          </Button>
        </div>
      </div>
    ),
    className: "w-[400px] h-fit p-2",
  });

  return (
    <div className={cn("flex items-center", className)}>
      <Button className="flex gap-2 h-9" variant="outline" onClick={openDialog}>
        <Box className="w-5 h-5" />
        {title} {selected.length > 0 ? `(${selected.length})` : ""}
      </Button>
      {DialogFragment}
    </div>
  );
}
