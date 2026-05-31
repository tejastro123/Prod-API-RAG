import { MessagesArea, ChatInput } from '@/components/ChatComponents'
import { useChatStore } from '@/stores/chat'

export function ChatPage() {
  const { activeThreadId, threads, clearMessages } = useChatStore()
  const thread = threads.find((t) => t.id === activeThreadId)

  return (
    <div className="chat-page">
      {/* Topbar */}
      <div className="topbar">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="topbar-title truncate">
            {thread?.title ?? 'New conversation'}
          </div>
        </div>
        {thread && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={clearMessages}
            title="Clear messages"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
            </svg>
            Clear
          </button>
        )}
      </div>

      {/* Messages */}
      <MessagesArea />

      {/* Input */}
      <ChatInput />
    </div>
  )
}
