"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Loader2, X } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce"; // We might need to create this if it doesn't exist, or use a custom hook inside.

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";

export interface AsyncFilterMultiSelectProps {
    label: string;
    icon?: React.ElementType;
    selected: string[];
    onChange: (values: string[]) => void;
    fetcher: (query: string, limit?: number, filters?: any) => Promise<{ results: string[], totalCount: number }>;
    initialOptions?: string[];
    placeholder?: string;
    filters?: any;
}

const DEFAULT_OPTIONS: string[] = [];

export function AsyncFilterMultiSelect({
    label,
    icon: Icon,
    selected,
    onChange,
    fetcher,
    initialOptions = DEFAULT_OPTIONS,
    placeholder = "Search...",
    filters,
}: AsyncFilterMultiSelectProps) {
    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState("");
    const [options, setOptions] = React.useState<string[]>(initialOptions);
    const [totalCount, setTotalCount] = React.useState(0);
    const [loading, setLoading] = React.useState(false);

    // Batching State
    const [tempSelected, setTempSelected] = React.useState<string[]>(selected);

    // Sync tempSelected with parent selected when popover opens
    React.useEffect(() => {
        if (open) {
            setTempSelected(selected);
        }
    }, [open, selected]);

    const handleToggle = (option: string) => {
        setTempSelected(prev =>
            prev.includes(option)
                ? prev.filter(i => i !== option)
                : [...prev, option]
        );
    };

    const handleApply = () => {
        onChange(tempSelected);
        setOpen(false);
    };

    const handleClear = () => {
        setTempSelected([]);
    };

    // Debounce the search query
    const [debouncedQuery, setDebouncedQuery] = React.useState(query);

    React.useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedQuery(query);
        }, 300); // 300ms debounce

        return () => clearTimeout(timer);
    }, [query]);

    React.useEffect(() => {
        let active = true;

        async function fetchData() {
            const hasFilters = filters && Object.values(filters).some(v => Array.isArray(v) ? v.length > 0 : !!v);

            if (!debouncedQuery && !hasFilters && initialOptions.length > 0) {
                setOptions(initialOptions);
                setTotalCount(initialOptions.length);
                return;
            }

            setLoading(true);
            try {
                const response = await fetcher(debouncedQuery || "", 1000, filters);
                if (active) {
                    setOptions(response.results || []);
                    setTotalCount(response.totalCount || 0);
                }
            } catch (error) {
                console.error("Async Select Fetch Error:", error);
                if (active) {
                    setOptions([]);
                    setTotalCount(0);
                }
            } finally {
                if (active) setLoading(false);
            }
        }

        fetchData();
        return () => { active = false; };
    }, [debouncedQuery, filters, fetcher, initialOptions]);


    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    size="sm"
                    className={cn(
                        "h-9 gap-2 border-dashed bg-background",
                        selected.length > 0 && "border-primary/50 bg-primary/5"
                    )}
                >
                    {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
                    {label}
                    {selected.length > 0 && (
                        <Badge
                            variant="secondary"
                            className="ml-1 h-5 px-1 text-[10px] bg-primary text-primary-foreground"
                        >
                            {selected.length}
                        </Badge>
                    )}
                    <ChevronsUpDown className="ml-auto h-3 w-3 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[350px] p-0" align="start">
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder={placeholder}
                        value={query}
                        onValueChange={setQuery}
                    />
                    <CommandList>
                        {loading ? (
                            <div className="flex items-center justify-center p-4">
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <>
                                {options.length === 0 && <CommandEmpty>No results found.</CommandEmpty>}
                                {options.length > 0 && (
                                    <div className="flex items-center justify-between px-2 py-1.5 bg-secondary/20 border-b">
                                        <span className="text-[10px] text-muted-foreground font-medium">Found {totalCount} results</span>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-5 text-[10px] px-2 hover:bg-background"
                                            onClick={() => {
                                                const newItems = options.filter(o => !tempSelected.includes(o));
                                                if (newItems.length > 0) {
                                                    setTempSelected(prev => [...prev, ...newItems]);
                                                }
                                            }}
                                        >
                                            Select All
                                        </Button>
                                    </div>
                                )}
                                <CommandGroup heading={query ? "Search Results" : "Recent / Suggested"}>
                                    {options.map((option, idx) => {
                                        const isSelected = tempSelected.includes(option);
                                        return (
                                            <CommandItem
                                                key={`${option}-${idx}`}
                                                value={option}
                                                onSelect={() => handleToggle(option)}
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
                                                <span className="truncate">
                                                    {(() => {
                                                        if (!query) return option;
                                                        const parts = option.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
                                                        return parts.map((part, i) =>
                                                            part.toLowerCase() === query.toLowerCase() ? <span key={i} className="font-bold bg-yellow-100 dark:bg-yellow-900/40 text-primary">{part}</span> : part
                                                        );
                                                    })()}
                                                </span>
                                            </CommandItem>
                                        );
                                    })}
                                </CommandGroup>
                            </>
                        )}

                        {tempSelected.length > 0 && (
                            <div className="border-t pt-1 mt-1">
                                <CommandGroup heading="Selected Current">
                                    {tempSelected.map((item, idx) => {
                                        if (options.includes(item)) return null;
                                        return (
                                            <CommandItem
                                                key={`${item}-${idx}`}
                                                value={item}
                                                onSelect={() => handleToggle(item)}
                                            >
                                                <div className="mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary bg-primary text-primary-foreground">
                                                    <Check className="h-4 w-4" />
                                                </div>
                                                {item}
                                            </CommandItem>
                                        )
                                    })}
                                </CommandGroup>
                            </div>
                        )}
                    </CommandList>
                    <div className="flex items-center justify-between p-2 border-t bg-slate-50">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs font-bold text-slate-500 hover:text-red-500"
                            onClick={handleClear}
                        >
                            Clear All
                        </Button>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs px-3"
                                onClick={() => setOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                size="sm"
                                className="h-8 text-xs px-4 bg-primary text-white font-bold"
                                onClick={handleApply}
                            >
                                Apply Filters ({tempSelected.length})
                            </Button>
                        </div>
                    </div>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
