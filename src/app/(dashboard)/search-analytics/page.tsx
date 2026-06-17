"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Search, Calendar as CalendarIcon, MapPin, Compass, TrendingUp, BarChart2, Building2 } from "lucide-react";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  Cell,
  CartesianGrid,
} from "recharts";

interface SearchStatsData {
  summary: {
    totalSearches: number;
  };
  charts: {
    searchesByPlatform: Array<{ name: string; value: number; key: string }>;
    searchesByQuery: Array<{ name: string; value: number }>;
    searchesTimeline: Array<{
      date: string;
      count: number;
      GOOGLE_MAPS?: number;
      YANDEX_MAPS?: number;
      YANDEX_VENDOR?: number;
      DGIS?: number;
      UZUM_VENDOR?: number;
    }>;
    searchesByBranch: Array<{ id: string; name: string; value: number }>;
  };
}

export default function SearchAnalyticsPage() {
  const [data, setData] = useState<SearchStatsData | null>(null);
  const [branches, setBranches] = useState<any[]>([]);
  const [selectedBranch, setSelectedBranch] = useState("all");
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  // Sana filtrlari state'lari
  const [dateRange, setDateRange] = useState<string>("month"); // Default to last 30 days
  const [customDays, setCustomDays] = useState<string>("");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  // Kalendar popoveri state'lari
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [selectedRange, setSelectedRange] = useState<DateRange | undefined>(undefined);

  useEffect(() => {
    setMounted(true);
    // Filiallarni yuklash
    fetch("/api/branches")
      .then((res) => res.json())
      .then((d) => setBranches(d.branches || []))
      .catch((e) => console.error("Error loading branches", e));
  }, []);

  const getQueryParams = () => {
    const params = new URLSearchParams();
    if (selectedBranch !== "all") {
      params.append("branchId", selectedBranch);
    }

    const now = new Date();
    if (dateRange === "today") {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      params.append("dateFrom", today.toISOString());
      params.append("dateTo", now.toISOString());
    } else if (dateRange === "yesterday") {
      const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const yesterdayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
      params.append("dateFrom", yesterday.toISOString());
      params.append("dateTo", yesterdayEnd.toISOString());
    } else if (dateRange === "week") {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      params.append("dateFrom", weekAgo.toISOString());
      params.append("dateTo", now.toISOString());
    } else if (dateRange === "month") {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // Past 30 days
      params.append("dateFrom", monthAgo.toISOString());
      params.append("dateTo", now.toISOString());
    } else if (dateRange === "custom_days" && customDays) {
      const days = parseInt(customDays);
      if (!isNaN(days) && days > 0) {
        const daysAgo = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        params.append("dateFrom", daysAgo.toISOString());
        params.append("dateTo", now.toISOString());
      }
    } else if (dateRange === "custom_range") {
      if (customFrom) {
        const fromDate = new Date(customFrom);
        params.append("dateFrom", fromDate.toISOString());
      }
      if (customTo) {
        const toDate = new Date(customTo);
        toDate.setHours(23, 59, 59, 999);
        params.append("dateTo", toDate.toISOString());
      }
    }
    return params.toString();
  };

  useEffect(() => {
    setLoading(true);
    const query = getQueryParams();
    const url = query ? `/api/reviews/stats?${query}` : "/api/reviews/stats";

    fetch(url)
      .then((res) => res.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        console.error("Error loading stats", e);
        setData(null);
        setLoading(false);
      });
  }, [selectedBranch, refetchTrigger]);

  // Sana presets va selectedRange sinxronizatsiyasi
  useEffect(() => {
    const now = new Date();
    if (dateRange === "today") {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      setSelectedRange({ from: today, to: now });
    } else if (dateRange === "yesterday") {
      const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const yesterdayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
      setSelectedRange({ from: yesterday, to: yesterdayEnd });
    } else if (dateRange === "week") {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      setSelectedRange({ from: weekAgo, to: now });
    } else if (dateRange === "month") {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      setSelectedRange({ from: monthAgo, to: now });
    } else if (dateRange === "all") {
      setSelectedRange(undefined);
    }
  }, [dateRange]);

  // Popoverdan tashqariga bosilganda yopish
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (datePickerOpen && !target.closest(".date-picker-popover-container")) {
        setDatePickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [datePickerOpen]);

  if (loading || !data || !mounted) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-slate-400">
        Загрузка поисковой аналитики...
      </div>
    );
  }

  // Calculate: Top navigator/maps platform for routes
  const searchesByPlatform = data.charts.searchesByPlatform || [];
  const navPlatforms = [
    { name: "Yandex Maps", value: searchesByPlatform.find(p => p.key === "YANDEX_MAPS")?.value || 0, color: "text-red-400" },
    { name: "Google Maps", value: searchesByPlatform.find(p => p.key === "GOOGLE_MAPS")?.value || 0, color: "text-blue-400" },
    { name: "2GIS", value: searchesByPlatform.find(p => p.key === "DGIS")?.value || 0, color: "text-emerald-400" }
  ];
  const sortedNavs = [...navPlatforms].sort((a, b) => b.value - a.value);
  const topNavigator = sortedNavs[0]?.value > 0 ? sortedNavs[0] : { name: "Нет данных", value: 0, color: "text-slate-400" };
  const totalNavSearches = navPlatforms.reduce((sum, p) => sum + p.value, 0);
  const navigatorPercent = totalNavSearches > 0 ? Math.round((topNavigator.value / totalNavSearches) * 100) : 0;

  // Calculate: Most searched branch
  const searchesByBranch = data.charts.searchesByBranch || [];
  const topBranch = searchesByBranch[0] || { name: "Нет данных", value: 0 };
  const totalBranchSearches = searchesByBranch.reduce((sum, b) => sum + b.value, 0);
  const branchPercent = totalBranchSearches > 0 ? Math.round((topBranch.value / totalBranchSearches) * 100) : 0;

  return (
    <div className="space-y-8 max-w-7xl mx-auto animate-in fade-in duration-500">
      {/* Filters (Branch & Date) */}
      <div className="bg-slate-900/40 border border-slate-800/80 p-5 rounded-2xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <Search className="h-6 w-6 text-violet-400" />
              <span>Аналитика поисковых запросов</span>
            </h2>
            <p className="text-slate-400 text-sm">Данные о популярности бренда "Mazzali" в поисковых системах карт и агрегаторах</p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center">
            {/* Branch Selector */}
            <div className="flex flex-col gap-1 w-full sm:w-64">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Филиал</span>
              <Select value={selectedBranch} onValueChange={(val) => setSelectedBranch(val || "all")}>
                <SelectTrigger className="bg-slate-950 border-slate-800 text-white hover:bg-slate-900/60 transition-colors">
                  <SelectValue>
                    {selectedBranch === "all" 
                      ? "Все филиалы" 
                      : branches.find(b => b.id === selectedBranch)?.name || "Все филиалы"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-slate-950 border-slate-800 text-white">
                  <SelectItem value="all">Все филиалы</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date Range Selector */}
            <div className="flex flex-col gap-1 w-full sm:w-64 relative date-picker-popover-container">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Период времени</span>
              <button
                type="button"
                onClick={() => setDatePickerOpen(!datePickerOpen)}
                className="flex items-center justify-between bg-slate-950 border border-slate-800 text-white rounded-md h-10 px-3 text-sm hover:bg-slate-900/60 transition-colors w-full text-left"
              >
                <span className="truncate">
                  {dateRange === "all" ? "За все время" :
                   dateRange === "today" ? "Сегодня" :
                   dateRange === "yesterday" ? "Вчера" :
                   dateRange === "week" ? "На этой неделе" :
                   dateRange === "month" ? "Последние 30 дней" :
                   dateRange === "custom_days" ? `Последние ${customDays || 0} дней` :
                   selectedRange?.from ? (
                     `${format(selectedRange.from, "dd MMM yyyy", { locale: ru })}` +
                     (selectedRange.to ? ` - ${format(selectedRange.to, "dd MMM yyyy", { locale: ru })}` : "")
                   ) : "Выбрать даты"}
                </span>
                <CalendarIcon className="h-4 w-4 text-slate-400 shrink-0 ml-1.5" />
              </button>

              {datePickerOpen && (
                <div className="absolute right-0 top-12 z-50 flex flex-col md:flex-row bg-slate-950 border border-slate-800 rounded-xl shadow-2xl p-4 gap-4 animate-in fade-in duration-200 min-w-[320px] md:min-w-[550px]">
                  {/* Presets */}
                  <div className="flex flex-col gap-2 border-b md:border-b-0 md:border-r border-slate-800/80 pb-4 md:pb-0 pr-0 md:pr-4 w-full md:w-44 shrink-0">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Быстрый выбор</span>
                    <button
                      type="button"
                      onClick={() => {
                        setDateRange("all");
                        setDatePickerOpen(false);
                        setRefetchTrigger(prev => prev + 1);
                      }}
                      className={`text-left px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${dateRange === "all" ? "bg-violet-600 text-white" : "text-slate-300 hover:bg-slate-900"}`}
                    >
                      За все время
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDateRange("today");
                        setDatePickerOpen(false);
                        setRefetchTrigger(prev => prev + 1);
                      }}
                      className={`text-left px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${dateRange === "today" ? "bg-violet-600 text-white" : "text-slate-300 hover:bg-slate-900"}`}
                    >
                      Сегодня
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDateRange("yesterday");
                        setDatePickerOpen(false);
                        setRefetchTrigger(prev => prev + 1);
                      }}
                      className={`text-left px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${dateRange === "yesterday" ? "bg-violet-600 text-white" : "text-slate-300 hover:bg-slate-900"}`}
                    >
                      Вчера
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDateRange("week");
                        setDatePickerOpen(false);
                        setRefetchTrigger(prev => prev + 1);
                      }}
                      className={`text-left px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${dateRange === "week" ? "bg-violet-600 text-white" : "text-slate-300 hover:bg-slate-900"}`}
                    >
                      На этой неделе
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDateRange("month");
                        setDatePickerOpen(false);
                        setRefetchTrigger(prev => prev + 1);
                      }}
                      className={`text-left px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${dateRange === "month" ? "bg-violet-600 text-white" : "text-slate-300 hover:bg-slate-900"}`}
                    >
                      Последние 30 дней
                    </button>

                    <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-col gap-1.5">
                      <span className="text-[10px] font-bold text-slate-500 uppercase">Последние дней:</span>
                      <div className="flex gap-1">
                        <input
                          type="number"
                          placeholder="Дни"
                          value={customDays}
                          onChange={(e) => {
                            setDateRange("custom_days");
                            setCustomDays(e.target.value);
                            const days = parseInt(e.target.value);
                            if (!isNaN(days) && days > 0) {
                              const now = new Date();
                              const daysAgo = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
                              setSelectedRange({ from: daysAgo, to: now });
                            }
                          }}
                          className="bg-slate-900 border border-slate-800 text-white text-xs rounded-md h-7 px-2 w-full focus:outline-none focus:ring-1 focus:ring-violet-500"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (customDays) {
                              setDatePickerOpen(false);
                              setRefetchTrigger(prev => prev + 1);
                            }
                          }}
                          className="bg-violet-600 text-white text-xs rounded-md px-2 h-7 hover:bg-violet-700 font-semibold"
                        >
                          ОК
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Calendar */}
                  <div className="flex flex-col gap-3">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Выбрать диапазон</span>
                    <div className="bg-slate-900/40 rounded-xl border border-slate-800/40 p-1">
                      <Calendar
                        mode="range"
                        selected={selectedRange}
                        onSelect={(range) => {
                          setDateRange("custom_range");
                          setSelectedRange(range);
                        }}
                        locale={ru}
                        className="text-white bg-transparent"
                      />
                    </div>
                    <div className="flex justify-end gap-2 border-t border-slate-800/80 pt-3">
                      <button
                        type="button"
                        onClick={() => setDatePickerOpen(false)}
                        className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-slate-900 transition-colors"
                      >
                        Отмена
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedRange?.from) {
                            setCustomFrom(selectedRange.from.toISOString().split("T")[0]);
                            if (selectedRange.to) {
                              setCustomTo(selectedRange.to.toISOString().split("T")[0]);
                            } else {
                              setCustomTo(selectedRange.from.toISOString().split("T")[0]);
                            }
                            setDateRange("custom_range");
                            setDatePickerOpen(false);
                            setRefetchTrigger(prev => prev + 1);
                          }
                        }}
                        className="bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors"
                      >
                        Применить
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Global Search Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Card 1: Total Brand Searches */}
        <Card className="border-slate-800/80 bg-slate-900/35 hover:bg-slate-900/50 hover:border-slate-700/60 transition-all duration-300 shadow-md shadow-violet-950/2 hover:-translate-y-[2px] cursor-default group">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-400 group-hover:text-slate-300 transition-colors">Всего поисков бренда</CardTitle>
            <Search className="h-4.5 w-4.5 text-violet-400 group-hover:scale-110 transition-transform" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white tracking-tight">{data.summary.totalSearches.toLocaleString()}</div>
            <p className="text-xs text-slate-500 mt-1">Поисковые сессии Mazzali по всем каналам</p>
          </CardContent>
        </Card>

        {/* Card 2: Main Navigator / Routes Aggregator */}
        <Card className="border-slate-800/80 bg-slate-900/35 hover:bg-slate-900/50 hover:border-slate-700/60 transition-all duration-300 shadow-md shadow-violet-950/2 hover:-translate-y-[2px] cursor-default group">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-400 group-hover:text-slate-300 transition-colors">Чаще ездят на филиалы через</CardTitle>
            <Compass className="h-4.5 w-4.5 text-emerald-400 group-hover:scale-110 transition-transform" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white tracking-tight flex items-baseline gap-2">
              <span className={topNavigator.color}>{topNavigator.name}</span>
              <span className="text-sm text-slate-400 font-semibold">{navigatorPercent}%</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Лидирующий навигатор для построения маршрутов
            </p>
          </CardContent>
        </Card>

        {/* Card 3: Most Searched Branch */}
        <Card className="border-slate-800/80 bg-slate-900/35 hover:bg-slate-900/50 hover:border-slate-700/60 transition-all duration-300 shadow-md shadow-violet-950/2 hover:-translate-y-[2px] cursor-default group">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-400 group-hover:text-slate-300 transition-colors">Чаще всего ищут филиал</CardTitle>
            <MapPin className="h-4.5 w-4.5 text-blue-400 group-hover:scale-110 transition-transform" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold text-white tracking-tight truncate" title={topBranch.name}>
              {topBranch.name}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Доля от всех поисков: <span className="font-semibold text-white">{branchPercent}%</span> ({topBranch.value?.toLocaleString()})
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Planogram Aggregators Grid */}
      <div className="space-y-3">
        <h3 className="text-base font-bold text-white tracking-tight uppercase tracking-wider text-xs text-slate-400">Планаграмма поиска по агрегаторам</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {searchesByPlatform.map((platform) => {
            const platformColors: Record<string, { bg: string, text: string, border: string, dot: string }> = {
              GOOGLE_MAPS: { bg: "bg-blue-950/20", text: "text-blue-400", border: "border-blue-500/20", dot: "bg-blue-500" },
              YANDEX_MAPS: { bg: "bg-red-950/20", text: "text-red-400", border: "border-red-500/20", dot: "bg-red-500" },
              YANDEX_VENDOR: { bg: "bg-purple-950/20", text: "text-purple-400", border: "border-purple-500/20", dot: "bg-purple-500" },
              DGIS: { bg: "bg-emerald-950/20", text: "text-emerald-400", border: "border-emerald-500/20", dot: "bg-emerald-500" },
              UZUM_VENDOR: { bg: "bg-orange-950/20", text: "text-orange-400", border: "border-orange-500/20", dot: "bg-orange-500" },
            };
            const style = platformColors[platform.key] || { bg: "bg-slate-950/20", text: "text-slate-400", border: "border-slate-500/20", dot: "bg-slate-500" };
            const total = searchesByPlatform.reduce((sum, p) => sum + p.value, 0);
            const percentage = total > 0 ? Math.round((platform.value / total) * 100) : 0;
            
            return (
              <Card key={platform.key} className={`border-slate-800/80 bg-slate-900/35 p-4 flex flex-col justify-between hover:border-slate-700/60 transition-all duration-300 shadow-md`}>
                <div>
                  <div className="flex items-center justify-between">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-bold ${style.bg} ${style.text} ${style.border}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                      {platform.name}
                    </span>
                    <span className="text-slate-500 text-xs font-semibold">{percentage}%</span>
                  </div>
                  <div className="mt-4">
                    <p className="text-2xl font-bold text-white tracking-tight">{platform.value.toLocaleString()}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5 font-medium">Всего поисков</p>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-900/50">
                  <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                    <div className={`h-1.5 rounded-full ${style.dot}`} style={{ width: `${percentage}%` }} />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Charts section: Timeline & Query Popularity */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Timeline Chart */}
        <Card className="border-slate-800/80 bg-slate-900/35 text-slate-100 md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base font-bold text-white flex items-center gap-2">
              <TrendingUp className="h-4.5 w-4.5 text-violet-400" />
              <span>Динамика поисковых запросов</span>
            </CardTitle>
            <CardDescription className="text-slate-400">Количество поисков бренда по дням в разрезе источников</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.charts.searchesTimeline}>
                <defs>
                  <linearGradient id="searchGoogleMaps" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="searchYandexMaps" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="searchYandexVendor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="searchDGIS" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="searchUzumVendor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", color: "#fff" }} />
                <Area type="monotone" dataKey="GOOGLE_MAPS" name="Google Maps" stroke="#3b82f6" fillOpacity={1} fill="url(#searchGoogleMaps)" strokeWidth={2} isAnimationActive={false} />
                <Area type="monotone" dataKey="YANDEX_MAPS" name="Yandex Maps" stroke="#ef4444" fillOpacity={1} fill="url(#searchYandexMaps)" strokeWidth={2} isAnimationActive={false} />
                <Area type="monotone" dataKey="YANDEX_VENDOR" name="Yandex Eda" stroke="#a855f7" fillOpacity={1} fill="url(#searchYandexVendor)" strokeWidth={2} isAnimationActive={false} />
                <Area type="monotone" dataKey="UZUM_VENDOR" name="Uzum Tezkor" stroke="#f97316" fillOpacity={1} fill="url(#searchUzumVendor)" strokeWidth={2} isAnimationActive={false} />
                <Area type="monotone" dataKey="DGIS" name="2GIS" stroke="#22c55e" fillOpacity={1} fill="url(#searchDGIS)" strokeWidth={2} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Queries Popularity Card */}
        <Card className="border-slate-800/80 bg-slate-900/35 text-slate-100">
          <CardHeader>
            <CardTitle className="text-base font-bold text-white flex items-center gap-2">
              <BarChart2 className="h-4.5 w-4.5 text-violet-400" />
              <span>Популярные фразы</span>
            </CardTitle>
            <CardDescription className="text-slate-400">Частота конкретных поисковых запросов в поиске</CardDescription>
          </CardHeader>
          <CardContent className="h-80 flex flex-col justify-between">
            <div className="space-y-4 overflow-y-auto max-h-[280px] pr-2 scrollbar-thin scrollbar-thumb-slate-800">
              {data.charts.searchesByQuery?.map((queryItem, idx) => {
                const maxVal = data.charts.searchesByQuery[0]?.value || 1;
                const pct = Math.round((queryItem.value / maxVal) * 100);
                return (
                  <div key={queryItem.name} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-slate-300">#{idx + 1} {queryItem.name}</span>
                      <span className="text-white">{queryItem.value.toLocaleString()}</span>
                    </div>
                    <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden">
                      <div className="bg-violet-500 h-2 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Branch Popularity by Searches Card */}
      <Card className="border-slate-800/80 bg-slate-900/35 hover:border-slate-750/30 hover:bg-slate-900/45 transition-all duration-300 shadow-md shadow-violet-950/5 text-slate-100 mt-6">
        <CardHeader>
          <CardTitle className="text-base font-bold text-white flex items-center gap-2">
            <Building2 className="h-4.5 w-4.5 text-violet-400" />
            <span>Популярность филиалов по поисковым запросам</span>
          </CardTitle>
          <CardDescription className="text-slate-400">Сравнительный рейтинг филиалов по суммарному числу поисков</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[350px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-800 p-4">
            <div style={{ height: `${Math.max(250, searchesByBranch.length * 35)}px` }} className="w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={searchesByBranch} layout="vertical">
                  <XAxis type="number" stroke="#64748b" fontSize={11} tickLine={false} />
                  <YAxis dataKey="name" type="category" stroke="#64748b" fontSize={11} tickLine={false} width={180} />
                  <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", color: "#fff" }} />
                  <Bar dataKey="value" name="Поиски" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                    {searchesByBranch.map((entry, index) => {
                      const colors = ["#8b5cf6", "#6366f1", "#4f46e5", "#4338ca", "#3730a3"];
                      return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
