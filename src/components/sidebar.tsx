"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
    Search, Menu, X, Settings, ChevronDown, ChevronLeft,
    Users, BarChart3, Briefcase, LineChart, LayoutGrid, Layers, FileText, Book,
} from "lucide-react";
import type { AppUser } from "@/lib/auth/types";
import { useUnsavedChangesGuard } from "@/components/unsaved-changes";

const ROLE_LABEL: Record<string, string> = { super: "Super user", regular: "Regular", dev: "Developer" };
function initials(name: string) {
    return name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
}

const COLLAPSE_KEY = "rf-sidebar-collapsed";

// The three "/org/*" structure pages live inside a single "Org" accordion
// instead of three always-visible tabs — Succession Plan stays top-level
// since it's a distinct destination, not another org-structure view.
const ORG_LINKS = [
    { href: "/org/banner", label: "By Company" },
    { href: "/org/function", label: "By Function" },
    { href: "/org/headcount", label: "FTE" },
];

function isOrgActive(pathname: string) {
    return ORG_LINKS.some((l) => pathname === l.href || pathname.startsWith(l.href + "/"));
}

const NAV_ITEMS = [
    { href: "/employees", label: "Employees", icon: Users },
    { href: "/performance", label: "Performance", icon: BarChart3 },
    { href: "/positions", label: "Positions", icon: Briefcase },
    { href: "/comparison_v2", label: "Comparison", icon: LineChart },
];

interface QuickBanner { banner_id: number; name: string }

export function Sidebar({ user, banners }: { user: AppUser; banners: QuickBanner[] }) {
    const pathname = usePathname();
    const router = useRouter();
    const { requestNavigation } = useUnsavedChangesGuard();

    const [collapsed, setCollapsedState] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [q, setQ] = useState("");

    const orgActive = isOrgActive(pathname);
    const [orgOpen, setOrgOpen] = useState(orgActive);
    // Auto-open the accordion whenever navigation lands on an /org/* route;
    // a manual close elsewhere is otherwise left alone.
    useEffect(() => {
        if (orgActive) setOrgOpen(true);
    }, [orgActive]);

    // Read persisted collapse state after mount (avoids an SSR/client mismatch).
    useEffect(() => {
        setCollapsedState(localStorage.getItem(COLLAPSE_KEY) === "1");
    }, []);

    function setCollapsed(v: boolean) {
        setCollapsedState(v);
        localStorage.setItem(COLLAPSE_KEY, v ? "1" : "0");
    }

    const displayName = user.display_name || user.email;

    function submitSearch(e: React.FormEvent) {
        e.preventDefault();
        const query = q.trim();
        const href = query ? `/employees?q=${encodeURIComponent(query)}` : "/employees";
        requestNavigation(href, () => router.push(href));
        setQ("");
        setMobileOpen(false);
    }

    return (
        <>
            {/* Desktop rail */}
            <aside
                className={cn(
                    "hidden lg:flex flex-col shrink-0 bg-[#0b1f3a] text-white h-dvh sticky top-0 overflow-hidden transition-[width] duration-[180ms] ease-in-out",
                    collapsed ? "w-[72px]" : "w-[232px]"
                )}
            >
                {/* Brand */}
                <div className="flex items-center gap-2 px-4 py-[18px] shrink-0">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="shrink-0">
                        <path d="M5 18h14l1.2-9.3-4 2.8L12 5l-4.2 6.5-4-2.8L5 18Z" fill="#facc15" />
                    </svg>
                    {!collapsed && (
                        <div className="min-w-0 overflow-hidden whitespace-nowrap">
                            <div className="font-extrabold text-[15px] tracking-[.04em]">ROYAL FLUSH</div>
                            <span className="rounded bg-gold-light/20 px-1.5 py-0.5 text-[10px] font-semibold text-gold-light">1.0 beta</span>
                        </div>
                    )}
                </div>

                {/* Search */}
                <div className="px-3 pb-3 shrink-0">
                    {!collapsed ? (
                        <form
                            onSubmit={submitSearch}
                            className="flex items-center gap-2 rounded-lg border border-white/[.12] bg-white/[.08] px-2.5 py-[7px] text-[13px] focus-within:border-white/30 transition-colors"
                        >
                            <Search className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                            <input
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder="Search employees, roles…"
                                className="flex-1 min-w-0 bg-transparent outline-none placeholder:text-slate-400 text-white"
                            />
                        </form>
                    ) : (
                        <button
                            type="button"
                            aria-label="Search"
                            title="Search"
                            onClick={() => setCollapsed(false)}
                            className="flex w-full justify-center rounded-lg bg-white/[.08] py-2 text-slate-400 hover:text-white transition-colors"
                        >
                            <Search className="h-4 w-4" />
                        </button>
                    )}
                </div>

                {/* Nav */}
                <nav className="flex-1 min-h-0 overflow-y-auto px-2.5 py-1 flex flex-col gap-0.5">
                    {!collapsed && (
                        <div className="px-2.5 pt-2 pb-0.5 text-[10.5px] font-bold tracking-[.08em] text-gold-light/65 uppercase">
                            Workspace
                        </div>
                    )}

                    {NAV_ITEMS.map((item) => (
                        <SidebarLink key={item.href} {...item} pathname={pathname} collapsed={collapsed} />
                    ))}

                    {/* Org accordion */}
                    <button
                        type="button"
                        onClick={() => setOrgOpen((v) => !v)}
                        title="Org"
                        className={cn(
                            "flex items-center gap-2.5 rounded-lg px-2 py-[9px] text-[13.5px] border-l-2 transition-colors text-left w-full font-sans",
                            orgActive || orgOpen ? "text-white font-semibold" : "text-white/60 hover:bg-white/10 hover:text-white font-medium",
                            orgActive ? "bg-white/[.14] border-gold-light" : "border-transparent"
                        )}
                    >
                        <LayoutGrid className="h-[17px] w-[17px] shrink-0" />
                        {!collapsed && (
                            <>
                                <span className="flex-1 min-w-0 truncate">Org</span>
                                <ChevronDown className={cn("h-[13px] w-[13px] opacity-60 transition-transform shrink-0", orgOpen && "rotate-180")} />
                            </>
                        )}
                    </button>

                    {orgOpen && !collapsed && (
                        <div className="flex flex-col gap-px pl-[27px] my-0.5 mb-1">
                            <OrgSubLink href="/org/banner" label="By Company" pathname={pathname} />
                            {banners.slice(0, 4).map((b) => (
                                <GuardedLink
                                    key={b.banner_id}
                                    href={`/org/banner?company=${b.banner_id}`}
                                    title={`${b.name} — org chart`}
                                    className="flex items-center gap-2 rounded-md px-2.5 py-1.5 pl-3.5 text-[12.5px] text-white/60 hover:bg-white/10 hover:text-white/90 transition-colors"
                                >
                                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] bg-white/[.14] text-[8px] font-extrabold text-white/85">
                                        {initials(b.name)}
                                    </span>
                                    <span className="flex-1 min-w-0 truncate">{b.name}</span>
                                </GuardedLink>
                            ))}
                            <GuardedLink
                                href="/org/banner"
                                className="px-2.5 py-1.5 pl-3.5 text-[12px] font-semibold text-gold-light hover:text-gold-light/80 transition-colors"
                            >
                                View all companies →
                            </GuardedLink>
                            <OrgSubLink href="/org/function" label="By Function" pathname={pathname} className="mt-1" />
                            <OrgSubLink href="/org/headcount" label="FTE" pathname={pathname} />
                        </div>
                    )}

                    <SidebarLink href="/org/succession" label="Succession Plan" icon={Layers} pathname={pathname} collapsed={collapsed} />
                    <SidebarLink href="/proposals" label="Proposals" icon={FileText} pathname={pathname} collapsed={collapsed} />
                    <SidebarLink href="/documentation" label="Documentation" icon={Book} pathname={pathname} collapsed={collapsed} />
                </nav>

                {/* Footer */}
                <div className="border-t border-white/10 p-2.5 shrink-0 flex flex-col gap-0.5">
                    <SidebarLink href="/settings" label="Settings" icon={Settings} pathname={pathname} collapsed={collapsed} />

                    <div className="flex items-center gap-2.5 px-1.5 py-2">
                        <div className="h-[30px] w-[30px] shrink-0 rounded-full border-2 border-gold-light bg-gradient-to-br from-[#1e3a5f] to-[#0b1f3a] flex items-center justify-center text-[10.5px] font-bold text-gold-light">
                            {initials(displayName)}
                        </div>
                        {!collapsed && (
                            <div className="min-w-0 overflow-hidden">
                                <div className="truncate text-[12.5px] font-semibold text-white">{displayName}</div>
                                <div className="text-[11px] text-white/45">{ROLE_LABEL[user.role] ?? user.role}</div>
                            </div>
                        )}
                        <button
                            type="button"
                            aria-label="Toggle sidebar"
                            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                            onClick={() => setCollapsed(!collapsed)}
                            className="ml-auto shrink-0 h-[26px] w-[26px] rounded-[7px] bg-white/[.08] text-white/60 hover:text-white hover:bg-white/[.14] transition-colors flex items-center justify-center"
                        >
                            <ChevronLeft className={cn("h-3.5 w-3.5 transition-transform", collapsed && "rotate-180")} />
                        </button>
                    </div>
                </div>
            </aside>

            {/* Mobile top bar + drawer — the reference designs don't cover mobile;
                this carries over the old AppNav's hamburger/drawer pattern below
                the sidebar's lg breakpoint. */}
            <header className="lg:hidden flex-none bg-[#0b1f3a] text-white z-40">
                <div className="h-14 flex items-center gap-3 px-4">
                    <GuardedLink href="/" className="flex items-center gap-2 tracking-widest shrink-0">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                            <path d="M5 18h14l1.2-9.3-4 2.8L12 5l-4.2 6.5-4-2.8L5 18Z" fill="#facc15" />
                        </svg>
                        <span className="font-extrabold text-[15px]">ROYAL FLUSH</span>
                    </GuardedLink>
                    <button
                        type="button"
                        aria-label={mobileOpen ? "Close menu" : "Open menu"}
                        aria-expanded={mobileOpen}
                        onClick={() => setMobileOpen((v) => !v)}
                        className="ml-auto flex items-center justify-center h-9 w-9 rounded-lg text-white/80 hover:bg-white/10 hover:text-white transition-colors shrink-0"
                    >
                        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                    </button>
                </div>
                {mobileOpen && (
                    <div className="border-t border-white/10 px-4 pb-4 pt-3">
                        <form onSubmit={submitSearch} className="flex items-center gap-2 rounded-lg border border-white/[.12] bg-white/[.08] px-3 py-2 text-[13px] mb-3">
                            <Search className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                            <input
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder="Search employees, roles…"
                                className="flex-1 min-w-0 bg-transparent outline-none placeholder:text-slate-400 text-white"
                            />
                        </form>
                        <nav className="flex flex-col gap-1 text-[14px] font-medium">
                            {NAV_ITEMS.map((item) => (
                                <MobileNavLink key={item.href} href={item.href} label={item.label} pathname={pathname} onNavigate={() => setMobileOpen(false)} />
                            ))}

                            <MobileOrgSection pathname={pathname} onNavigate={() => setMobileOpen(false)} />

                            <MobileNavLink href="/org/succession" label="Succession Plan" pathname={pathname} onNavigate={() => setMobileOpen(false)} />
                            <MobileNavLink href="/proposals" label="Proposals" pathname={pathname} onNavigate={() => setMobileOpen(false)} />
                            <MobileNavLink href="/documentation" label="Documentation" pathname={pathname} onNavigate={() => setMobileOpen(false)} />
                            <MobileNavLink href="/settings" label="Settings" pathname={pathname} onNavigate={() => setMobileOpen(false)} />
                        </nav>
                    </div>
                )}
            </header>
        </>
    );
}

// Every nav-triggered navigation routes through this instead of a plain
// <Link> so a page with unsaved changes (see UnsavedChangesProvider) gets a
// chance to confirm before leaving. With no guard registered — every page
// except one with unsaved changes — this behaves exactly like <Link>.
function GuardedLink({ href, onNavigate, children, ...props }: React.ComponentProps<typeof Link> & { onNavigate?: () => void }) {
    const router = useRouter();
    const { requestNavigation } = useUnsavedChangesGuard();
    return (
        <Link
            href={href}
            onClick={(e) => {
                e.preventDefault();
                onNavigate?.();
                requestNavigation(href.toString(), () => router.push(href.toString()));
            }}
            {...props}
        >
            {children}
        </Link>
    );
}

function SidebarLink({
    href, label, icon: Icon, pathname, collapsed,
}: {
    href: string; label: string; icon: React.ComponentType<{ className?: string }>; pathname: string; collapsed: boolean;
}) {
    const active = pathname === href || pathname.startsWith(href + "/");
    return (
        <GuardedLink
            href={href}
            title={label}
            className={cn(
                "flex items-center gap-2.5 rounded-lg px-2 py-[9px] text-[13.5px] border-l-2 transition-colors",
                active ? "bg-white/[.14] text-white font-semibold border-gold-light" : "text-white/60 hover:bg-white/10 hover:text-white font-medium border-transparent"
            )}
        >
            <Icon className="h-[17px] w-[17px] shrink-0" />
            {!collapsed && <span className="flex-1 min-w-0 truncate">{label}</span>}
        </GuardedLink>
    );
}

function OrgSubLink({ href, label, pathname, className }: { href: string; label: string; pathname: string; className?: string }) {
    const active = pathname === href || pathname.startsWith(href + "/");
    return (
        <GuardedLink
            href={href}
            className={cn(
                "rounded-md px-2.5 py-[7px] text-[13px] transition-colors",
                active ? "text-white font-semibold" : "text-white/55 font-medium hover:text-white/80",
                className
            )}
        >
            {label}
        </GuardedLink>
    );
}

function MobileNavLink({ href, label, pathname, onNavigate }: { href: string; label: string; pathname: string; onNavigate: () => void }) {
    const active = pathname === href || pathname.startsWith(href + "/");
    return (
        <GuardedLink
            href={href}
            onNavigate={onNavigate}
            className={cn(
                "px-3 py-2.5 rounded-lg transition-colors",
                active ? "bg-white/[.14] text-white font-semibold" : "text-white/70 hover:bg-white/10 hover:text-white"
            )}
        >
            {label}
        </GuardedLink>
    );
}

function MobileOrgSection({ pathname, onNavigate }: { pathname: string; onNavigate: () => void }) {
    const orgActive = isOrgActive(pathname);
    const [open, setOpen] = useState(orgActive);
    return (
        <>
            <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
                className={cn(
                    "flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors text-left",
                    orgActive ? "bg-white/[.14] text-white font-semibold" : "text-white/70 hover:bg-white/10 hover:text-white"
                )}
            >
                Org <ChevronDown className={cn("h-3.5 w-3.5 opacity-70 transition-transform", open && "rotate-180")} />
            </button>
            {open && (
                <div className="flex flex-col gap-1 pl-3">
                    {ORG_LINKS.map((l) => {
                        const active = pathname === l.href || pathname.startsWith(l.href + "/");
                        return (
                            <GuardedLink
                                key={l.href}
                                href={l.href}
                                onNavigate={onNavigate}
                                className={cn(
                                    "px-3 py-2 rounded-lg text-[13.5px] transition-colors",
                                    active ? "bg-white/[.14] text-white font-semibold" : "text-white/60 hover:bg-white/10 hover:text-white"
                                )}
                            >
                                {l.label}
                            </GuardedLink>
                        );
                    })}
                </div>
            )}
        </>
    );
}
