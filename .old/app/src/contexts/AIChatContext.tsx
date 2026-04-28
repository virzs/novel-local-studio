import { createContext, useContext, useState, useCallback } from 'react';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

export type Conversation = {
  id: string;
  resourceId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
};

export type PageContext = {
  label: string;
  pageKey?: string;
  meta?: Record<string, unknown>;
  recommendedAgentHint?: string;
  /** When true, the agent selector in AIChatPanel is disabled (locked to the recommended agent) */
  agentLocked?: boolean;
};

type AIChatContextValue = {
  pendingMessage: string | null;
  setPendingMessage: (msg: string | null) => void;
  clearPendingMessage: () => void;
  pageContext: PageContext | null;
  setPageContext: (ctx: PageContext | null) => void;
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
  activeBookId: string | null;
  setActiveBookId: (id: string | null) => void;
  onProjectCreated: (() => void) | null;
  setOnProjectCreated: (fn: (() => void) | null) => void;
  onBookCreated: ((bookId: string, conversationId?: string | null) => void) | null;
  setOnBookCreated: (fn: ((bookId: string, conversationId?: string | null) => void) | null) => void;
  triggerNewConversation: (() => void) | null;
  setTriggerNewConversation: (fn: (() => void) | null) => void;
  convListRefreshKey: number;
  bumpConvListRefreshKey: () => void;
};

const AIChatContext = createContext<AIChatContextValue | null>(null);

export function AIChatProvider({ children }: { children: React.ReactNode }) {
  const [pendingMessage, setPendingMessageState] = useState<string | null>(null);
  const [pageContext, setPageContextState] = useState<PageContext | null>(null);
  const [activeConversationId, setActiveConversationIdState] = useState<string | null>(null);
  const [activeBookId, setActiveBookIdState] = useState<string | null>(null);
  const [onProjectCreated, setOnProjectCreatedState] = useState<(() => void) | null>(null);
  const [onBookCreated, setOnBookCreatedState] = useState<((bookId: string, conversationId?: string | null) => void) | null>(null);
  const [triggerNewConversation, setTriggerNewConversationState] = useState<(() => void) | null>(null);
  const [convListRefreshKey, setConvListRefreshKey] = useState(0);

  const setPendingMessage = useCallback((msg: string | null) => {
    setPendingMessageState(msg);
  }, []);

  const clearPendingMessage = useCallback(() => {
    setPendingMessageState(null);
  }, []);

  const setPageContext = useCallback((ctx: PageContext | null) => {
    setPageContextState(ctx);
  }, []);

  const setActiveConversationId = useCallback((id: string | null) => {
    setActiveConversationIdState(id);
  }, []);

  const setActiveBookId = useCallback((id: string | null) => {
    setActiveBookIdState(id);
  }, []);

  const setOnProjectCreated = useCallback((fn: (() => void) | null) => {
    setOnProjectCreatedState(() => fn);
  }, []);

  const setOnBookCreated = useCallback((fn: ((bookId: string, conversationId?: string | null) => void) | null) => {
    setOnBookCreatedState(() => fn);
  }, []);

  const setTriggerNewConversation = useCallback((fn: (() => void) | null) => {
    setTriggerNewConversationState(() => fn);
  }, []);

  const bumpConvListRefreshKey = useCallback(() => {
    setConvListRefreshKey((k) => k + 1);
  }, []);

  return (
    <AIChatContext.Provider
      value={{
        pendingMessage,
        setPendingMessage,
        clearPendingMessage,
        pageContext,
        setPageContext,
        activeConversationId,
        setActiveConversationId,
        activeBookId,
        setActiveBookId,
        onProjectCreated,
        setOnProjectCreated,
        onBookCreated,
        setOnBookCreated,
        triggerNewConversation,
        setTriggerNewConversation,
        convListRefreshKey,
        bumpConvListRefreshKey,
      }}
    >
      {children}
    </AIChatContext.Provider>
  );
}

export function useAIChat() {
  const ctx = useContext(AIChatContext);
  if (!ctx) throw new Error('useAIChat must be used inside AIChatProvider');
  return ctx;
}
