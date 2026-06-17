import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-radial from-slate-900 to-slate-950 p-4 font-sans text-slate-100">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />

      <div className="relative w-full max-w-md">
        <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 opacity-30 blur-lg transition duration-1000" />

        <Card className="relative border-slate-800 bg-slate-900/80 text-slate-100 backdrop-blur-xl">
          <CardHeader className="space-y-1 text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl border border-violet-500/20 bg-violet-600/10 text-violet-400">
              <MessageSquare className="h-6 w-6" aria-hidden="true" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight text-white">Publisher Robot</CardTitle>
            <CardDescription className="text-slate-400">
              Вход в локальную панель управления и просмотра дашборда.
            </CardDescription>
          </CardHeader>
          <form method="post" action="/api/auth/login">
            <CardContent className="space-y-4">
              {error ? (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
                  {decodeURIComponent(error)}
                </div>
              ) : null}
              <div className="space-y-2">
                <label
                  className="text-xs font-semibold uppercase tracking-wider text-slate-300"
                  htmlFor="username"
                >
                  Имя пользователя
                </label>
                <Input
                  id="username"
                  name="username"
                  type="text"
                  placeholder="admin"
                  required
                  className="border-slate-800 bg-slate-950 text-white placeholder-slate-500 focus:border-violet-500 focus:ring-violet-500"
                />
              </div>
              <div className="space-y-2">
                <label
                  className="text-xs font-semibold uppercase tracking-wider text-slate-300"
                  htmlFor="password"
                >
                  Пароль
                </label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="********"
                  required
                  minLength={8}
                  className="border-slate-800 bg-slate-950 text-white placeholder-slate-500 focus:border-violet-500 focus:ring-violet-500"
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button
                type="submit"
                className="w-full bg-violet-600 text-white transition duration-200 hover:bg-violet-500"
              >
                Войти в систему
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
