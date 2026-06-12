"use client";

import { useEffect, useState, useRef } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getRatingColor, getSourceColor } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from "recharts";

interface StatsData {
  summary: {
    totalReviews: number;
    averageRating: number;
    positiveReviews: number;
    negativeReviews: number;
    reviewsToday: number;
    reviewsYesterday: number;
    reviewsThisWeek: number;
    reviewsThisMonth: number;
    responseRate: number;
    averageResponseTimeMs: number;
  };
  charts: {
    platformDistribution: Array<{ name: string; value: number; key: string }>;
    branchDistribution: Array<{ 
      id: string; 
      name: string; 
      count: number; 
      averageRating: number;
      thisMonthCount: number;
      lastMonthCount: number;
      growth: number;
      GOOGLE_MAPS: number;
      YANDEX_MAPS: number;
      YANDEX_VENDOR: number;
      DGIS: number;
      UZUM_VENDOR: number;
    }>;
    ratingDistribution: Array<{ stars: string; count: number }>;
    ratingDistributionByBranch: Record<string, Array<{ stars: string; count: number }>>;
    dailyStats: Array<{ 
      date: string; 
      count: number; 
      avgRating: number;
      GOOGLE_MAPS?: number;
      YANDEX_MAPS?: number;
      YANDEX_VENDOR?: number;
      DGIS?: number;
      UZUM_VENDOR?: number;
    }>;
    topicDistribution: Array<{ name: string; value: number }>;
    topicDistributionByBranch?: Record<string, Array<{ name: string; value: number }>>;
  };
}

export default function OverviewPage() {
  const [data, setData] = useState<StatsData | null>(null);
  const [branches, setBranches] = useState<any[]>([]);
  const [selectedBranch, setSelectedBranch] = useState("all");
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  function formatSLADurationMs(ms: number) {
    if (ms <= 0) return "—";
    const diffMins = Math.floor(ms / 60000);
    if (diffMins < 60) return `${diffMins} мин.`;
    const diffHours = Math.floor(diffMins / 60);
    const remainingMins = diffMins % 60;
    if (diffHours < 24) return `${diffHours} ч. ${remainingMins} мин.`;
    const diffDays = Math.floor(diffHours / 24);
    const remainingHours = diffHours % 24;
    return `${diffDays} дн. ${remainingHours} ч.`;
  }

  // Sana filtrlari state'lari
  const [dateRange, setDateRange] = useState<string>("all");
  const [customDays, setCustomDays] = useState<string>("");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  // Kalendar popoveri state'lari
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [selectedRange, setSelectedRange] = useState<DateRange | undefined>(undefined);

  // Filial modal dialogi state'lari
  const [selectedModalBranchId, setSelectedModalBranchId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalData, setModalData] = useState<any | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  // Reyting taqsimoti uchun lokal filial tanlagich
  const [ratingBranchId, setRatingBranchId] = useState("all");

  // AI Topics taqsimoti uchun lokal filial tanlagich va topic detaylari
  const [topicBranchId, setTopicBranchId] = useState("all");
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [topicSort, setTopicSort] = useState<"count" | "percentage">("count");

  // Topic bo'yicha filiallar taqsimotini hisoblash
  const getSortedBranchesForTopic = () => {
    if (!data || !selectedTopic) return [];

    const result: Array<{ id: string; name: string; topicCount: number; percentage: number }> = [];
    const activeBranches = data.charts.branchDistribution || [];
    const topicDistByBranch = (data.charts as any).topicDistributionByBranch || {};

    activeBranches.forEach((branch) => {
      const branchTopics = topicDistByBranch[branch.id] || [];
      const topicItem = branchTopics.find((t: any) => t.name === selectedTopic);
      const topicCount = topicItem ? topicItem.value : 0;
      
      const totalReviews = branch.count || 0;
      const percentage = totalReviews > 0 ? Math.round((topicCount / totalReviews) * 100) : 0;

      result.push({
        id: branch.id,
        name: branch.name,
        topicCount,
        percentage
      });
    });

    if (topicSort === "count") {
      return result.sort((a, b) => b.topicCount - a.topicCount || b.percentage - a.percentage);
    } else {
      return result.sort((a, b) => b.percentage - a.percentage || b.topicCount - a.topicCount);
    }
  };

  const sortedBranchesForTopic = getSortedBranchesForTopic();

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
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      params.append("dateFrom", monthStart.toISOString());
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
        setLoading(false);
      });
  }, [selectedBranch, refetchTrigger]);

  // Global filial o'zgarganda yoki yangi ma'lumot yuklanganda lokal reyting filialini sinxronlash
  useEffect(() => {
    if (data) {
      setRatingBranchId(selectedBranch);
      setTopicBranchId(selectedBranch);
    }
  }, [selectedBranch, data]);

  // Eng mashhur topicni avtomatik tanlash
  useEffect(() => {
    if (data && data.charts.topicDistribution && data.charts.topicDistribution.length > 0 && !selectedTopic) {
      const sortedTopics = [...data.charts.topicDistribution].sort((a, b) => b.value - a.value);
      if (sortedTopics[0]) {
        setSelectedTopic(sortedTopics[0].name);
      }
    }
  }, [data, selectedTopic]);

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
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      setSelectedRange({ from: monthStart, to: now });
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

  // Tanlangan filial statistikasi yuklanishi
  useEffect(() => {
    if (selectedModalBranchId && modalOpen) {
      setModalLoading(true);
      const query = getQueryParams();
      const params = new URLSearchParams(query);
      params.set("branchId", selectedModalBranchId);

      fetch(`/api/reviews/stats?${params.toString()}`)
        .then((res) => res.json())
        .then((d) => {
          setModalData(d);
          setModalLoading(false);
        })
        .catch((e) => {
          console.error("Error loading branch details", e);
          setModalLoading(false);
        });
    } else {
      setModalData(null);
    }
  }, [selectedModalBranchId, modalOpen]);

  if (loading || !data || !mounted) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-slate-400">
        Загрузка статистики...
      </div>
    );
  }

  const platformColors: Record<string, string> = {
    GOOGLE_MAPS: "#3b82f6",     // Google Maps: Blue
    YANDEX_MAPS: "#ef4444",     // Yandex Maps: Red
    YANDEX_VENDOR: "#a855f7",   // Yandex Vendor: Purple
    DGIS: "#22c55e",            // 2GIS: Green
    UZUM_VENDOR: "#f97316",     // Uzum Vendor: Orange
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto animate-in fade-in duration-500">
      {/* Filters (Branch & Date) */}
      <div className="bg-slate-900/40 border border-slate-800/80 p-5 rounded-2xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">Обзор дашборда</h2>
            <p className="text-slate-400 text-sm">Аналитика и показатели отзывов со всех агрегаторов</p>
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

            {/* Date Range Selector Popover */}
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
                   dateRange === "month" ? "В этом месяце" :
                   dateRange === "custom_days" ? `Последние ${customDays || 0} дней` :
                   selectedRange?.from ? (
                     `${format(selectedRange.from, "dd MMM yyyy", { locale: ru })}` +
                     (selectedRange.to ? ` - ${format(selectedRange.to, "dd MMM yyyy", { locale: ru })}` : "")
                   ) : "Выбрать даты"}
                </span>
                <span className="text-slate-400">📅</span>
              </button>

              {datePickerOpen && (
                <div className="absolute right-0 top-12 z-50 flex flex-col md:flex-row bg-slate-950 border border-slate-800 rounded-xl shadow-2xl p-4 gap-4 animate-in fade-in duration-200 min-w-[320px] md:min-w-[550px]">
                  {/* Presets Column */}
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
                      В этом месяце
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

                  {/* Calendar Column */}
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
                    
                    {/* Action buttons */}
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

      {/* Global Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Jami sharhlar */}
        <Card className="border-slate-800 bg-slate-900/50 text-slate-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Всего отзывов</CardTitle>
            <span className="text-xl">💬</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{data.summary.totalReviews}</div>
            <p className="text-xs text-slate-500 mt-1">Со всех платформ</p>
          </CardContent>
        </Card>

        {/* Card 2: O'rtacha reyting */}
        <Card className="border-slate-800 bg-slate-900/50 text-slate-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Средний рейтинг</CardTitle>
            <span className="text-xl">⭐</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{data.summary.averageRating}</div>
            <p className="text-xs text-slate-500 mt-1">
              Оценка: {data.summary.averageRating >= 4 ? "Отлично" : data.summary.averageRating >= 3 ? "Средне" : "Плохо"}
            </p>
          </CardContent>
        </Card>

        {/* Card 3: Ijobiy sharhlar */}
        <Card className="border-slate-800 bg-slate-900/50 text-slate-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Положительные</CardTitle>
            <span className="text-xl text-emerald-500">👍</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400">{data.summary.positiveReviews}</div>
            <p className="text-xs text-slate-500 mt-1">
              {data.summary.totalReviews > 0 ? Math.round((data.summary.positiveReviews / data.summary.totalReviews) * 100) : 0}% от общего
            </p>
          </CardContent>
        </Card>

        {/* Card 4: Salbiy sharhlar */}
        <Card className="border-slate-800 bg-slate-900/50 text-slate-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Негативные</CardTitle>
            <span className="text-xl text-red-500">👎</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-400">{data.summary.negativeReviews}</div>
            <p className="text-xs text-slate-500 mt-1">
              {data.summary.totalReviews > 0 ? Math.round((data.summary.negativeReviews / data.summary.totalReviews) * 100) : 0}% от общего
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Chart 5: TOP Filiallar */}
        <Card className="border-slate-800 bg-slate-900/50 text-slate-100 flex flex-col justify-between md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base font-bold text-white">Рейтинг филиалов (по количеству отзывов)</CardTitle>
            <CardDescription className="text-slate-400">Распределение по платформам. Нажмите на филиал для деталей.</CardDescription>
          </CardHeader>
          <CardContent className="max-h-[550px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-800">
            <div style={{ height: `${Math.max(450, data.charts.branchDistribution.length * 38)}px` }} className="w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  data={data.charts.branchDistribution} 
                  layout="vertical"
                  className="cursor-pointer"
                >
                  <XAxis type="number" stroke="#64748b" fontSize={11} tickLine={false} />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    stroke="#64748b" 
                    fontSize={10} 
                    tickLine={false} 
                    width={150} 
                    tick={(props: any) => {
                      const { x, y, payload } = props;
                      const branch = data.charts.branchDistribution.find(b => b.name === payload.value);
                      return (
                        <g transform={`translate(${x},${y})`}>
                          <text
                            x={-10}
                            y={0}
                            dy={4}
                            textAnchor="end"
                            fill="#94a3b8"
                            className="hover:fill-violet-400 hover:font-semibold transition-all cursor-pointer font-medium"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (branch) {
                                setSelectedModalBranchId(branch.id);
                                setModalOpen(true);
                              }
                            }}
                          >
                            {payload.value}
                          </text>
                        </g>
                      );
                    }}
                  />
                  <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", color: "#fff" }} />
                  <Bar 
                    dataKey="YANDEX_MAPS" 
                    name="Yandex Maps" 
                    stackId="a" 
                    fill={platformColors.YANDEX_MAPS} 
                    isAnimationActive={false}
                    onClick={(entry: any) => {
                      if (entry && entry.id) {
                        setSelectedModalBranchId(entry.id);
                        setModalOpen(true);
                      }
                    }} 
                  />
                  <Bar 
                    dataKey="YANDEX_VENDOR" 
                    name="Yandex Eda" 
                    stackId="a" 
                    fill={platformColors.YANDEX_VENDOR} 
                    isAnimationActive={false}
                    onClick={(entry: any) => {
                      if (entry && entry.id) {
                        setSelectedModalBranchId(entry.id);
                        setModalOpen(true);
                      }
                    }} 
                  />
                  <Bar 
                    dataKey="UZUM_VENDOR" 
                    name="Uzum Vendor" 
                    stackId="a" 
                    fill={platformColors.UZUM_VENDOR} 
                    isAnimationActive={false}
                    onClick={(entry: any) => {
                      if (entry && entry.id) {
                        setSelectedModalBranchId(entry.id);
                        setModalOpen(true);
                      }
                    }} 
                  />
                  <Bar 
                    dataKey="DGIS" 
                    name="2GIS" 
                    stackId="a" 
                    fill={platformColors.DGIS} 
                    isAnimationActive={false}
                    onClick={(entry: any) => {
                      if (entry && entry.id) {
                        setSelectedModalBranchId(entry.id);
                        setModalOpen(true);
                      }
                    }} 
                  />
                  <Bar 
                    dataKey="GOOGLE_MAPS" 
                    name="Google Maps" 
                    stackId="a" 
                    fill={platformColors.GOOGLE_MAPS} 
                    isAnimationActive={false}
                    onClick={(entry: any) => {
                      if (entry && entry.id) {
                        setSelectedModalBranchId(entry.id);
                        setModalOpen(true);
                      }
                    }} 
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      {/* Chart 1: Kunlik sharhlar soni */}
        <Card className="border-slate-800 bg-slate-900/50 text-slate-100">
          <CardHeader>
            <CardTitle className="text-base font-bold text-white">Динамика отзывов (По дням)</CardTitle>
            <CardDescription className="text-slate-400">Количество отзывов за выбранный период</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.charts.dailyStats}>
                <defs>
                  <linearGradient id="colorGoogleMaps" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={platformColors.GOOGLE_MAPS} stopOpacity={0.2}/>
                    <stop offset="95%" stopColor={platformColors.GOOGLE_MAPS} stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorYandexMaps" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={platformColors.YANDEX_MAPS} stopOpacity={0.2}/>
                    <stop offset="95%" stopColor={platformColors.YANDEX_MAPS} stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorYandexVendor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={platformColors.YANDEX_VENDOR} stopOpacity={0.2}/>
                    <stop offset="95%" stopColor={platformColors.YANDEX_VENDOR} stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorDGIS" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={platformColors.DGIS} stopOpacity={0.2}/>
                    <stop offset="95%" stopColor={platformColors.DGIS} stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorUzumVendor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={platformColors.UZUM_VENDOR} stopOpacity={0.2}/>
                    <stop offset="95%" stopColor={platformColors.UZUM_VENDOR} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", color: "#fff" }} />
                <Area type="monotone" dataKey="YANDEX_MAPS" name="Yandex Maps" stroke={platformColors.YANDEX_MAPS} fillOpacity={1} fill="url(#colorYandexMaps)" strokeWidth={2} isAnimationActive={false} />
                <Area type="monotone" dataKey="YANDEX_VENDOR" name="Yandex Eda" stroke={platformColors.YANDEX_VENDOR} fillOpacity={1} fill="url(#colorYandexVendor)" strokeWidth={2} isAnimationActive={false} />
                <Area type="monotone" dataKey="UZUM_VENDOR" name="Uzum Vendor" stroke={platformColors.UZUM_VENDOR} fillOpacity={1} fill="url(#colorUzumVendor)" strokeWidth={2} isAnimationActive={false} />
                <Area type="monotone" dataKey="DGIS" name="2GIS" stroke={platformColors.DGIS} fillOpacity={1} fill="url(#colorDGIS)" strokeWidth={2} isAnimationActive={false} />
                <Area type="monotone" dataKey="GOOGLE_MAPS" name="Google Maps" stroke={platformColors.GOOGLE_MAPS} fillOpacity={1} fill="url(#colorGoogleMaps)" strokeWidth={2} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Chart 2: Platformalar bo'yicha sharhlar */}
        <Card className="border-slate-800 bg-slate-900/50 text-slate-100">
          <CardHeader>
            <CardTitle className="text-base font-bold text-white">Распределение по платформам</CardTitle>
            <CardDescription className="text-slate-400">Источники собранных отзывов в процентах</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row items-center justify-center h-auto sm:h-80 py-4 sm:py-0">
            <div className="w-full h-64 sm:h-full max-w-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.charts.platformDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={75}
                    paddingAngle={4}
                    dataKey="value"
                    labelLine={false}
                    label={({ percent = 0 }) => percent > 0.03 ? `${(percent * 100).toFixed(0)}%` : ""}
                    isAnimationActive={false}
                  >
                    {data.charts.platformDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={platformColors[entry.key] || "#94a3b8"} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", color: "#fff" }} 
                    formatter={(value: any) => {
                      const total = data.charts.platformDistribution.reduce((acc, p) => acc + p.value, 0);
                      const pct = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                      return [`${pct}% (${value})`, "Отзывы"];
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {/* Custom Legend */}
            <div className="flex flex-row flex-wrap sm:flex-col justify-center gap-3 sm:gap-2 sm:ml-4 mt-2 sm:mt-0 text-xs">
              {(() => {
                const total = data.charts.platformDistribution.reduce((acc, p) => acc + p.value, 0);
                return data.charts.platformDistribution.map((entry, index) => {
                  const percentage = total > 0 ? Math.round((entry.value / total) * 100) : 0;
                  return (
                    <div key={entry.name} className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: platformColors[entry.key] || "#94a3b8" }} />
                      <span className="text-slate-300 font-medium whitespace-nowrap">{entry.name}:</span>
                      <span className="text-white font-bold">{percentage}% ({entry.value})</span>
                    </div>
                  );
                });
              })()}
            </div>
          </CardContent>
        </Card>

        {/* Chart 4: AI Topics analysis */}
        <Card className="border-slate-800 bg-slate-900/50 text-slate-100 flex flex-col justify-between">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <div>
              <CardTitle className="text-base font-bold text-white">Анализ тем ИИ (ИИ Топики)</CardTitle>
              <CardDescription className="text-slate-400">Частота упоминания тем в отзывах</CardDescription>
            </div>
            <div className="w-40 shrink-0">
              <Select value={topicBranchId} onValueChange={(val) => setTopicBranchId(val || "all")}>
                <SelectTrigger className="bg-slate-950 border-slate-800 text-white text-xs h-8">
                  <SelectValue>
                    {topicBranchId === "all" 
                      ? "Все филиалы" 
                      : branches.find(b => b.id === topicBranchId)?.name || "Все филиалы"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-slate-950 border-slate-800 text-white text-xs">
                  <SelectItem value="all">Все филиалы</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  data={data.charts.topicDistributionByBranch?.[topicBranchId] || data.charts.topicDistribution} 
                  layout="vertical"
                  onClick={(state: any) => {
                    if (state && state.activePayload && state.activePayload[0]) {
                      const topic = state.activePayload[0].payload.name;
                      if (topic) {
                        setSelectedTopic(topic.toString());
                      }
                    } else if (state && state.activeLabel) {
                      setSelectedTopic(state.activeLabel.toString());
                    }
                  }}
                  className="cursor-pointer"
                >
                  <XAxis type="number" stroke="#64748b" fontSize={11} tickLine={false} />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    stroke="#64748b" 
                    fontSize={11} 
                    tickLine={false} 
                    width={130}
                    tick={(props: any) => {
                      const { x, y, payload } = props;
                      const isSelected = selectedTopic === payload.value;
                      return (
                        <g transform={`translate(${x},${y})`}>
                          <text
                            x={-10}
                            y={0}
                            dy={4}
                            textAnchor="end"
                            fill={isSelected ? "#c084fc" : "#94a3b8"}
                            className={`hover:fill-violet-400 hover:font-bold transition-all cursor-pointer text-xs ${isSelected ? "font-bold" : "font-medium"}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTopic(payload.value.toString());
                            }}
                          >
                            {payload.value}
                          </text>
                        </g>
                      );
                    }}
                  />
                  <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", color: "#fff" }} />
                  <Bar 
                    dataKey="value" 
                    name="Частота" 
                    fill="#a78bfa" 
                    radius={[0, 4, 4, 0]}
                    isAnimationActive={false}
                    onClick={(entry: any) => {
                      if (entry && entry.name) {
                        setSelectedTopic(entry.name.toString());
                      }
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="text-[10px] text-slate-500 italic text-center">
              💡 Нажмите на полосу или название темы выше, чтобы сравнить её по филиалам ниже
            </div>

            {selectedTopic && (
              <div className="mt-2 pt-4 border-t border-slate-800/80">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Филиалы по теме: <span className="text-violet-400 normal-case">{selectedTopic}</span>
                  </h4>
                  <div className="flex gap-1 bg-slate-950 p-0.5 rounded border border-slate-800/60">
                    <button 
                      onClick={() => setTopicSort("count")} 
                      className={`px-2 py-0.5 rounded text-[9px] font-medium transition-all ${topicSort === "count" ? "bg-violet-600 text-white" : "text-slate-400 hover:text-white"}`}
                    >
                      Кол-во
                    </button>
                    <button 
                      onClick={() => setTopicSort("percentage")} 
                      className={`px-2 py-0.5 rounded text-[9px] font-medium transition-all ${topicSort === "percentage" ? "bg-violet-600 text-white" : "text-slate-400 hover:text-white"}`}
                    >
                      Процент
                    </button>
                  </div>
                </div>

                <div className="max-h-56 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-slate-800">
                  {sortedBranchesForTopic.length === 0 ? (
                    <div className="text-center py-4 text-xs text-slate-500">Нет данных для сравнения.</div>
                  ) : (
                    sortedBranchesForTopic.map(b => (
                      <div 
                        key={b.id} 
                        className={`flex flex-col gap-1 text-[11px] p-2 rounded-lg transition-all ${b.id === topicBranchId ? "bg-violet-950/20 border border-violet-900/40" : "bg-slate-950/40 border border-transparent hover:border-slate-800/60"}`}
                      >
                        <div className="flex justify-between text-slate-300">
                          <span className="font-semibold">{b.name}</span>
                          <span className="text-slate-400 font-medium">
                            {b.topicCount} шт. <span className="text-slate-500 font-normal">({b.percentage}%)</span>
                          </span>
                        </div>
                        <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                          <div 
                            className="bg-violet-400 h-1.5 rounded-full transition-all duration-500" 
                            style={{ width: `${b.percentage}%` }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chart 3: Reytinglar taqsimoti (1-5) */}
        <Card className="border-slate-800 bg-slate-900/50 text-slate-100 flex flex-col justify-between">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <div>
              <CardTitle className="text-base font-bold text-white">Распределение оценок</CardTitle>
              <CardDescription className="text-slate-400">Количество оценок от 1 до 5 звезд</CardDescription>
            </div>
            <div className="w-40 shrink-0">
              <Select value={ratingBranchId} onValueChange={(val) => setRatingBranchId(val || "all")}>
                <SelectTrigger className="bg-slate-950 border-slate-800 text-white text-xs h-8">
                  <SelectValue>
                    {ratingBranchId === "all" 
                      ? "Все филиалы" 
                      : branches.find(b => b.id === ratingBranchId)?.name || "Все филиалы"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-slate-950 border-slate-800 text-white text-xs">
                  <SelectItem value="all">Все филиалы</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <div className="w-full" style={{ height: "400px" }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.charts.ratingDistributionByBranch?.[ratingBranchId] || data.charts.ratingDistribution}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                  <XAxis dataKey="stars" stroke="#64748b" fontSize={11} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", color: "#fff" }} />
                  <Bar dataKey="count" name="Количество" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={55} isAnimationActive={false} minPointSize={4} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        </div>

      {/* Branch Growth Table */}
      <Card className="border-slate-800 bg-slate-900/50 text-slate-100 mt-6">
        <CardHeader>
          <CardTitle className="text-base font-bold text-white">Динамика роста по филиалам</CardTitle>
          <CardDescription className="text-slate-400">Сравнение количества отзывов текущего месяца с прошлым месяцем</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-900 bg-slate-900/30 text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="p-4">Филиал</th>
                  <th className="p-4 text-center">Всего отзывов</th>
                  <th className="p-4 text-center">Средний рейтинг</th>
                  <th className="p-4 text-center">Этот месяц</th>
                  <th className="p-4 text-center">Прошлый месяц</th>
                  <th className="p-4 text-center">Рост (Динамика)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900">
                {data.charts.branchDistribution.map((branch: any) => {
                  const isPositive = branch.growth > 0;
                  const isNegative = branch.growth < 0;
                  const growthPercent = branch.lastMonthCount > 0 
                    ? Math.round((branch.growth / branch.lastMonthCount) * 100) 
                    : branch.thisMonthCount > 0 ? 100 : 0;
                  return (
                    <tr 
                      key={branch.id} 
                      className="hover:bg-slate-900/20 transition-colors cursor-pointer"
                      onClick={() => {
                        setSelectedModalBranchId(branch.id);
                        setModalOpen(true);
                      }}
                    >
                      <td className="p-4 font-semibold text-white">{branch.name}</td>
                      <td className="p-4 text-center text-slate-300">{branch.count}</td>
                      <td className="p-4 text-center">
                        <span className="font-bold text-amber-400">★ {branch.averageRating}</span>
                      </td>
                      <td className="p-4 text-center text-white font-medium">+{branch.thisMonthCount}</td>
                      <td className="p-4 text-center text-slate-400">+{branch.lastMonthCount}</td>
                      <td className="p-4 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold ${
                          isPositive
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : isNegative
                            ? "bg-red-500/10 text-red-400 border-red-500/20"
                            : "bg-slate-800 text-slate-400 border-slate-700"
                        }`}>
                          {branch.growth > 0 
                            ? `+${branch.growth} 📈 (+${growthPercent}%)` 
                            : branch.growth < 0 
                            ? `${branch.growth} 📉 (${growthPercent}%)` 
                            : "0%"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Branch Stats Detail Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-4xl sm:max-w-4xl bg-slate-950 border border-slate-800 text-white max-h-[90vh] overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-800">
          {modalLoading ? (
            <div className="flex h-60 items-center justify-center text-slate-400 font-medium text-sm">
              <span className="animate-pulse">Загрузка детальной статистики филиала...</span>
            </div>
          ) : modalData ? (
            <div className="space-y-6">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
                  <span>🏢</span> {modalData.charts.branchDistribution[0]?.name || "Филиал"}
                </DialogTitle>
                <DialogDescription className="text-slate-400 text-xs">
                  Подробные графики и аналитика по филиалу
                </DialogDescription>
              </DialogHeader>

              {/* Stats overview */}
              <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl text-center">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">Всего отзывов</p>
                  <p className="text-xl font-bold text-white mt-1">{modalData.summary.totalReviews}</p>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl text-center">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">Рейтинг</p>
                  <p className="text-xl font-bold text-amber-400 mt-1">★ {modalData.summary.averageRating}</p>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl text-center">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">Положительные</p>
                  <p className="text-xl font-bold text-emerald-400 mt-1">+{modalData.summary.positiveReviews}</p>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl text-center">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">Негативные</p>
                  <p className="text-xl font-bold text-red-400 mt-1">+{modalData.summary.negativeReviews}</p>
                </div>
              </div>

              {/* Charts grid */}
              <div className="grid gap-6 md:grid-cols-2">
                {/* 1. Dynamics */}
                <Card className="border-slate-800 bg-slate-900/30 text-slate-100">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-bold text-slate-400 uppercase">Динамика отзывов</CardTitle>
                  </CardHeader>
                  <CardContent className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={modalData.charts.dailyStats}>
                        <defs>
                          <linearGradient id="mColorGoogleMaps" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={platformColors.GOOGLE_MAPS} stopOpacity={0.2}/>
                            <stop offset="95%" stopColor={platformColors.GOOGLE_MAPS} stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="mColorYandexMaps" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={platformColors.YANDEX_MAPS} stopOpacity={0.2}/>
                            <stop offset="95%" stopColor={platformColors.YANDEX_MAPS} stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="mColorYandexVendor" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={platformColors.YANDEX_VENDOR} stopOpacity={0.2}/>
                            <stop offset="95%" stopColor={platformColors.YANDEX_VENDOR} stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="mColorDGIS" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={platformColors.DGIS} stopOpacity={0.2}/>
                            <stop offset="95%" stopColor={platformColors.DGIS} stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="mColorUzumVendor" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={platformColors.UZUM_VENDOR} stopOpacity={0.2}/>
                            <stop offset="95%" stopColor={platformColors.UZUM_VENDOR} stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="date" stroke="#64748b" fontSize={9} tickLine={false} />
                        <YAxis stroke="#64748b" fontSize={9} tickLine={false} />
                        <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", color: "#fff" }} />
                        <Area type="monotone" dataKey="YANDEX_MAPS" name="Yandex Maps" stroke={platformColors.YANDEX_MAPS} fillOpacity={1} fill="url(#mColorYandexMaps)" strokeWidth={2} isAnimationActive={false} />
                        <Area type="monotone" dataKey="YANDEX_VENDOR" name="Yandex Eda" stroke={platformColors.YANDEX_VENDOR} fillOpacity={1} fill="url(#mColorYandexVendor)" strokeWidth={2} isAnimationActive={false} />
                        <Area type="monotone" dataKey="UZUM_VENDOR" name="Uzum Vendor" stroke={platformColors.UZUM_VENDOR} fillOpacity={1} fill="url(#mColorUzumVendor)" strokeWidth={2} isAnimationActive={false} />
                        <Area type="monotone" dataKey="DGIS" name="2GIS" stroke={platformColors.DGIS} fillOpacity={1} fill="url(#mColorDGIS)" strokeWidth={2} isAnimationActive={false} />
                        <Area type="monotone" dataKey="GOOGLE_MAPS" name="Google Maps" stroke={platformColors.GOOGLE_MAPS} fillOpacity={1} fill="url(#mColorGoogleMaps)" strokeWidth={2} isAnimationActive={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* 2. Platform Distribution */}
                <Card className="border-slate-800 bg-slate-900/30 text-slate-100">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-bold text-slate-400 uppercase">Источники отзывов</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col sm:flex-row items-center justify-center h-64 py-2 sm:py-0">
                    <div className="w-1/2 h-full max-h-[160px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={modalData.charts.platformDistribution}
                            cx="50%"
                            cy="50%"
                            innerRadius={40}
                            outerRadius={55}
                            paddingAngle={3}
                            dataKey="value"
                            labelLine={false}
                            label={({ percent = 0 }) => percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ""}
                            isAnimationActive={false}
                          >
                            {modalData.charts.platformDistribution.map((entry: any, index: number) => (
                              <Cell key={`cell-${index}`} fill={platformColors[entry.key] || "#94a3b8"} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", color: "#fff" }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    {/* Custom Legend */}
                    <div className="flex flex-col gap-1.5 text-[10px] ml-2">
                      {(() => {
                        const total = modalData.charts.platformDistribution.reduce((acc: number, p: any) => acc + p.value, 0);
                        return modalData.charts.platformDistribution.map((entry: any) => {
                          const percentage = total > 0 ? Math.round((entry.value / total) * 100) : 0;
                          return (
                            <div key={entry.name} className="flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: platformColors[entry.key] || "#94a3b8" }} />
                              <span className="text-slate-300 font-medium whitespace-nowrap">{entry.name}:</span>
                              <span className="text-white font-bold">{percentage}% ({entry.value})</span>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </CardContent>
                </Card>

                {/* 3. Rating Distribution */}
                <Card className="border-slate-800 bg-slate-900/30 text-slate-100">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-bold text-slate-400 uppercase">Распределение оценок (Звезды)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-48 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={modalData.charts.ratingDistribution}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                          <XAxis dataKey="stars" stroke="#64748b" fontSize={9} tickLine={false} />
                          <YAxis stroke="#64748b" fontSize={9} tickLine={false} />
                          <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", color: "#fff" }} />
                          <Bar dataKey="count" name="Количество" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={35} isAnimationActive={false} minPointSize={4} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* 4. AI Topics Distribution */}
                <Card className="border-slate-800 bg-slate-900/30 text-slate-100">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-bold text-slate-400 uppercase">Анализ тем ИИ (ИИ Топики)</CardTitle>
                  </CardHeader>
                  <CardContent className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={modalData.charts.topicDistribution} layout="vertical">
                        <XAxis type="number" stroke="#64748b" fontSize={9} tickLine={false} />
                        <YAxis dataKey="name" type="category" stroke="#64748b" fontSize={9} tickLine={false} width={100} />
                        <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", color: "#fff" }} />
                        <Bar dataKey="value" name="Частота" fill="#a78bfa" radius={[0, 4, 4, 0]} isAnimationActive={false} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : (
            <div className="text-center py-10 text-slate-400">Не удалось загрузить данные филиала.</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
