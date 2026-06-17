'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { ImageUploader } from '@/components/ui/image-uploader';
import { createBranchAction, updateBranchAction } from '@/server/actions/branch-actions';
import { branchSchema, defaultWorkingHours, type BranchInput } from './schema';

export type BranchFormRecord = {
  id: string;
  name: string;
  category: string;
  address: string;
  latitude: number;
  longitude: number;
  phone: string;
  email: string;
  website: string;
  description: string;
  workingHours: unknown;
  photos: string[];
  logo: string | null;
  status: BranchInput['status'];
};

type BranchFormProps = {
  branch?: BranchFormRecord;
};

export function BranchForm({ branch }: BranchFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<BranchInput>({
    resolver: zodResolver(branchSchema) as any,
    defaultValues: mapBranchToForm(branch)
  });

  function onSubmit(values: BranchInput) {
    setError(null);
    startTransition(async () => {
      try {
        if (branch) {
          await updateBranchAction(branch.id, values);
        } else {
          await createBranchAction(values);
        }
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : 'Не удалось сохранить филиал');
      }
    });
  }

  // Watch photos and logo to keep ImageUploader in sync with form state
  const photos = form.watch('photos') ?? [];
  const logo = form.watch('logo');

  return (
    <form className="grid gap-5" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Название филиала" error={form.formState.errors.name?.message}>
          <Input {...form.register('name')} />
        </Field>
        <Field label="Категория" error={form.formState.errors.category?.message}>
          <Input {...form.register('category')} />
        </Field>
        <Field label="Адрес" error={form.formState.errors.address?.message}>
          <Input {...form.register('address')} />
        </Field>
        <Field label="Телефон" error={form.formState.errors.phone?.message}>
          <Input {...form.register('phone')} />
        </Field>
        <Field label="Email" error={form.formState.errors.email?.message}>
          <Input type="email" {...form.register('email')} />
        </Field>
        <Field label="Сайт" error={form.formState.errors.website?.message}>
          <Input type="url" {...form.register('website')} />
        </Field>
        <Field label="Широта" error={form.formState.errors.latitude?.message}>
          <Input type="number" step="0.000001" {...form.register('latitude')} />
        </Field>
        <Field label="Долгота" error={form.formState.errors.longitude?.message}>
          <Input type="number" step="0.000001" {...form.register('longitude')} />
        </Field>
      </div>
      <Field label="Описание" error={form.formState.errors.description?.message}>
        <Textarea {...form.register('description')} />
      </Field>

      {/* ── Image uploads ── */}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <ImageUploader
            label="Логотип"
            single
            value={logo ? [logo] : []}
            onChange={(paths) => {
              form.setValue('logo', paths[0] ?? '', { shouldDirty: true });
            }}
          />
          {form.formState.errors.logo?.message && (
            <p className="mt-1 text-sm text-danger-600">{form.formState.errors.logo.message}</p>
          )}
        </div>
        <div>
          <ImageUploader
            label="Фотографии"
            maxFiles={20}
            value={photos}
            onChange={(paths) => {
              form.setValue('photos', paths, { shouldDirty: true });
            }}
          />
        </div>
      </div>

      {/* ── Working hours ── */}
      <div className="grid gap-3">
        <p className="text-sm font-medium text-ink">Часы работы</p>
        <div className="grid gap-2">
          {defaultWorkingHours.map((day, index) => (
            <div key={day.day} className="grid gap-2 rounded-md border border-white/10 bg-white/4 p-3 md:grid-cols-4">
              <Input readOnly {...form.register(`workingHours.${index}.day` as const)} />
              <Input type="time" {...form.register(`workingHours.${index}.open` as const)} />
              <Input type="time" {...form.register(`workingHours.${index}.close` as const)} />
              <label className="flex items-center gap-2 text-sm text-muted">
                <input type="checkbox" {...form.register(`workingHours.${index}.closed` as const)} />
                Закрыто
              </label>
            </div>
          ))}
        </div>
      </div>
      {error ? <p className="text-sm text-danger-600">{error}</p> : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          <Save className="h-4 w-4" />
          Сохранить
        </Button>
      </div>
    </form>
  );
}

function mapBranchToForm(branch?: BranchFormRecord): BranchInput {
  if (!branch) {
    return {
      name: '',
      category: '',
      address: '',
      latitude: 0,
      longitude: 0,
      phone: '',
      email: '',
      website: '',
      description: '',
      workingHours: defaultWorkingHours,
      photos: [],
      logo: '',
      status: 'DRAFT'
    };
  }

  return {
    name: branch.name,
    category: branch.category,
    address: branch.address,
    latitude: Number(branch.latitude),
    longitude: Number(branch.longitude),
    phone: branch.phone,
    email: branch.email,
    website: branch.website,
    description: branch.description,
    workingHours: Array.isArray(branch.workingHours) ? branch.workingHours : defaultWorkingHours,
    photos: branch.photos,
    logo: branch.logo ?? '',
    status: branch.status
  } as BranchInput;
}
