"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  formatDate,
  formatTime,
  getSourceColor,
  getSourceLabel,
} from "@/lib/utils";

interface SyncLog {
  id: string;
  source: string;
  syncedReviews: number;
  failedReviews: number;
  totalFound: number;
  duplicates: number;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  error: string | null;
  branch: {
    name: string;
  } | null;
}

export default function LogsPage() {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [triggerMsg, setTriggerMsg] = useState("");
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sync/trigger");
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Check auth
    fetch("/api/auth/me")
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error();
      })
      .then((data) => {
        setUser(data.user);
        if (data.user?.role === "ADMIN") {
          loadLogs();
        }
      })
      .catch(() => {})
      .finally(() => setAuthLoading(false));
  }, []);

  const handleManualSync = async () => {
    setTriggering(true);
    setTriggerMsg("");
    try {
      const res = await fetch("/api/sync/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (res.ok) {
        setTriggerMsg(data.message || "Синхронизация успешно запущена!");
        // Loglarni qayta yuklash uchun kutamiz
        setTimeout(() => {
          loadLogs();
        }, 3000);
      } else {
        setTriggerMsg("Ошибка при вызове синхронизации.");
      }
    } catch (e) {
      console.error(e);
      setTriggerMsg("Ошибка отправки запроса синхронизации.");
    } finally {
      setTriggering(false);
    }
  };

  if (authLoading) {
    return (
      <div className="text-center p-8 text-slate-500">Загрузка прав доступа...</div>
    );
  }

  if (!user || user.role !== "ADMIN") {
    return (
      <div className="flex flex-col items-center justify-center p-12 border border-slate-900 bg-slate-900/40 rounded-3xl max-w-xl mx-auto text-center space-y-4">
        <span className="text-4xl">🔒</span>
        <h3 className="text-lg font-bold text-white">У вас нет прав для доступа к этому разделу</h3>
        <p className="text-slate-400 text-xs">Данная страница доступна только администраторам системы.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Synchronization Logs</h2>
          <p className="text-slate-400 text-sm">Список всех логов синхронизации, выполненных вручную и в фоновом режиме</p>
        </div>
        <Button
          onClick={handleManualSync}
          disabled={triggering}
          className="bg-violet-600 hover:bg-violet-500 text-white text-xs px-6 h-10 w-full sm:w-auto"
        >
          {triggering ? "Отправка..." : "🔄 Запустить синхронизацию вручную"}
        </Button>
      </div>

      {triggerMsg && (
        <div className={`p-4 rounded-xl border text-xs ${
          triggerMsg.includes("успешно") || triggerMsg.includes("фоне")
            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
            : "bg-red-500/10 border-red-500/20 text-red-400"
        }`}>
          {triggerMsg}
        </div>
      )}

      {/* Logs Table */}
      <Card className="border-slate-800 bg-slate-900/20 text-slate-100">
        <CardHeader className="flex flex-row items-center justify-between border-b border-slate-900 pb-4">
          <div>
            <CardTitle className="text-sm font-bold text-white">Выполненные синхронизации</CardTitle>
            <CardDescription className="text-slate-400 text-[10px]">Показаны последние 20 записей.</CardDescription>
          </div>
          <Button onClick={loadLogs} variant="outline" size="sm" className="border-slate-800 text-xs h-8">
            Обновить 🔄
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-900 bg-slate-900/30 text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="p-4">Время</th>
                  <th className="p-4">Платформа</th>
                  <th className="p-4">Филиал</th>
                  <th className="p-4 text-center">Сохраненные отзывы</th>
                  <th className="p-4 text-center">Дубликаты</th>
                  <th className="p-4 text-center">Ошибки</th>
                  <th className="p-4">Статус</th>
                  <th className="p-4">Текст ошибки</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-500">
                      Загрузка...
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-500">
                      История синхронизаций пуста.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-900/20 transition-colors">
                      <td className="p-4 font-medium text-slate-300">
                        <div>{formatDate(log.startedAt)}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{formatTime(log.startedAt)}</div>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[9px] font-semibold ${getSourceColor(log.source)}`}>
                          {getSourceLabel(log.source)}
                        </span>
                      </td>
                      <td className="p-4 text-white font-medium">{log.branch?.name || "Все"}</td>
                      <td className="p-4 text-center text-emerald-400 font-bold">+{log.syncedReviews}</td>
                      <td className="p-4 text-center text-slate-500">{log.duplicates}</td>
                      <td className="p-4 text-center text-red-400">{log.failedReviews}</td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                          log.status === "COMPLETED"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : log.status === "FAILED"
                            ? "bg-red-500/10 text-red-400 border-red-500/20"
                            : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        }`}>
                          {log.status === "COMPLETED" ? "Успешно" : log.status === "FAILED" ? "Ошибка" : "В процессе"}
                        </span>
                      </td>
                      <td className="p-4 text-slate-400 max-w-xs truncate italic" title={log.error || ""}>
                        {log.error || "-"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
