import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { AIChatPanel } from '../../components/business/chat/AIChatPanel';
import { useAIChat } from '../../contexts/AIChatContext';

export function ReviewPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const { setPageContext, setActiveBookId } = useAIChat();

  useEffect(() => {
    setPageContext({
      label: '书籍审阅',
      pageKey: 'review',
      recommendedAgentHint: 'reviewer',
      agentLocked: true,
    });
    setActiveBookId(bookId ?? null);
    return () => {
      setPageContext(null);
    };
  }, [bookId, setPageContext, setActiveBookId]);

  return (
    <div className="flex flex-col h-full min-h-0" style={{ minHeight: 'calc(100vh - 8rem)' }}>
      <AIChatPanel withConversations initialAgentId="preset-reviewer" />
    </div>
  );
}
