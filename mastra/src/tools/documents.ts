import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  listBooks,
  getDocumentTree,
  getDocument,
  createDocument,
  updateDocument,
  deleteDocument,
  archiveDocument,
  restoreDocument,
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
    '返回某本书的文档树（不含正文）。bookId 省略时使用当前选中的书。kind 可能是 folder/chapter/setting/outline/note。\n' +
    '为了节省 token，**强烈建议在你只关心子树时传 rootId 限定范围**（例如核查"角色"目录下的人物档时，传该 folder 的 id）。\n' +
    'depth 控制返回深度：省略=完整子树，0=只返回 rootId 节点本身（不带 children），1=根 + 直接子节点，依此类推。\n' +
    '默认只返回 status=active 的文档。需要看归档/回收站时显式传 includeArchived / includeDeleted。',
  inputSchema: z.object({
    bookId: z.string().optional(),
    rootId: z.string().nullable().optional(),
    depth: z.number().int().nonnegative().optional(),
    includeArchived: z.boolean().optional(),
    includeDeleted: z.boolean().optional(),
  }),
  execute: async ({ bookId, rootId, depth, includeArchived, includeDeleted }, ctx) => {
    const target = bookId ?? readBookIdFromContext(ctx);
    if (!target) throw new Error('bookId 缺失：请先在左侧选中一本书或显式传入 bookId');
    return {
      bookId: target,
      tree: await getDocumentTree(target, {
        rootId: rootId ?? null,
        depth,
        includeArchived,
        includeDeleted,
      }),
    };
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

export const createFolderTool = createTool({
  id: 'createFolder',
  description:
    '在指定书籍下创建一个分类文件夹（kind 固定为 folder，无正文）。用于组织设定层文档（如在"设定"下建"角色""物品""地点""势力"等子目录）。bookId 省略时使用当前选中的书。parentId 通常指向"设定"根文档；orderIndex 省略则追加到末尾。',
  inputSchema: z.object({
    bookId: z.string().optional(),
    parentId: z.string().nullable().optional(),
    title: z.string().min(1),
    orderIndex: z.number().int().nonnegative().optional(),
  }),
  execute: async (input, ctx) => {
    const bookId = input.bookId ?? readBookIdFromContext(ctx);
    if (!bookId) throw new Error('bookId 缺失：请先在左侧选中一本书或显式传入 bookId');
    return {
      document: await createDocument({
        bookId,
        parentId: input.parentId ?? null,
        kind: 'folder',
        title: input.title,
        orderIndex: input.orderIndex,
      }),
    };
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
  description:
    '把指定文档移入回收站（软删，**可恢复**，不会真正抹除数据）。若是 folder，子树会一同标记为 deleted。\n' +
    '默认 getDocumentTree 不会再返回这些文档，但搜索/向量也会自动跳过它们。如要还原请用 restoreDocument。',
  inputSchema: z.object({ id: z.string() }),
  execute: async ({ id }) => ({ deleted: await deleteDocument(id) }),
});

export const archiveDocumentTool = createTool({
  id: 'archiveDocument',
  description:
    '把指定文档标记为"已归档"（保留原层级位置，**不删除**）。归档后默认 tree/搜索/向量都跳过它，但仍可还原。\n' +
    '适用场景：阶段性配角/物品在某卷之后不再活跃；早期版本被新版替代但想留作参考；用户明确说"先收起来不删"。\n' +
    '若是 folder，子树会一同标记为 archived。要还原用 restoreDocument。',
  inputSchema: z.object({ id: z.string() }),
  execute: async ({ id }) => ({ archived: await archiveDocument(id) }),
});

export const restoreDocumentTool = createTool({
  id: 'restoreDocument',
  description:
    '把已归档或已软删的文档恢复成 active。若是 folder，子树会一同恢复。',
  inputSchema: z.object({ id: z.string() }),
  execute: async ({ id }) => ({ restored: await restoreDocument(id) }),
});

export const readOnlyDocumentTools = {
  listBooks: listBooksTool,
  getActiveBook: getActiveBookTool,
  getDocumentTree: getDocumentTreeTool,
  readDocument: readDocumentTool,
};

export const writeDocumentTools = {
  createDocument: createDocumentTool,
  createFolder: createFolderTool,
  updateDocument: updateDocumentTool,
  deleteDocument: deleteDocumentTool,
  archiveDocument: archiveDocumentTool,
  restoreDocument: restoreDocumentTool,
};

export const allDocumentTools = {
  ...readOnlyDocumentTools,
  ...writeDocumentTools,
};

