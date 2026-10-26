import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { Sidebar } from "@/components/sidebar";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listBanners } from "@/app/actions/org";
import { effectiveCompVisibility } from "@/lib/permissions";
import { CompVisibilityProvider } from "@/components/comp-visibility";
import { UnsavedChangesProvider } from "@/components/unsaved-changes";

const jakarta = Plus_Jakarta_Sans({
    subsets: ["latin"],
    variable: "--font-jakarta",
    display: "swap",
    weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
    title: "Royal Flush ATS",
    description: "Integrated People, Compensation and Performance Management Platform",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
    // Standalone edition: no login — this is always the fixed local operator.
    const user = await getCurrentUser();
    const banners = user ? await listBanners() : [];
    return (
        <html lang="en" className={jakarta.variable}>
            <body className="min-h-dvh lg:h-screen lg:overflow-hidden bg-[#f1f5f9] font-sans antialiased">
                <UnsavedChangesProvider>
                    <div className="flex min-h-dvh lg:h-full flex-col lg:flex-row">
                        {user && <Sidebar user={user} banners={banners} />}
                        <main className="flex-1 min-h-0 lg:overflow-y-auto">
                            <CompVisibilityProvider value={effectiveCompVisibility(user)}>
                                {children}
                            </CompVisibilityProvider>
                        </main>
                    </div>
                </UnsavedChangesProvider>
                <Toaster position="top-right" richColors />
            </body>
        </html>
    );
}
