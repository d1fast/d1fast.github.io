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
    /** Короткое описание рядом с видео в окне кейса. */
    summary: z.string(),
    /** Демонстрационный проект для портфолио без реального заказчика. */
    concept: z.boolean().default(false),
    /** Отдельная страница по прямой ссылке. Окно на главной доступно у всех работ. */
    page: z.boolean().default(true),
    year: z.number(),
    order: z.number().default(0),
    role: z.string(),
    stack: z.array(z.string()),
    /** Обложка для карточки и OG (путь от корня сайта, без base). */
    cover: z.string(),
    coverAlt: z.string(),
    /** Видео и постер. Источники загружаются после выбора работы. */
    video: z.object({ mp4: z.string(), webm: z.string(), poster: z.string() }).optional(),
    /** Галерея кейса. */
    media: z
      .array(z.object({ src: z.string(), alt: z.string(), caption: z.string().optional(), kind: z.enum(['image', 'video']).default('image'), portrait: z.boolean().default(false) }))
      .default([]),
    link: z.url().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { work };
