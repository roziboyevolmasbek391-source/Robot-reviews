"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Menu, X, ChevronLeft, ChevronRight } from "lucide-react";

interface User {
  username: string;
  fullName: string;
  role: "ADMIN" | "MANAGER" | "OPERATOR";
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  useEffect(() => {
    // Client-side initialization for localStorage to prevent hydration errors
    const collapsed = localStorage.getItem("sidebar-collapsed") === "true";
    setIsSidebarCollapsed(collapsed);
  }, []);

  const toggleSidebar = () => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  };

  useEffect(() => {
    // Pathname o'zgarganda mobile sidebar yopiladi
    setIsMobileSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    // Profil ma'lumotlarini yuklash
    fetch("/api/auth/me")
      .then(async (res) => {
        if (res.status === 401) {
          window.location.href = "/login";
        } else if (res.ok) {
          const data = await res.json();
          setUser(data.user);
        }
      })
      .catch(() => {});
  }, [router]);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/login";
    } catch (e) {
      console.error("Logout error:", e);
    }
  };

  const navItems = [
    { href: "/overview", label: "Обзор дашборда", icon: "📊" },
    { href: "/vendors", label: "Службы доставки", icon: "🛵" },
    { href: "/maps-reviews", label: "Центр отзывов карт", icon: "🗺️" },
    { href: "/admin/branches", label: "Филиалы", icon: "🏢" },
  ];

  const adminItems = [
    { href: "/admin/settings", label: "Настройки API & Системы", icon: "⚙️" },
    { href: "/admin/logs", label: "Логи синхронизации", icon: "📑" },
  ];

  return (
    <div className="dark flex h-screen w-screen bg-slate-950 font-sans text-slate-100 overflow-hidden relative">
      {/* Mobile Sidebar Backdrop Overlay */}
      {isMobileSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-40 md:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-slate-900 bg-slate-950 flex flex-col h-full shrink-0 transition-all duration-300 transform md:relative md:translate-x-0 md:bg-slate-900/40 md:backdrop-blur-xl ${
        isSidebarCollapsed ? "md:w-16" : "md:w-64"
      } ${
        isMobileSidebarOpen 
          ? "translate-x-0 visible pointer-events-auto" 
          : "-translate-x-full invisible md:visible pointer-events-none md:pointer-events-auto"
      }`}>
        <div className={`h-16 flex items-center px-6 border-b border-slate-900 shrink-0 ${
          isSidebarCollapsed ? "md:px-4 md:justify-center" : "justify-between"
        }`}>
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white font-bold text-lg">
              💬
            </div>
            <span className={`font-bold text-lg tracking-tight text-white transition-all ${
              isSidebarCollapsed ? "md:hidden" : "block"
            }`}>ReviewMonitor</span>
          </div>
          <button 
            onClick={() => setIsMobileSidebarOpen(false)}
            className="p-1 text-slate-400 hover:text-white md:hidden focus:outline-none cursor-pointer relative z-50"
            aria-label="Закрыть меню"
          >
            <X className="h-5 w-5 pointer-events-none" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-7 overflow-y-auto">
          {/* Dashboard Items */}
          <div className="space-y-1">
            <p className={`px-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 transition-all ${
              isSidebarCollapsed ? "md:hidden" : "block"
            }`}>Основные панели</p>
            {navItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link key={item.href} href={item.href}>
                  <span className={`flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition duration-200 gap-3 border ${
                    isActive 
                      ? "bg-violet-600/15 text-violet-400 border-violet-500/10" 
                      : "text-slate-400 hover:bg-slate-900 hover:text-white border-transparent"
                  } ${
                    isSidebarCollapsed ? "md:justify-center md:px-2" : ""
                  }`} title={isSidebarCollapsed ? item.label : undefined}>
                    <span className="text-base shrink-0">{item.icon}</span>
                    <span className={`transition-all duration-200 ${isSidebarCollapsed ? "md:hidden" : "block"}`}>
                      {item.label}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>

          {/* Admin Items (Faqat ADMIN uchun) */}
          {user?.role === "ADMIN" && (
            <div className="space-y-1">
              <p className={`px-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 transition-all ${
                isSidebarCollapsed ? "md:hidden" : "block"
              }`}>Управление (Админ)</p>
              {adminItems.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link key={item.href} href={item.href}>
                    <span className={`flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition duration-200 gap-3 border ${
                      isActive 
                        ? "bg-violet-600/15 text-violet-400 border-violet-500/10" 
                        : "text-slate-400 hover:bg-slate-900 hover:text-white border-transparent"
                    } ${
                      isSidebarCollapsed ? "md:justify-center md:px-2" : ""
                    }`} title={isSidebarCollapsed ? item.label : undefined}>
                      <span className="text-base shrink-0">{item.icon}</span>
                      <span className={`transition-all duration-200 ${isSidebarCollapsed ? "md:hidden" : "block"}`}>
                        {item.label}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </nav>

        {/* Footer / User Profile */}
        <div className={`p-4 border-t border-slate-900 bg-slate-900/20 shrink-0 ${
          isSidebarCollapsed ? "md:p-2 md:flex md:flex-col md:items-center md:space-y-3" : "space-y-3"
        }`}>
          <div className={`flex items-center gap-3 ${isSidebarCollapsed ? "md:justify-center" : ""}`}>
            <div className="h-9 w-9 shrink-0 rounded-full bg-violet-600/20 text-violet-400 border border-violet-500/20 flex items-center justify-center font-semibold text-sm" title={user?.fullName}>
              {user?.fullName ? user.fullName.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase() : "AD"}
            </div>
            <div className={`overflow-hidden transition-all ${isSidebarCollapsed ? "md:hidden" : "block"}`}>
              <p className="text-sm font-medium text-white truncate">{user?.fullName || "Пользователь"}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider truncate">{user?.role || "OPERATOR"}</p>
            </div>
          </div>
          <Button 
            onClick={handleLogout}
            variant="outline" 
            className={`border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900 text-xs ${
              isSidebarCollapsed ? "md:w-9 md:h-9 md:p-0 md:flex md:items-center md:justify-center" : "w-full py-1.5"
            }`}
            title="Выйти из системы"
          >
            {isSidebarCollapsed ? "👋" : "Выйти из системы 👋"}
          </Button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b border-slate-900 px-4 md:px-8 flex items-center justify-between bg-slate-900/10 shrink-0 gap-2">
          <div className="flex items-center gap-3 overflow-hidden">
            <button 
              onClick={() => setIsMobileSidebarOpen(true)}
              className="p-2 -ml-2 text-slate-400 hover:text-white md:hidden focus:outline-none cursor-pointer relative z-50"
              aria-label="Открыть меню"
            >
              <Menu className="h-6 w-6 pointer-events-none" />
            </button>
            {/* Desktop Sidebar Toggle Button */}
            <button 
              onClick={toggleSidebar}
              className="hidden md:flex p-2 text-slate-400 hover:text-white hover:bg-slate-800/30 focus:outline-none cursor-pointer rounded-lg transition-colors shrink-0"
              aria-label={isSidebarCollapsed ? "Развернуть меню" : "Свернуть меню"}
            >
              {isSidebarCollapsed ? (
                <ChevronRight className="h-5 w-5" />
              ) : (
                <ChevronLeft className="h-5 w-5" />
              )}
            </button>
            <h1 className="text-base md:text-lg font-bold text-white tracking-tight truncate">
              {pathname === "/overview" && "Обзор дашборда"}
              {pathname === "/vendors" && "Службы доставки"}
              {pathname.startsWith("/maps-reviews") && "Центр отзывов карт"}
              {pathname === "/admin/branches" && "Управление филиалами"}
              {pathname === "/admin/settings" && "Настройки API & Системы"}
              {pathname === "/admin/logs" && "Логи синхронизации"}
            </h1>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <div className="text-[10px] md:text-xs text-slate-500 bg-slate-900 border border-slate-800 px-2.5 py-1.5 rounded-full flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span className="hidden sm:inline">Синхронизатор:</span> Активен (Cron)
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-950">
          {children}
        </main>
      </div>
    </div>
  );
}
