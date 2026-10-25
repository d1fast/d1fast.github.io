import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

// Работы. Один кейс = папка src/content/work/<slug>/ с ru.md и en.md,
// медиа лежат в public/work/<slug>/. Тело файла: разделы «Задача», «Решения», «Результат».
const work = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/work' }),
  schema: z.object({
    title: z.string(),
    subtitle: z.string(),
    /** Пара предложений под названием в блоке «Работы» (вместо кнопки кейса). */
    summary: z.string(),
    /** Концепт: придуманный проект для портфолио, а не заказ клиента. В блоке рядом с годом стоит пометка. */
    concept: z.boolean().default(false),
    /** Своя страница кейса: у концептов её нет. */
    page: z.boolean().default(true),
    year: z.number(),
    order: z.number().default(0),
    role: z.string(),
    stack: z.array(z.string()),
    /** Обложка для карточки и OG (путь от корня сайта, без base). */
    cover: z.string(),
    coverAlt: z.string(),
    /** Видео: первый кадр работы в блоке, дальше скриншоты. mp4 и webm, постер. */
    video: z.object({ mp4: z.string(), webm: z.string(), poster: z.string() }).optional(),
    /** Галерея кейса. */
    media: z
      .array(z.object({ src: z.string(), alt: z.string(), caption: z.string().optional(), kind: z.enum(['image', 'video']).default('image'), portrait: z.boolean().default(false) }))
      .default([]),
    link: z.string().url().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { work };
