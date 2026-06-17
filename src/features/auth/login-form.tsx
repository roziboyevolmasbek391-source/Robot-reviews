'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LogIn } from 'lucide-react';
import { loginAction } from '@/server/actions/auth-actions';
import { loginSchema, type LoginInput } from './schema';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' }
  });

  function onSubmit(values: LoginInput) {
    setError(null);
    startTransition(async () => {
      try {
        await loginAction(values);
      } catch (loginError) {
        setError(loginError instanceof Error ? loginError.message : 'Не удалось войти');
      }
    });
  }

  return (
    <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
      <Field label="Email" error={form.formState.errors.email?.message}>
        <Input type="email" autoComplete="email" {...form.register('email')} />
      </Field>
      <Field label="Пароль" error={form.formState.errors.password?.message}>
        <Input type="password" autoComplete="current-password" {...form.register('password')} />
      </Field>
      {error ? <p className="text-sm text-danger-600">{error}</p> : null}
      <Button type="submit" disabled={isPending}>
        <LogIn className="h-4 w-4" />
        Войти
      </Button>
    </form>
  );
}
