import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  listBooks,
  getDocumentTree,
  getDocument,
  createDocument,
  updateDocument,
  deleteDocument,
  getBook,
} from '../db/books.ts';
import { readBookIdFromContext } from '../shared/request-context.ts';

const kindEnum = z.enum(['folder', 'chapter', 'setting', 'outline', 'note']);

export const listBooksTool = createTool({
  id: 'listBooks',
  description:
    '列出工作区所有书籍及元信息（id, 标题, 简介, 状态, 时间戳）。每条会标记 isActive=true 表示用户当前在编辑的书。',
  inputSchema: z.object({}),
  outputSchema: z.object({
    activeBookId: z.string().nullable(),
    books: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        synopsis: z.string().nullable(),
        status: z.string(),
        isActive: z.boolean(),
        createdAt: z.number(),
        updatedAt: z.number(),
      }),
    ),
  }),
  execute: async (_input, ctx) => {
    const activeBookId = readBookIdFromContext(ctx) ?? null;
    const books = await listBooks();
    return {
      activeBookId,
      books: books.map((b) => ({ ...b, isActive: b.id === activeBookId })),
    };
  },
});

export const getActiveBookTool = createTool({
  id: 'getActiveBook',
  description: '返回用户当前在 UI 左侧选中的书籍信息（id, 标题, 简介, 状态）。无需任何参数。',
  inputSchema: z.object({}),
  outputSchema: z.object({
    found: z.boolean(),
    book: z
      .object({
        id: z.string(),
        title: z.string(),
        synopsis: z.string().nullable(),
        status: z.string(),
        createdAt: z.number(),
        updatedAt: z.number(),
      })
      .optional(),
  }),
  execute: async (_input, ctx) => {
    const activeBookId = readBookIdFromContext(ctx);
    if (!activeBookId) return { found: false };
    const book = await getBook(activeBookId);
    if (!book) return { found: false };
    return {
      found: true,
      book: {
        id: book.id,
        title: book.title,
        synopsis: book.synopsis,
        status: book.status,
        createdAt: book.createdAt,
        updatedAt: book.updatedAt,
      },
    };
  },
});

export const getDocumentTreeTool = createTool({
  id: 'getDocumentTree',
  description:
    '返回某本书的文档树（不含正文）。bookId 省略时使用当前选中的书。kind 可能是 folder/chapter/setting/outline/note。',
  inputSchema: z.object({ bookId: z.string().optional() }),
  execute: async ({ bookId }, ctx) => {
    const target = bookId ?? readBookIdFromContext(ctx);
    if (!target) throw new Error('bookId 缺失：请先在左侧选中一本书或显式传入 bookId');
    return { bookId: target, tree: await getDocumentTree(target) };
  },
});

export const readDocumentTool = createTool({
  id: 'readDocument',
  description: '按文档 id 读取完整正文与元信息。',
  inputSchema: z.object({ id: z.string() }),
  execute: async ({ id }) => {
    const doc = await getDocument(id);
    if (!doc) return { found: false as const };
    return { found: true as const, document: doc };
  },
});

export const createDocumentTool = createTool({
  id: 'createDocument',
  description:
    '在指定书籍下创建新文档（章节/设定/大纲/笔记/文件夹）。bookId 省略时使用当前选中的书。parentId 为空表示顶层。orderIndex 省略则追加到末尾。',
  inputSchema: z.object({
    bookId: z.string().optional(),
    parentId: z.string().nullable().optional(),
    kind: kindEnum,
    title: z.string().min(1),
    content: z.string().optional(),
    orderIndex: z.number().int().nonnegative().optional(),
  }),
  execute: async (input, ctx) => {
    const bookId = input.bookId ?? readBookIdFromContext(ctx);
    if (!bookId) throw new Error('bookId 缺失：请先在左侧选中一本书或显式传入 bookId');
    return { document: await createDocument({ ...input, bookId }) };
  },
});

export const updateDocumentTool = createTool({
  id: 'updateDocument',
  description:
    '更新已有文档的标题、正文、父节点或排序。仅传入需要修改的字段；其余保持不变。',
  inputSchema: z.object({
    id: z.string(),
    title: z.string().min(1).optional(),
    content: z.string().optional(),
    parentId: z.string().nullable().optional(),
    orderIndex: z.number().int().nonnegative().optional(),
  }),
  execute: async (input) => {
    const doc = await updateDocument(input);
    if (!doc) return { found: false as const };
    return { found: true as const, document: doc };
  },
});

export const deleteDocumentTool = createTool({
  id: 'deleteDocument',
  description: '删除指定文档（若为文件夹则其子文档需自行处理；当前实现不级联）。',
  inputSchema: z.object({ id: z.string() }),
  execute: async ({ id }) => ({ deleted: await deleteDocument(id) }),
});

export const readOnlyDocumentTools = {
  listBooks: listBooksTool,
  getActiveBook: getActiveBookTool,
  getDocumentTree: getDocumentTreeTool,
  readDocument: readDocumentTool,
};

export const writeDocumentTools = {
  createDocument: createDocumentTool,
  updateDocument: updateDocumentTool,
  deleteDocument: deleteDocumentTool,
};

export const allDocumentTools = {
  ...readOnlyDocumentTools,
  ...writeDocumentTools,
};

