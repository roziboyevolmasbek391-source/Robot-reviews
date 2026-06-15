"use client";

import { useEffect, useState, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  formatDate,
  formatTime,
  getRatingBg,
  getRatingColor,
  getSourceColor,
  getSourceLabel,
  getStarEmoji,
  getWarningTags,
} from "@/lib/utils";

interface Branch {
  id: string;
  name: string;
  city: string;
}

interface Review {
  id: string;
  source: string;
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

export default function MapsReviewsCenter() {
  const [activeTab, setActiveTab] = useState("google");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [dateFilter, setDateFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [branchStats, setBranchStats] = useState<any>(null);

  // New reviews tab state
  const [newReviews, setNewReviews] = useState<Review[]>([]);
  const [newPlatformFilter, setNewPlatformFilter] = useState("all");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [newLoading, setNewLoading] = useState(false);
  const [selectedReview, setSelectedReview] = useState<Review | null>(null);

  const [replyText, setReplyText] = useState("");
  const [generatingReply, setGeneratingReply] = useState(false);
  const [submittingReply, setSubmittingReply] = useState(false);
  const [suggestedRu, setSuggestedRu] = useState("");
  const [suggestedUz, setSuggestedUz] = useState("");
  const [aiUsed, setAiUsed] = useState(false);

  const refreshInterval = useRef<NodeJS.Timeout | null>(null);

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
        setNewReviews((prev) => prev.filter((r) => r.id !== updated.id));
        setSelectedReview((prev) => (prev ? { ...prev, ...updated } : null));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSubmittingReply(false);
    }
  };

  // Filiallarni yuklash
  useEffect(() => {
    fetch("/api/branches")
      .then((res) => res.json())
      .then((data) => {
        const list = data.branches || [];
        setBranches(list);
        if (list.length > 0) {
          setSelectedBranch(list[0].id);
        }
      });
  }, []);

  // Filial va Tab o'zgarganda sharhlarni yuklash
  useEffect(() => {
    if (!selectedBranch || activeTab === "new") return;
    loadBranchReviews();
  }, [selectedBranch, activeTab, dateFilter]);

  // Yangi sharhlar yuklash (Tab 4)
  useEffect(() => {
    if (activeTab === "new") {
      loadNewReviews();
      
      // Auto refresh o'rnatish
      if (autoRefresh) {
        refreshInterval.current = setInterval(() => {
          loadNewReviews();
        }, 15000); // Har 15 soniyada yangilash
      }
    } else {
      if (refreshInterval.current) {
        clearInterval(refreshInterval.current);
      }
    }

    return () => {
      if (refreshInterval.current) {
        clearInterval(refreshInterval.current);
      }
    };
  }, [activeTab, autoRefresh, newPlatformFilter]);

  const loadBranchReviews = async () => {
    setLoading(true);
    try {
      const sourceMap: Record<string, string> = {
        google: "GOOGLE_MAPS",
        yandex: "YANDEX_MAPS",
        dgis: "DGIS",
      };
      const source = sourceMap[activeTab];

      // Statistika yuklash
      const statsRes = await fetch(`/api/reviews/stats?branchId=${selectedBranch}&source=${source}`);
      const statsJson = await statsRes.json();
      setBranchStats(statsJson.summary);

      // Sana filtri
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

      const dateQuery = dateFrom ? `&dateFrom=${dateFrom}${dateTo ? `&dateTo=${dateTo}` : ""}` : "";
      const reviewsRes = await fetch(
        `/api/reviews?branchId=${selectedBranch}&source=${source}&limit=50${dateQuery}`
      );
      const reviewsJson = await reviewsRes.json();
      setReviews(reviewsJson.reviews || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadNewReviews = async () => {
    setNewLoading(true);
    try {
      const platformQuery = newPlatformFilter !== "all" ? `?source=${newPlatformFilter}` : "";
      const res = await fetch(`/api/reviews/new${platformQuery}`);
      const data = await res.json();
      setNewReviews(data.reviews || []);
    } catch (e) {
      console.error(e);
    } finally {
      setNewLoading(false);
    }
  };

  const markAsRead = async (reviewId: string) => {
    try {
      const res = await fetch("/api/reviews/new", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewIds: [reviewId] }),
      });
      if (res.ok) {
        setNewReviews(prev => prev.filter(r => r.id !== reviewId));
      }
    } catch (e) {
      console.error("Error marking read", e);
    }
  };

  const markAllAsRead = async () => {
    const ids = newReviews.map(r => r.id);
    if (ids.length === 0) return;
    try {
      const res = await fetch("/api/reviews/new", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewIds: ids }),
      });
      if (res.ok) {
        setNewReviews([]);
      }
    } catch (e) {
      console.error("Error marking all read", e);
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Title */}
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">Maps Reviews Center</h2>
        <p className="text-slate-400 text-sm">Мониторинг отзывов из Google Maps, Yandex Maps и 2GIS</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="flex flex-wrap md:inline-flex bg-slate-900 border border-slate-800 text-slate-400 h-auto md:h-10 p-1 rounded-xl gap-1">
          <TabsTrigger value="google" className="rounded-lg text-xs font-semibold px-3 py-1.5 md:py-1">🔵 Google Maps</TabsTrigger>
          <TabsTrigger value="yandex" className="rounded-lg text-xs font-semibold px-3 py-1.5 md:py-1">🔴 Yandex Maps</TabsTrigger>
          <TabsTrigger value="dgis" className="rounded-lg text-xs font-semibold px-3 py-1.5 md:py-1">🟢 2GIS</TabsTrigger>
          <TabsTrigger value="new" className="rounded-lg text-xs font-semibold px-3 py-1.5 md:py-1 flex items-center gap-1.5 bg-violet-600/10 text-violet-400">
            🔥 Новые отзывы
            {newReviews.length > 0 && (
              <Badge className="bg-violet-600 text-white border-none text-[9px] h-4 min-w-4 px-1 rounded-full flex items-center justify-center font-bold">
                {newReviews.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Google, Yandex, 2GIS tabs content */}
        {["google", "yandex", "dgis"].map((tab) => (
          <TabsContent key={tab} value={tab} className="space-y-6">
            {/* Header filters for maps */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 bg-slate-900/20 border border-slate-900 rounded-2xl">
              <div className="flex items-center gap-2 w-full sm:max-w-xs">
                <span className="text-xs text-slate-400 shrink-0">Филиал:</span>
                <Select value={selectedBranch} onValueChange={(val) => setSelectedBranch(val || "")}>
                  <SelectTrigger className="bg-slate-950 border-slate-800 text-white text-xs h-9">
                    <SelectValue>
                      {branches.find(b => b.id === selectedBranch)?.name || "Выберите филиал"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-slate-950 border-slate-800 text-white text-xs">
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <span className="text-xs text-slate-400 shrink-0">Дата:</span>
                <Select value={dateFilter} onValueChange={(val) => setDateFilter(val || "all")}>
                  <SelectTrigger className="w-full sm:w-36 bg-slate-950 border-slate-800 text-white text-xs h-9">
                    <SelectValue placeholder="Все время" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-950 border-slate-800 text-white text-xs">
                    <SelectItem value="all">Все время</SelectItem>
                    <SelectItem value="today">Сегодня</SelectItem>
                    <SelectItem value="yesterday">Вчера</SelectItem>
                    <SelectItem value="7days">Последние 7 дней</SelectItem>
                    <SelectItem value="30days">Последние 30 дней</SelectItem>
                    <SelectItem value="90days">Последние 90 дней</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Stats */}
            {branchStats && (
              <div className="grid gap-4 md:grid-cols-4">
                <Card className="border-slate-800 bg-slate-900/40 text-slate-100">
                  <CardHeader className="p-4 pb-1">
                    <CardTitle className="text-xs font-semibold text-slate-400">Средний рейтинг</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="text-xl font-bold text-white">{branchStats.averageRating}</div>
                  </CardContent>
                </Card>
                <Card className="border-slate-800 bg-slate-900/40 text-slate-100">
                  <CardHeader className="p-4 pb-1">
                    <CardTitle className="text-xs font-semibold text-slate-400">Всего отзывов</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="text-xl font-bold text-white">{branchStats.totalReviews} шт.</div>
                  </CardContent>
                </Card>
                <Card className="border-slate-800 bg-slate-900/40 text-slate-100">
                  <CardHeader className="p-4 pb-1">
                    <CardTitle className="text-xs font-semibold text-slate-400">Положительные отзывы</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="text-xl font-bold text-emerald-400">{branchStats.positiveReviews} шт.</div>
                  </CardContent>
                </Card>
                <Card className="border-slate-800 bg-slate-900/40 text-slate-100">
                  <CardHeader className="p-4 pb-1">
                    <CardTitle className="text-xs font-semibold text-slate-400">Негативные отзывы</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="text-xl font-bold text-red-400">{branchStats.negativeReviews} шт.</div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* List */}
            <div className="space-y-4">
              {loading ? (
                <div className="text-center p-8 text-slate-500">Загрузка...</div>
              ) : reviews.length === 0 ? (
                <div className="text-center p-8 text-slate-500 border border-slate-900 rounded-2xl">В этом филиале пока нет отзывов.</div>
              ) : (
                <div className="grid gap-4">
                  {reviews.map((r) => (
                    <Card key={r.id} className="border-slate-800 bg-slate-900/20 text-slate-100 hover:border-slate-700 transition duration-200">
                      <CardHeader className="p-4 pb-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 space-y-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-xs text-white">{r.author}</span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[9px] font-bold ${getRatingBg(r.rating)}`}>
                            {getStarEmoji(r.rating)}
                          </span>
                          {r.aiSentiment && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[9px] font-semibold ${
                              r.aiSentiment === "POSITIVE" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                              r.aiSentiment === "NEUTRAL" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                              "bg-red-500/10 text-red-400 border-red-500/20"
                            }`}>
                              {r.aiSentiment === "POSITIVE" ? "Положительный" : r.aiSentiment === "NEUTRAL" ? "Нейтральный" : "Негативный"}
                            </span>
                          )}
                          {r.aiTopics && r.aiTopics.split(", ").filter(Boolean).map((t, idx) => (
                            <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded-full border border-violet-500/20 bg-violet-600/15 text-violet-400 text-[9px] font-medium">
                              🏷️ {t}
                            </span>
                          ))}
                          {r.replyText && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-[9px] font-bold">
                              ✓ Отвечено
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {formatDate(r.reviewDate)} {formatTime(r.reviewDate)}
                        </div>
                      </CardHeader>
                      <CardContent className="p-4 pt-0 space-y-2">
                        <div className="flex flex-wrap gap-1 mt-2">
                          {r.text ? (
                            getWarningTags(r.text, r.rating).length > 0 ? (
                              getWarningTags(r.text, r.rating).slice(0, 1).map((tag, idx) => (
                                <span
                                  key={idx}
                                  className={`inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-extrabold uppercase border tracking-wide shadow-lg ${tag.colorClass}`}
                                >
                                  {tag.label}
                                </span>
                              ))
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-violet-500/10 text-violet-400 border border-violet-500/20">
                                💬 Есть отзыв
                              </span>
                            )
                          ) : (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                              r.rating >= 4 
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                                : r.rating === 3 
                                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" 
                                : "bg-red-500/10 text-red-400 border border-red-500/20 animate-pulse"
                            }`}>
                              Отзыв без комментария 💬
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between pt-1">
                          <Button
                            onClick={() => setSelectedReview(r)}
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2.5 text-[10px] text-violet-400 hover:text-violet-300 hover:bg-violet-600/10"
                          >
                            Смотреть 👁️
                          </Button>
                          {r.reviewUrl && (
                            <a href={r.reviewUrl} target="_blank" rel="noreferrer" className="text-[10px] text-slate-500 hover:text-slate-300 hover:underline">
                              Открыть оригинал 🔗
                            </a>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        ))}

        {/* Tab 4: New Reviews */}
        <TabsContent value="new" className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-4 bg-slate-900/20 border border-slate-900 rounded-2xl">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <span className="text-xs text-slate-400">Платформа:</span>
              <Select value={newPlatformFilter} onValueChange={(val) => setNewPlatformFilter(val || "all")}>
                <SelectTrigger className="w-full md:w-40 bg-slate-950 border-slate-800 text-white text-xs h-9">
                  <SelectValue placeholder="Все платформы" />
                </SelectTrigger>
                <SelectContent className="bg-slate-950 border-slate-800 text-white text-xs">
                  <SelectItem value="all">Все платформы</SelectItem>
                  <SelectItem value="GOOGLE_MAPS">Google Maps</SelectItem>
                  <SelectItem value="YANDEX_MAPS">Yandex Maps</SelectItem>
                  <SelectItem value="YANDEX_VENDOR">Yandex Vendor</SelectItem>
                  <SelectItem value="DGIS">2GIS</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="auto-refresh"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="rounded border-slate-800 bg-slate-950 text-violet-600 focus:ring-violet-500 h-4 w-4"
                />
                <label htmlFor="auto-refresh" className="text-xs text-slate-400 cursor-pointer select-none">
                  Автообновление (15с)
                </label>
              </div>
              <Button onClick={loadNewReviews} size="sm" variant="outline" className="border-slate-800 text-xs h-9 flex-1 sm:flex-initial">
                🔄 Обновить
              </Button>
              <Button onClick={markAllAsRead} size="sm" className="bg-violet-600 hover:bg-violet-500 text-white text-xs h-9 flex-1 sm:flex-initial">
                ✓ Прочитать все
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            {newLoading && newReviews.length === 0 ? (
              <div className="text-center p-8 text-slate-500">Загрузка...</div>
            ) : newReviews.length === 0 ? (
              <div className="text-center p-12 border border-slate-900 rounded-3xl text-slate-500">
                <div className="text-2xl mb-2">🎉</div>
                <div className="text-xs">Все новые отзывы прочитаны. Новых отзывов нет.</div>
              </div>
            ) : (
              <div className="grid gap-4">
                {newReviews.map((r) => {
                  const isNegative = r.rating <= 2;
                  return (
                    <Card
                      key={r.id}
                      className={`border-slate-800 bg-slate-900/20 text-slate-100 hover:border-slate-700 transition duration-200 ${
                        isNegative ? "border-l-4 border-l-red-500 bg-red-500/[0.02]" : ""
                      }`}
                    >
                      <CardHeader className="p-4 pb-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 space-y-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-xs text-white">{r.author}</span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[9px] font-bold ${getRatingBg(r.rating)}`}>
                            {getStarEmoji(r.rating)}
                          </span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[9px] font-semibold ${getSourceColor(r.source)}`}>
                            {getSourceLabel(r.source)}
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium">→ {r.branch?.name}</span>
                          {r.aiSentiment && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[9px] font-semibold ${
                              r.aiSentiment === "POSITIVE" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                              r.aiSentiment === "NEUTRAL" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                              "bg-red-500/10 text-red-400 border-red-500/20"
                            }`}>
                              {r.aiSentiment === "POSITIVE" ? "Положительный" : r.aiSentiment === "NEUTRAL" ? "Нейтральный" : "Негативный"}
                            </span>
                          )}
                          {r.aiTopics && r.aiTopics.split(", ").filter(Boolean).map((t, idx) => (
                            <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded-full border border-violet-500/20 bg-violet-600/15 text-violet-400 text-[9px] font-medium">
                              🏷️ {t}
                            </span>
                          ))}
                          {r.replyText && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-[9px] font-bold">
                              ✓ Отвечено
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
                          <span className="text-[10px] text-slate-500">
                            {formatDate(r.reviewDate)} {formatTime(r.reviewDate)}
                          </span>
                          <Button
                            onClick={() => markAsRead(r.id)}
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[10px] bg-slate-800 text-slate-300 hover:text-white"
                          >
                            ✓ Прочит.
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="p-4 pt-0 space-y-2">
                        <div className="flex flex-wrap gap-1 mt-2">
                          {r.text ? (
                            getWarningTags(r.text, r.rating).length > 0 ? (
                              getWarningTags(r.text, r.rating).slice(0, 1).map((tag, idx) => (
                                <span
                                  key={idx}
                                  className={`inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-extrabold uppercase border tracking-wide shadow-lg ${tag.colorClass}`}
                                >
                                  {tag.label}
                                </span>
                              ))
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-violet-500/10 text-violet-400 border border-violet-500/20">
                                💬 Есть отзыв
                              </span>
                            )
                          ) : (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                              r.rating >= 4 
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                                : r.rating === 3 
                                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" 
                                : "bg-red-500/10 text-red-400 border border-red-500/20 animate-pulse"
                            }`}>
                              Отзыв без комментария 💬
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between pt-1">
                          <Button
                            onClick={() => setSelectedReview(r)}
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2.5 text-[10px] text-violet-400 hover:text-violet-300 hover:bg-violet-600/10"
                          >
                            Смотреть 👁️
                          </Button>
                          {r.reviewUrl && (
                            <a href={r.reviewUrl} target="_blank" rel="noreferrer" className="text-[10px] text-slate-500 hover:text-slate-300 hover:underline">
                              Открыть оригинал 🔗
                            </a>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Review Details Modal */}
      {selectedReview && (
        <Dialog open={!!selectedReview} onOpenChange={(open) => !open && setSelectedReview(null)}>
          <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-white flex items-center gap-2">
                Детали отзыва
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold ${getRatingBg(selectedReview.rating)}`}>
                  {getStarEmoji(selectedReview.rating)}
                </span>
              </DialogTitle>
              <DialogDescription className="text-slate-400 text-xs">
                Дата: {formatDate(selectedReview.reviewDate)} {formatTime(selectedReview.reviewDate)} | Источник: {getSourceLabel(selectedReview.source)}
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
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[9px] font-bold ${
                    (selectedReview.aiSentiment || (selectedReview.rating >= 4 ? "POSITIVE" : selectedReview.rating === 3 ? "NEUTRAL" : "NEGATIVE")) === "POSITIVE" 
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                      : (selectedReview.aiSentiment || (selectedReview.rating >= 4 ? "POSITIVE" : selectedReview.rating === 3 ? "NEUTRAL" : "NEGATIVE")) === "NEUTRAL" 
                      ? "bg-amber-500/10 text-amber-400 border-amber-500/20" 
                      : "bg-red-500/10 text-red-400 border-red-500/20"
                  }`}>
                    Тональность: {(selectedReview.aiSentiment || (selectedReview.rating >= 4 ? "POSITIVE" : selectedReview.rating === 3 ? "NEUTRAL" : "NEGATIVE")) === "POSITIVE" ? "Положительный 🟢" : (selectedReview.aiSentiment || (selectedReview.rating >= 4 ? "POSITIVE" : selectedReview.rating === 3 ? "NEUTRAL" : "NEGATIVE")) === "NEUTRAL" ? "Нейтральный 🟡" : "Негативный 🔴"}
                  </span>
                  {selectedReview.aiTopics ? selectedReview.aiTopics.split(", ").filter(Boolean).map((topic: string, idx: number) => (
                    <span key={idx} className="inline-flex items-center px-2.5 py-0.5 rounded-full border border-violet-500/20 bg-violet-600/15 text-violet-400 text-[9px] font-medium">
                      🏷️ {topic}
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
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                      selectedReview.rating >= 4 
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                        : selectedReview.rating === 3 
                        ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" 
                        : "bg-red-500/10 text-red-400 border-red-500/20 animate-pulse"
                    }`}>
                      Отзыв без комментария 💬
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
                        className="h-8 border-violet-800 text-[10px] text-violet-400 hover:bg-violet-600/10 flex-1"
                      >
                        {generatingReply ? "Генерация ответа..." : "📝 Сгенерировать ответ по шаблону"}
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
                      placeholder="Введите text ответа клиенту здесь..."
                      className="w-full h-24 p-3 bg-slate-950 border border-slate-800 text-white rounded-xl text-xs focus:ring-1 focus:ring-violet-500 outline-none"
                    />

                    <Button
                      onClick={handleSubmitReply}
                      disabled={submittingReply || !replyText.trim()}
                      className="w-full bg-violet-600 hover:bg-violet-500 text-white text-xs h-9 font-bold rounded-lg"
                    >
                      {submittingReply ? "Сохранение ответа..." : "Сохранить и отправить ответ ✓"}
                    </Button>
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              {selectedReview.reviewUrl && (
                <a href={selectedReview.reviewUrl} target="_blank" rel="noreferrer">
                  <Button className="bg-violet-600 hover:bg-violet-500 text-white text-xs">
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
