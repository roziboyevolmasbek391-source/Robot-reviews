"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Sparkles, MessageSquare, MessageSquareOff, Star, ThumbsUp, ThumbsDown, Clock, ExternalLink, Eye, CheckCircle2, Save, Send, RefreshCw, Tag, Check, FileText, TrendingUp } from "lucide-react";
import {
  formatDate,
  formatTime,
  getRatingBg,
  getRatingColor,
  getWarningTags,
} from "@/lib/utils";

interface Review {
  id: string;
  author: string;
  rating: number;
  text: string | null;
  reviewUrl: string | null;
  reviewDate: string;
  isNew: boolean;
  branch: {
    name: string;
  };
  replyText?: string | null;
  repliedAt?: string | null;
  repliedBy?: string | null;
  aiSentiment?: string | null;
  aiTopics?: string | null;
}

export default function VendorsAggregatorPage() {
  // Active platform: 'UZUM_VENDOR' or 'YANDEX_VENDOR'
  const [platform, setPlatform] = useState<"UZUM_VENDOR" | "YANDEX_VENDOR">("YANDEX_VENDOR");

  // Stats
  const [stats, setStats] = useState<any>(null);
  
  // Table state
  const [reviews, setReviews] = useState<Review[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [ratingFilter, setRatingFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [sortBy, setSortBy] = useState("reviewDate");
  const [sortOrder, setSortOrder] = useState("desc");
  const [loading, setLoading] = useState(true);

  // Modal State
  const [selectedReview, setSelectedReview] = useState<Review | null>(null);

  const [replyText, setReplyText] = useState("");
  const [generatingReply, setGeneratingReply] = useState(false);
  const [submittingReply, setSubmittingReply] = useState(false);
  const [suggestedRu, setSuggestedRu] = useState("");
  const [suggestedUz, setSuggestedUz] = useState("");
  const [aiUsed, setAiUsed] = useState(false);

  function formatSLADuration(start: string, end: string) {
    const diffMs = new Date(end).getTime() - new Date(start).getTime();
    if (diffMs <= 0) return "моментально";
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins} мин.`;
    const diffHours = Math.floor(diffMins / 60);
    const remainingMins = diffMins % 60;
    if (diffHours < 24) return `${diffHours} ч. ${remainingMins} мин.`;
    const diffDays = Math.floor(diffHours / 24);
    const remainingHours = diffHours % 24;
    return `${diffDays} дн. ${remainingHours} ч.`;
  }

  useEffect(() => {
    if (selectedReview) {
      setReplyText(selectedReview.replyText || "");
      setSuggestedRu("");
      setSuggestedUz("");
      setAiUsed(false);
    }
  }, [selectedReview]);

  // Load review from URL if present
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const reviewIdParam = params.get("reviewId");
      if (reviewIdParam) {
        fetch(`/api/reviews?id=${reviewIdParam}`)
          .then((res) => res.json())
          .then((data) => {
            if (data.reviews && data.reviews.length > 0) {
              setSelectedReview(data.reviews[0]);
            }
          })
          .catch((err) => console.error("Error loading deep-linked review:", err));
      }
    }
  }, []);

  const handleGenerateReply = async () => {
    if (!selectedReview) return;
    setGeneratingReply(true);
    try {
      const res = await fetch("/api/reviews/reply/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId: selectedReview.id }),
      });
      if (res.ok) {
        const data = await res.json();
        setSuggestedRu(data.replyRu);
        setSuggestedUz(data.replyUz);
        setAiUsed(data.aiUsed);
        setReplyText(data.replyRu);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setGeneratingReply(false);
    }
  };

  const handleSubmitReply = async () => {
    if (!selectedReview || !replyText) return;
    setSubmittingReply(true);
    try {
      const res = await fetch("/api/reviews/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId: selectedReview.id, replyText }),
      });
      if (res.ok) {
        const data = await res.json();
        const updated = data.review;
        setReviews((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
        setSelectedReview((prev) => (prev ? { ...prev, ...updated } : null));
        fetchData(); // Reload stats count
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSubmittingReply(false);
    }
  };

  // Fetch data
  const fetchData = async (currentPlatform = platform) => {
    setLoading(true);
    try {
      // 1. Stats
      const statsRes = await fetch(`/api/reviews/stats?source=${currentPlatform}`);
      const statsJson = await statsRes.json();
      setStats(statsJson.summary);

      // 2. Reviews list
      let dateFrom = "";
      let dateTo = "";
      const now = new Date();

      if (dateFilter === "today") {
        const d = new Date(now);
        d.setHours(0, 0, 0, 0);
        dateFrom = d.toISOString();
      } else if (dateFilter === "yesterday") {
        const d = new Date(now);
        d.setDate(d.getDate() - 1);
        d.setHours(0, 0, 0, 0);
        dateFrom = d.toISOString();
        const t = new Date(now);
        t.setDate(t.getDate() - 1);
        t.setHours(23, 59, 59, 999);
        dateTo = t.toISOString();
      } else if (dateFilter === "7days") {
        const d = new Date(now);
        d.setDate(d.getDate() - 7);
        dateFrom = d.toISOString();
      } else if (dateFilter === "30days") {
        const d = new Date(now);
        d.setDate(d.getDate() - 30);
        dateFrom = d.toISOString();
      } else if (dateFilter === "90days") {
        const d = new Date(now);
        d.setDate(d.getDate() - 90);
        dateFrom = d.toISOString();
      }

      const ratingQuery = ratingFilter !== "all" ? `&rating=${ratingFilter}` : "";
      const dateQuery = dateFrom ? `&dateFrom=${dateFrom}${dateTo ? `&dateTo=${dateTo}` : ""}` : "";
      const searchQuery = search ? `&search=${search}` : "";

      const reviewsRes = await fetch(
        `/api/reviews?source=${currentPlatform}&page=${page}&limit=10&sortBy=${sortBy}&sortOrder=${sortOrder}${ratingQuery}${dateQuery}${searchQuery}`
      );
      const reviewsJson = await reviewsRes.json();
      
      setReviews(reviewsJson.reviews || []);
      setTotalPages(reviewsJson.pagination?.totalPages || 1);
    } catch (e) {
      console.error("Error loading data", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [page, ratingFilter, dateFilter, sortBy, sortOrder, platform]);

  const handleSearchTrigger = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchData();
  };

  const handleExport = (format: "csv" | "excel") => {
    const url = `/api/reviews/export?source=${platform}&format=${format}`;
    window.open(url, "_blank");
  };

  const togglePlatform = (p: "UZUM_VENDOR" | "YANDEX_VENDOR") => {
    setPlatform(p);
    setPage(1);
    setSearch("");
    setRatingFilter("all");
    setDateFilter("all");
  };

  const isUzum = platform === "UZUM_VENDOR";

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Title & Platform Toggles */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Службы доставки</h2>
          <p className="text-slate-400 text-sm">Мониторинг отзывов и рейтингов из Yandex Eda (Vendor) и Uzum Tezkor</p>
        </div>

        {/* Aggregator Buttons */}
        <div className="flex items-center p-1 bg-slate-900 border border-slate-800 rounded-xl gap-2 w-full md:w-auto self-start">
          <button
            onClick={() => togglePlatform("YANDEX_VENDOR")}
            className={`flex-1 md:flex-initial flex items-center justify-center gap-2 px-5 py-2 rounded-lg text-xs font-bold transition-all duration-300 ${
              !isUzum
                ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30 scale-105 border border-purple-500/20"
                : "text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent"
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-purple-500 shrink-0" />
            Yandex Vendor
          </button>
          <button
            onClick={() => togglePlatform("UZUM_VENDOR")}
            className={`flex-1 md:flex-initial flex items-center justify-center gap-2 px-5 py-2 rounded-lg text-xs font-bold transition-all duration-300 ${
              isUzum
                ? "bg-orange-600 text-white shadow-lg shadow-orange-600/30 scale-105 border border-orange-500/20"
                : "text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent"
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-orange-500 shrink-0" />
            Uzum Vendor
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          <Card 
            onClick={() => {
              setRatingFilter("all");
              setPage(1);
            }}
            className={`border-slate-800/80 bg-slate-900/35 text-slate-100 cursor-pointer hover:border-slate-700/50 hover:bg-slate-900/45 transition-all duration-300 shadow-sm shadow-violet-950/2 hover:-translate-y-[2px] active:scale-95 duration-200 group ${
              ratingFilter === "all" ? "border-violet-500 bg-violet-950/10 ring-1 ring-violet-500/20" : ""
            }`}
          >
            <CardHeader className="p-4 pb-1 flex flex-row items-center justify-between space-y-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Всего отзывов</span>
              <MessageSquare className="h-3.5 w-3.5 text-violet-400 group-hover:scale-110 transition-transform" />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="text-xl font-bold text-white tracking-tight">{stats.totalReviews} шт.</div>
            </CardContent>
          </Card>
          <Card className="border-slate-800/80 bg-slate-900/35 text-slate-100 hover:-translate-y-[2px] transition-all duration-300 shadow-sm shadow-violet-950/2 group">
            <CardHeader className="p-4 pb-1 flex flex-row items-center justify-between space-y-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Средний рейтинг</span>
              <Star className="h-3.5 w-3.5 text-amber-450 group-hover:scale-110 transition-transform" />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="text-xl font-bold text-white tracking-tight">{stats.averageRating}</div>
            </CardContent>
          </Card>
          <Card 
            onClick={() => {
              setRatingFilter("positive");
              setPage(1);
            }}
            className={`border-slate-800/80 bg-slate-900/35 text-slate-100 cursor-pointer hover:border-emerald-500/50 hover:bg-slate-900/45 transition-all duration-300 shadow-sm shadow-violet-950/2 hover:-translate-y-[2px] active:scale-95 duration-200 group ${
              ratingFilter === "positive" ? "border-emerald-500 bg-emerald-950/10 ring-1 ring-emerald-500/20" : ""
            }`}
          >
            <CardHeader className="p-4 pb-1 flex flex-row items-center justify-between space-y-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Положительные</span>
              <ThumbsUp className="h-3.5 w-3.5 text-emerald-450 group-hover:scale-110 transition-transform" />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="text-xl font-bold text-emerald-400 tracking-tight">{stats.positiveReviews} шт.</div>
            </CardContent>
          </Card>
          <Card 
            onClick={() => {
              setRatingFilter("negative");
              setPage(1);
            }}
            className={`border-slate-800/80 bg-slate-900/35 text-slate-100 cursor-pointer hover:border-red-500/50 hover:bg-slate-900/45 transition-all duration-300 shadow-sm shadow-violet-950/2 hover:-translate-y-[2px] active:scale-95 duration-200 group ${
              ratingFilter === "negative" ? "border-red-500 bg-red-950/10 ring-1 ring-red-500/20" : ""
            }`}
          >
            <CardHeader className="p-4 pb-1 flex flex-row items-center justify-between space-y-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Негативные</span>
              <ThumbsDown className="h-3.5 w-3.5 text-rose-500 group-hover:scale-110 transition-transform" />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="text-xl font-bold text-red-400 tracking-tight">{stats.negativeReviews} шт.</div>
            </CardContent>
          </Card>
          <Card className="border-slate-800/80 bg-slate-900/35 text-slate-100 hover:-translate-y-[2px] transition-all duration-300 shadow-sm shadow-violet-950/2 group">
            <CardHeader className="p-4 pb-1 flex flex-row items-center justify-between space-y-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Получено сегодня</span>
              <Clock className="h-3.5 w-3.5 text-blue-400 group-hover:scale-110 transition-transform" />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="text-xl font-bold text-violet-400 tracking-tight">+{stats.reviewsToday}</div>
            </CardContent>
          </Card>
          <Card className="border-slate-800/80 bg-slate-900/35 text-slate-100 hover:-translate-y-[2px] transition-all duration-300 shadow-sm shadow-violet-950/2 group">
            <CardHeader className="p-4 pb-1 flex flex-row items-center justify-between space-y-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">За эту неделю</span>
              <TrendingUp className="h-3.5 w-3.5 text-indigo-400 group-hover:scale-110 transition-transform" />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="text-xl font-bold text-indigo-400 tracking-tight">+{stats.reviewsThisWeek}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters & Table */}
      <Card className="border-slate-800 bg-slate-900/20 text-slate-100">
        <CardHeader className="pb-4 border-b border-slate-900">
          <form onSubmit={handleSearchTrigger} className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex w-full lg:max-w-md items-center gap-2">
              <Input
                placeholder="Поиск по автору или тексту отзыва..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`border-slate-800 bg-slate-950 text-white text-sm h-9 focus:ring-1 ${
                  isUzum ? "focus:border-orange-500 focus:ring-orange-500" : "focus:border-purple-500 focus:ring-purple-500"
                }`}
              />
              <Button
                type="submit"
                size="sm"
                className={`h-9 px-4 shrink-0 text-white font-semibold ${
                  isUzum ? "bg-orange-600 hover:bg-orange-500" : "bg-purple-600 hover:bg-purple-500"
                }`}
              >
                Поиск
              </Button>
            </div>
            
            {/* Direct selectors */}
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-2.5 w-full lg:w-auto">
              <Select value={ratingFilter} onValueChange={(val) => setRatingFilter(val || "all")}>
                <SelectTrigger className="w-full sm:w-36 bg-slate-950 border-slate-800 text-slate-300 text-xs h-9">
                  <SelectValue placeholder="Все оценки" />
                </SelectTrigger>
                <SelectContent className="bg-slate-950 border-slate-800 text-slate-300 text-xs">
                  <SelectItem value="all">Все оценки</SelectItem>
                  <SelectItem value="positive">Положительные (4-5)</SelectItem>
                  <SelectItem value="negative">Негативные (1-2)</SelectItem>
                  <SelectItem value="5">5 звезд</SelectItem>
                  <SelectItem value="4">4 звезды</SelectItem>
                  <SelectItem value="3">3 звезды</SelectItem>
                  <SelectItem value="2">2 звезды</SelectItem>
                  <SelectItem value="1">1 звезда</SelectItem>
                </SelectContent>
              </Select>
 
              <Select value={dateFilter} onValueChange={(val) => setDateFilter(val || "all")}>
                <SelectTrigger className="w-full sm:w-32 bg-slate-950 border-slate-800 text-slate-300 text-xs h-9">
                  <SelectValue placeholder="Все время" />
                </SelectTrigger>
                <SelectContent className="bg-slate-950 border-slate-800 text-slate-300 text-xs">
                  <SelectItem value="all">Все время</SelectItem>
                  <SelectItem value="today">Сегодня</SelectItem>
                  <SelectItem value="yesterday">Вчера</SelectItem>
                  <SelectItem value="7days">Последние 7 дней</SelectItem>
                  <SelectItem value="30days">Последние 30 дней</SelectItem>
                  <SelectItem value="90days">Последние 90 дней</SelectItem>
                </SelectContent>
              </Select>
 
              <Select value={sortBy} onValueChange={(val) => setSortBy(val || "reviewDate")}>
                <SelectTrigger className="w-full sm:w-32 bg-slate-950 border-slate-800 text-slate-300 text-xs h-9">
                  <SelectValue placeholder="По дате" />
                </SelectTrigger>
                <SelectContent className="bg-slate-950 border-slate-800 text-slate-300 text-xs">
                  <SelectItem value="reviewDate">По дате</SelectItem>
                  <SelectItem value="rating">По оценке</SelectItem>
                </SelectContent>
              </Select>
 
              <Button
                type="button"
                onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                variant="ghost"
                className="border border-slate-800 text-xs text-slate-400 hover:text-white hover:bg-slate-900 h-9 w-full sm:w-auto"
              >
                {sortOrder === "asc" ? "↑ Возр." : "↓ Убыв."}
              </Button>
            </div>
          </form>

          {/* Export Buttons */}
          <div className="flex items-center gap-2 mt-3 justify-end">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Экспорт {isUzum ? "Uzum" : "Yandex"}:</span>
            <Button
              onClick={() => handleExport("excel")}
              variant="outline"
              size="sm"
              className="border-slate-800 bg-slate-900/40 text-slate-300 hover:text-white text-[11px] h-7 px-3"
            >
              📥 Excel
            </Button>
            <Button
              onClick={() => handleExport("csv")}
              variant="outline"
              size="sm"
              className="border-slate-800 bg-slate-900/40 text-slate-300 hover:text-white text-[11px] h-7 px-3"
            >
              📥 CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-900 bg-slate-900/30 text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="p-4">Дата / Время</th>
                  <th className="p-4">Филиал</th>
                  <th className="p-4">Рейтинг</th>
                  <th className="p-4">Автор</th>
                  <th className="p-4">Статус / Теги</th>
                  <th className="p-4">Источник</th>
                  <th className="p-4 text-center">Подробнее</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500">
                      Загрузка...
                    </td>
                  </tr>
                ) : reviews.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500">
                      Отзывы не найдены
                    </td>
                  </tr>
                ) : (
                  reviews.map((review) => {
                    const warningTags = getWarningTags(review.text, review.rating);
                    return (
                      <tr key={review.id} className="hover:bg-slate-900/20 transition-colors">
                        <td className="p-4 font-medium text-slate-300">
                          <div>{formatDate(review.reviewDate)}</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">{formatTime(review.reviewDate)}</div>
                        </td>
                        <td className="p-4 text-white font-medium">{review.branch?.name}</td>
                        <td className="p-4">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[10px] font-semibold ${getRatingBg(review.rating)}`}>
                            <Star className="h-3 w-3 fill-current shrink-0" />
                            <span>{review.rating.toFixed(1)}</span>
                          </span>
                        </td>
                        <td className="p-4 text-slate-300 font-medium">{review.author}</td>
                         <td className="p-4 text-slate-400">
                          <div className="flex flex-wrap gap-1.5">
                            {review.aiSentiment && (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[9px] font-semibold ${
                                review.aiSentiment === "POSITIVE" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                                review.aiSentiment === "NEUTRAL" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                                "bg-red-500/10 text-red-400 border-red-500/20"
                              }`}>
                                {review.aiSentiment === "POSITIVE" ? "Положительный" : review.aiSentiment === "NEUTRAL" ? "Нейтральный" : "Негативный"}
                              </span>
                            )}
                            {review.aiTopics && review.aiTopics.split(", ").filter(Boolean).map((t, idx) => (
                              <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-violet-500/20 bg-violet-600/15 text-violet-400 text-[9px] font-medium">
                                <Tag className="h-2.5 w-2.5 shrink-0" />
                                <span>{t}</span>
                              </span>
                            ))}
                            {review.replyText && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-[9px] font-semibold">
                                <Check className="h-2.5 w-2.5 shrink-0" />
                                <span>Отвечено</span>
                              </span>
                            )}
                            {!review.aiSentiment && !review.aiTopics && (
                              review.text ? (
                                warningTags.length > 0 ? (
                                  warningTags.slice(0, 1).map((tag, idx) => (
                                    <span
                                      key={idx}
                                      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-extrabold uppercase border tracking-wide shadow-lg ${tag.colorClass}`}
                                    >
                                      {tag.label}
                                    </span>
                                  ))
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-violet-500/10 text-violet-400 border border-violet-500/20">
                                    <MessageSquare className="h-3 w-3 shrink-0" />
                                    <span>Есть отзыв</span>
                                  </span>
                                )
                              ) : (
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${
                                  review.rating >= 4 
                                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                                    : review.rating === 3 
                                    ? "bg-amber-500/10 text-amber-400 border-amber-500/20" 
                                    : "bg-red-500/10 text-red-400 border-red-500/20 animate-pulse"
                                }`}>
                                  <MessageSquareOff className="h-3 w-3 shrink-0" />
                                  <span>Отзыв без комментария</span>
                                </span>
                              )
                            )}
                          </div>
                        </td>
                        <td className="p-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium ${
                            isUzum 
                              ? "bg-orange-500/10 text-orange-400 border-orange-500/20" 
                              : "bg-purple-500/10 text-purple-400 border-purple-500/20"
                          }`}>
                            {isUzum ? "Uzum Vendor" : "Yandex Vendor"}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <Button
                            onClick={() => setSelectedReview(review)}
                            variant="ghost"
                            size="sm"
                            className={`font-medium flex items-center justify-center gap-1 mx-auto ${
                              isUzum 
                                ? "hover:bg-orange-600/20 text-orange-400 hover:text-orange-300" 
                                : "hover:bg-purple-600/20 text-purple-400 hover:text-purple-300"
                            }`}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>Смотреть</span>
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t border-slate-900 text-xs">
              <span className="text-slate-400">Страница {page} из {totalPages}</span>
              <div className="flex gap-2">
                <Button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  variant="outline"
                  className="border-slate-800 text-slate-300 disabled:opacity-50 text-xs py-1"
                >
                  Назад
                </Button>
                <Button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  variant="outline"
                  className="border-slate-800 text-slate-300 disabled:opacity-50 text-xs py-1"
                >
                  Вперед
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Review Details Modal */}
      {selectedReview && (
        <Dialog open={!!selectedReview} onOpenChange={(open) => !open && setSelectedReview(null)}>
          <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-white flex items-center gap-2">
                Детали отзыва
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[10px] font-semibold ${getRatingBg(selectedReview.rating)}`}>
                  <Star className="h-3 w-3 fill-current shrink-0" />
                  <span>{selectedReview.rating.toFixed(1)}</span>
                </span>
              </DialogTitle>
              <DialogDescription className="text-slate-400 text-xs">
                Дата: {formatDate(selectedReview.reviewDate)} {formatTime(selectedReview.reviewDate)} | Источник: {isUzum ? "Uzum Vendor" : "Yandex Vendor"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 my-2 text-sm max-h-[70vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-2 p-3 bg-slate-950 rounded-xl">
                <div>
                  <p className="text-[10px] uppercase font-semibold text-slate-500">Автор</p>
                  <p className="text-slate-200 mt-0.5 font-medium">{selectedReview.author}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-semibold text-slate-500">Филиал</p>
                  <p className="text-slate-200 mt-0.5 font-medium">{selectedReview.branch?.name}</p>
                </div>
              </div>

              {/* AI Sentiment & Topics */}
              <div className="space-y-1">
                <p className="text-[10px] uppercase font-semibold text-slate-500">ИИ Анализ отзыва</p>
                <div className="flex flex-wrap gap-2 p-2.5 bg-slate-950 rounded-xl border border-slate-900/60">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[9px] font-bold gap-1 ${
                    (selectedReview.aiSentiment || (selectedReview.rating >= 4 ? "POSITIVE" : selectedReview.rating === 3 ? "NEUTRAL" : "NEGATIVE")) === "POSITIVE" 
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                      : (selectedReview.aiSentiment || (selectedReview.rating >= 4 ? "POSITIVE" : selectedReview.rating === 3 ? "NEUTRAL" : "NEGATIVE")) === "NEUTRAL" 
                      ? "bg-amber-500/10 text-amber-400 border-amber-500/20" 
                      : "bg-red-500/10 text-red-400 border-red-500/20"
                  }`}>
                    {(selectedReview.aiSentiment || (selectedReview.rating >= 4 ? "POSITIVE" : selectedReview.rating === 3 ? "NEUTRAL" : "NEGATIVE")) === "POSITIVE" ? (
                      <ThumbsUp className="h-3 w-3 shrink-0" />
                    ) : (selectedReview.aiSentiment || (selectedReview.rating >= 4 ? "POSITIVE" : selectedReview.rating === 3 ? "NEUTRAL" : "NEGATIVE")) === "NEUTRAL" ? (
                      <Star className="h-3 w-3 text-amber-450 shrink-0" />
                    ) : (
                      <ThumbsDown className="h-3 w-3 shrink-0" />
                    )}
                    <span>
                      Тональность: {(selectedReview.aiSentiment || (selectedReview.rating >= 4 ? "POSITIVE" : selectedReview.rating === 3 ? "NEUTRAL" : "NEGATIVE")) === "POSITIVE" ? "Положительный" : (selectedReview.aiSentiment || (selectedReview.rating >= 4 ? "POSITIVE" : selectedReview.rating === 3 ? "NEUTRAL" : "NEGATIVE")) === "NEUTRAL" ? "Нейтральный" : "Негативный"}
                    </span>
                  </span>
                  {selectedReview.aiTopics ? selectedReview.aiTopics.split(", ").filter(Boolean).map((topic: string, idx: number) => (
                    <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-violet-500/20 bg-violet-600/15 text-violet-400 text-[9px] font-medium">
                      <Tag className="h-2.5 w-2.5 text-slate-500 shrink-0" />
                      <span>{topic}</span>
                    </span>
                  )) : (
                    <span className="text-[10px] text-slate-500 italic">Темы не определены</span>
                  )}
                </div>
              </div>

              {/* Warning Tags inside Details Modal */}
              {getWarningTags(selectedReview.text, selectedReview.rating).length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] uppercase font-semibold text-slate-500">Замеченные проблемы</p>
                  <div className="flex flex-wrap gap-1.5 p-2 bg-slate-950 rounded-xl border border-slate-900">
                    {getWarningTags(selectedReview.text, selectedReview.rating).map((tag, idx) => (
                      <span
                        key={idx}
                        className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase border shadow-md ${tag.colorClass}`}
                      >
                        {tag.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="text-[10px] uppercase font-semibold text-slate-500 mb-1">Текст отзыва</p>
                <div className="p-4 bg-slate-950 rounded-xl text-slate-300 leading-relaxed max-h-36 overflow-y-auto italic">
                  {selectedReview.text ? `"${selectedReview.text}"` : (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                      selectedReview.rating >= 4 
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                        : selectedReview.rating === 3 
                        ? "bg-amber-500/10 text-amber-400 border-amber-500/20" 
                        : "bg-red-500/10 text-red-400 border-red-500/20 animate-pulse"
                    }`}>
                      <MessageSquareOff className="h-3 w-3 shrink-0" />
                      <span>Отзыв без комментария</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Operator Reply & SLA Section */}
              <div className="border-t border-slate-900/60 pt-4 space-y-3">
                <p className="text-[10px] uppercase font-semibold text-slate-500">Ответ оператора (SLA)</p>
                
                {selectedReview.replyText ? (
                  <div className="p-4 bg-violet-600/5 border border-violet-500/10 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-[10px] text-slate-400 border-b border-slate-900 pb-1.5 mb-1.5">
                      <span>Ответил: <b className="text-white">@{selectedReview.repliedBy}</b></span>
                      <span>SLA ответа: <b className="text-violet-400">{selectedReview.repliedAt ? formatSLADuration(selectedReview.reviewDate, selectedReview.repliedAt) : "неизвестно"}</b></span>
                    </div>
                    <p className="text-slate-300 italic text-xs leading-relaxed">"{selectedReview.replyText}"</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <Button
                        onClick={handleGenerateReply}
                        disabled={generatingReply}
                        variant="outline"
                        className={`h-8 text-[10px] flex-1 flex items-center justify-center gap-1.5 ${
                          isUzum 
                            ? "border-orange-800 text-orange-400 hover:bg-orange-600/10" 
                            : "border-purple-800 text-purple-400 hover:bg-purple-600/10"
                        }`}
                      >
                        <FileText className="h-3.5 w-3.5" />
                        <span>{generatingReply ? "Генерация ответа..." : "Сгенерировать ответ по шаблону"}</span>
                      </Button>
                    </div>

                    {suggestedRu && (
                      <div className="grid grid-cols-2 gap-2 p-2 bg-slate-950 rounded-lg border border-slate-900">
                        <Button
                          onClick={() => setReplyText(suggestedRu)}
                          variant="ghost"
                          className="h-7 text-[10px] text-slate-300 hover:text-white"
                        >
                          Использовать RU
                        </Button>
                        <Button
                          onClick={() => setReplyText(suggestedUz)}
                          variant="ghost"
                          className="h-7 text-[10px] text-slate-300 hover:text-white"
                        >
                          Использовать UZ
                        </Button>
                      </div>
                    )}

                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Введите текст ответа клиенту здесь..."
                      className="w-full h-24 p-3 bg-slate-950 border border-slate-800 text-white rounded-xl text-xs focus:ring-1 focus:ring-violet-500 outline-none"
                    />

                    <Button
                      onClick={handleSubmitReply}
                      disabled={submittingReply || !replyText.trim()}
                      className={`w-full text-white text-xs h-9 font-bold rounded-lg flex items-center justify-center gap-1 ${
                        isUzum ? "bg-orange-600 hover:bg-orange-500" : "bg-purple-600 hover:bg-purple-500"
                      }`}
                    >
                      <span>{submittingReply ? "Сохранение ответа..." : "Сохранить и отправить ответ"}</span>
                      <Check className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              {selectedReview.reviewUrl && (
                <a href={selectedReview.reviewUrl} target="_blank" rel="noreferrer">
                  <Button className={`text-white text-xs ${isUzum ? "bg-orange-600 hover:bg-orange-500" : "bg-purple-600 hover:bg-purple-500"}`}>
                    Открыть оригинал 🔗
                  </Button>
                </a>
              )}
              <Button onClick={() => setSelectedReview(null)} variant="outline" className="border-slate-800 text-slate-300 text-xs">
                Закрыть
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
