"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from "@/components/ui/command";

export interface FilterMultiSelectProps {
    label: string;
    icon?: any;
    options: string[];
    selected: string[];
    onChange: (value: string) => void;
    disabled?: boolean;
}

export function FilterMultiSelect({
    label,
    icon: Icon,
    options = [],
    selected,
    onChange,
    disabled,
}: FilterMultiSelectProps) {
    const [open, setOpen] = useState(false);

    // If selected is a string (legacy), wrap it. Ideally it should be string[]
    const selectedArray = Array.isArray(selected) ? selected : [];

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                        "h-9 gap-2 border-dashed bg-background min-w-[140px] justify-start text-left font-normal",
                        selectedArray.length > 0 && "border-primary/50 bg-primary/5 font-medium"
                    )}
                    disabled={disabled}
                >
                    {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
                    <span className="truncate">{label}</span>
                    {selectedArray.length > 0 && (
                        <Badge
                            variant="secondary"
                            className="ml-auto h-5 px-1 text-[10px] bg-primary text-primary-foreground shrink-0"
                        >
                            {selectedArray.length}
                        </Badge>
                    )}
                    <ChevronDown className="ml-2 h-3 w-3 opacity-50 shrink-0" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-auto min-w-[240px] max-w-[600px]" align="start">
                <Command>
                    <CommandInput placeholder={`Search ${label}...`} className="h-9" />
                    <CommandList>
                        <CommandEmpty>No results found.</CommandEmpty>
                        <CommandGroup className="max-h-64 overflow-y-auto">
                            {options.map((option, idx) => {
                                const isSelected = selectedArray.includes(option);
                                return (
                                    <CommandItem
                                        key={`${option}-${idx}`}
                                        value={option}
                                        onSelect={() => onChange(option)}
                                    >
                                        <div
                                            className={cn(
                                                "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                                isSelected
                                                    ? "bg-primary text-primary-foreground"
                                                    : "opacity-50 [&_svg]:invisible"
                                            )}
                                        >
                                            <Check className={cn("h-4 w-4")} />
                                        </div>
                                        <span className="whitespace-nowrap pr-4">{option}</span>
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                        {selectedArray.length > 0 && (
                            <>
                                <CommandSeparator />
                                <CommandGroup>
                                    <CommandItem
                                        onSelect={() => {
                                            // We need a way to clear. 
                                            // The parent onChange usually toggles. 
                                            // To clear, we might need a separate prop or loop call.
                                            // For now, let's keep the user's pattern: loop clear inside component?
                                            // No, best practice is `onClear` prop or just let parent handle.
                                            // But strictly copying the `candidate-list` logic: it called `onChange` for each item to toggle it off?
                                            // "selected.forEach((s: string) => onChange(s))"
                                            selectedArray.forEach((s) => onChange(s));
                                        }}
                                        className="justify-center text-center text-destructive"
                                    >
                                        Clear filters
                                    </CommandItem>
                                </CommandGroup>
                            </>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
