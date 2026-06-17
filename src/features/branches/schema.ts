import { BranchStatus } from '@prisma/client';
import { z } from 'zod';

export const workingDaySchema = z.object({
  day: z.string().min(1),
  open: z.string().min(1),
  close: z.string().min(1),
  closed: z.boolean().default(false)
});

export const branchSchema = z.object({
  name: z.string().min(2, 'Введите название филиала'),
  category: z.string().min(2, 'Укажите категорию'),
  address: z.string().min(5, 'Укажите адрес'),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  phone: z.string().min(5, 'Укажите телефон'),
  email: z.string().email('Введите корректный email'),
  website: z.string().url('Введите URL сайта'),
  description: z.string().min(20, 'Описание должно быть не короче 20 символов'),
  workingHours: z.array(workingDaySchema).min(1),
  photos: z.array(z.string().min(1)).default([]),
  logo: z.string().min(1).optional().or(z.literal('')),
  socialLinks: z.record(z.string(), z.string().url()).optional(),
  additionalData: z.record(z.string(), z.unknown()).optional(),
  status: z.nativeEnum(BranchStatus).default(BranchStatus.DRAFT)
});

export const branchPatchSchema = branchSchema.partial();

export type BranchInput = z.infer<typeof branchSchema>;
export type BranchPatchInput = z.infer<typeof branchPatchSchema>;

export const defaultWorkingHours = [
  { day: 'Понедельник', open: '09:00', close: '18:00', closed: false },
  { day: 'Вторник', open: '09:00', close: '18:00', closed: false },
  { day: 'Среда', open: '09:00', close: '18:00', closed: false },
  { day: 'Четверг', open: '09:00', close: '18:00', closed: false },
  { day: 'Пятница', open: '09:00', close: '18:00', closed: false },
  { day: 'Суббота', open: '10:00', close: '16:00', closed: false },
  { day: 'Воскресенье', open: '10:00', close: '16:00', closed: true }
] satisfies BranchInput['workingHours'];

export const requiredBranchFields: Array<keyof BranchInput> = [
  'name',
  'category',
  'address',
  'latitude',
  'longitude',
  'phone',
  'email',
  'website',
  'description',
  'workingHours'
];
