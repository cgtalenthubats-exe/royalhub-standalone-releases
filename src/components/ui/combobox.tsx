"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

// Single-select searchable dropdown — like FilterMultiSelect, but picks one
// value and closes, and (since these back plain text DB columns, not an
// enum/FK) accepts free text too: if nothing in the list matches what's
// typed, an "Use “...”" row lets you pick it anyway instead of getting stuck.
export function Combobox({ options, value, onChange, placeholder = "Select…", searchPlaceholder = "Search…", className }: {
    options: string[];
    value: string | null;
    onChange: (value: string | null) => void;
    placeholder?: string;
    searchPlaceholder?: string;
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const trimmed = query.trim();
    const exactMatch = options.some((o) => o.toLowerCase() === trimmed.toLowerCase());

    return (
        <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setQuery(""); }}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className={cn(
                        "flex h-9 w-full items-center justify-between rounded-md border bg-background px-3 text-sm",
                        !value && "text-muted-foreground",
                        className
                    )}
                >
                    <span className="truncate">{value || placeholder}</span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                    <CommandInput placeholder={searchPlaceholder} value={query} onValueChange={setQuery} className="h-9" />
                    <CommandList className="max-h-64">
                        <CommandEmpty>
                            {trimmed ? (
                                <button
                                    className="flex w-full items-center px-2 py-1.5 text-left text-sm hover:bg-slate-100"
                                    onClick={() => { onChange(trimmed); setOpen(false); setQuery(""); }}
                                >
                                    Use "{trimmed}"
                                </button>
                            ) : "No results"}
                        </CommandEmpty>
                        <CommandGroup>
                            <CommandItem value="__none__" onSelect={() => { onChange(null); setOpen(false); setQuery(""); }}>
                                <Check className={cn("mr-2 h-4 w-4", !value ? "opacity-100" : "opacity-0")} />
                                <span className="text-muted-foreground">—</span>
                            </CommandItem>
                            {options.map((o) => (
                                <CommandItem key={o} value={o} onSelect={() => { onChange(o); setOpen(false); setQuery(""); }}>
                                    <Check className={cn("mr-2 h-4 w-4", value === o ? "opacity-100" : "opacity-0")} />
                                    {o}
                                </CommandItem>
                            ))}
                            {trimmed && !exactMatch && (
                                <CommandItem value={`__custom__${trimmed}`} onSelect={() => { onChange(trimmed); setOpen(false); setQuery(""); }}>
                                    <Check className="mr-2 h-4 w-4 opacity-0" />
                                    Use "{trimmed}"
                                </CommandItem>
                            )}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
