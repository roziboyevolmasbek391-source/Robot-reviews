import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Введите корректный email').toLowerCase(),
  password: z.string().min(8, 'Пароль должен быть не короче 8 символов')
});

export type LoginInput = z.infer<typeof loginSchema>;
