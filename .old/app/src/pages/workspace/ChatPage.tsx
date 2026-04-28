import { useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { AIChatPanel } from '../../components/business/chat/AIChatPanel';
import { useAIChat } from '../../contexts/AIChatContext';

export function ChatPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const location = useLocation();
  const { setPageContext, setActiveConversationId } = useAIChat();

  const locationState = location.state as { fromAICreation?: boolean; conversationId?: string; agentId?: string } | null;

  useEffect(() => {
    setPageContext({
      label: 'AI 对话',
      pageKey: 'books',
      meta: { bookId },
    });
    return () => setPageContext(null);
  }, [bookId, setPageContext]);

  useEffect(() => {
    if (locationState?.conversationId) {
      setActiveConversationId(locationState.conversationId);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="absolute inset-0 flex overflow-hidden">
      <AIChatPanel withConversations initialAgentId={locationState?.agentId} />
    </div>
  );
}
