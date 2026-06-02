import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Message, Thread } from '@/types'
import { sendChatMessage, parseSSE } from '@/lib/api'
import { nanoid } from '@/lib/utils'

interface ChatStore {
  // Data
  threads: Thread[]
  activeThreadId: string
  messages: Record<string, Message[]>
  isStreaming: boolean
  streamingContent: string

  // Actions
  sendMessage: (content: string) => Promise<void>
  createThread: () => void
  deleteThread: (id: string) => void
  setActiveThread: (id: string) => void
  renameThread: (id: string, title: string) => void
  clearMessages: () => void
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      threads: [],
      activeThreadId: 'default',
      messages: {},
      isStreaming: false,
      streamingContent: '',

      createThread: () => {
        const id = nanoid()
        const now = Date.now()
        const thread: Thread = {
          id,
          title: 'New Thread',
          createdAt: now,
          updatedAt: now,
          messageCount: 0,
        }
        set((s) => ({
          threads: [thread, ...s.threads],
          activeThreadId: id,
          messages: { ...s.messages, [id]: [] },
        }))
      },

      deleteThread: (id: string) => {
        set((s) => {
          const { [id]: _, ...rest } = s.messages
          const threads = s.threads.filter((t) => t.id !== id)
          const activeThreadId =
            s.activeThreadId === id
              ? threads[0]?.id ?? 'default'
              : s.activeThreadId
          return { threads, messages: rest, activeThreadId }
        })
      },

      setActiveThread: (id: string) => set({ activeThreadId: id }),

      renameThread: (id: string, title: string) => {
        set((s) => ({
          threads: s.threads.map((t) =>
            t.id === id ? { ...t, title, updatedAt: Date.now() } : t
          ),
        }))
      },

      clearMessages: () => {
        const { activeThreadId } = get()
        set((s) => ({
          messages: { ...s.messages, [activeThreadId]: [] },
        }))
      },

      sendMessage: async (content: string) => {
        const { activeThreadId, messages, threads } = get()

        // Add user message
        const userMsg: Message = {
          id: nanoid(),
          role: 'user',
          content,
          timestamp: Date.now(),
        }

        const threadMessages = messages[activeThreadId] ?? []
        set((s) => ({
          messages: {
            ...s.messages,
            [activeThreadId]: [...threadMessages, userMsg],
          },
          isStreaming: true,
          streamingContent: '',
        }))

        // Update thread metadata
        const isNew = !threads.find((t) => t.id === activeThreadId)
        if (isNew) {
          const now = Date.now()
          const thread: Thread = {
            id: activeThreadId,
            title: content.slice(0, 40) + (content.length > 40 ? '…' : ''),
            createdAt: now,
            updatedAt: now,
            messageCount: 1,
          }
          set((s) => ({ threads: [thread, ...s.threads] }))
        } else {
          set((s) => ({
            threads: s.threads.map((t) =>
              t.id === activeThreadId
                ? {
                    ...t,
                    title:
                      t.messageCount === 0
                        ? content.slice(0, 40)
                        : t.title,
                    updatedAt: Date.now(),
                    messageCount: t.messageCount + 1,
                  }
                : t
            ),
          }))
        }

        try {
          const res = await sendChatMessage(content, activeThreadId)

          if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: 'Request failed' }))
            const errMsg: Message = {
              id: nanoid(),
              role: 'assistant',
              content: `⚠ ${err.detail ?? 'Request failed'}`,
              timestamp: Date.now(),
            }
            set((s) => ({
              messages: {
                ...s.messages,
                [activeThreadId]: [
                  ...(s.messages[activeThreadId] ?? []),
                  errMsg,
                ],
              },
              isStreaming: false,
            }))
            return
          }

          const contentType = res.headers.get('content-type') ?? ''
          const isStream = contentType.includes('text/event-stream')

          if (isStream && res.body) {
            // Streaming path
            let accumulatedContent = ''
            let metadata: Partial<Message> = {}

            const assistantMsgId = nanoid()

            // Optimistically insert placeholder
            set((s) => ({
              messages: {
                ...s.messages,
                [activeThreadId]: [
                  ...(s.messages[activeThreadId] ?? []),
                  {
                    id: assistantMsgId,
                    role: 'assistant' as const,
                    content: '',
                    timestamp: Date.now(),
                    isStreaming: true,
                  },
                ],
              },
            }))

            for await (const event of parseSSE(res.body)) {
              if (event.event === 'token') {
                accumulatedContent += event.data.content
                set((s) => ({
                  streamingContent: accumulatedContent,
                  messages: {
                    ...s.messages,
                    [activeThreadId]: (s.messages[activeThreadId] ?? []).map(
                      (m) =>
                        m.id === assistantMsgId
                          ? { ...m, content: accumulatedContent }
                          : m
                    ),
                  },
                }))
              } else if (event.event === 'metadata') {
                metadata = {
                  cached: event.data.cached,
                  model_used: event.data.model_used,
                  processing_time_ms: event.data.processing_time_ms,
                }
              } else if (event.event === 'security') {
                metadata.security_notes = event.data.notes
              } else if (event.event === 'graph_node') {
                const nodeEvent = event.data
                set((s) => {
                  const currentMsgs = s.messages[activeThreadId] ?? []
                  const updatedMsgs = currentMsgs.map((m) => {
                    if (m.id === assistantMsgId) {
                      const currentNodes = m.graphNodes ?? []
                      const exists = currentNodes.some(
                        (n) => n.node === nodeEvent.node && n.status === nodeEvent.status
                      )
                      let newNodes = currentNodes
                      if (!exists) {
                        const startIndex = currentNodes.findIndex(
                          (n) => n.node === nodeEvent.node && n.status === 'start'
                        )
                        if (startIndex !== -1 && nodeEvent.status !== 'start') {
                          newNodes = [...currentNodes]
                          newNodes[startIndex] = nodeEvent
                        } else {
                          newNodes = [...currentNodes, nodeEvent]
                        }
                      }
                      return { ...m, graphNodes: newNodes }
                    }
                    return m
                  })
                  return { messages: { ...s.messages, [activeThreadId]: updatedMsgs } }
                })
              } else if (event.event === 'done') {
                const final = event.data
                set((s) => ({
                  messages: {
                    ...s.messages,
                    [activeThreadId]: (s.messages[activeThreadId] ?? []).map(
                      (m) =>
                        m.id === assistantMsgId
                          ? {
                              ...m,
                              content: final.response,
                              model_used: final.model_used,
                              cached: final.cached,
                              processing_time_ms: final.processing_time_ms,
                              security_notes: final.security_notes,
                              isStreaming: false,
                            }
                          : m
                    ),
                  },
                  isStreaming: false,
                  streamingContent: '',
                }))
                return
              } else if (event.event === 'error') {
                set((s) => ({
                  messages: {
                    ...s.messages,
                    [activeThreadId]: (s.messages[activeThreadId] ?? []).map(
                      (m) =>
                        m.id === assistantMsgId
                          ? {
                              ...m,
                              content: `⚠ ${event.data.message}`,
                              isStreaming: false,
                            }
                          : m
                    ),
                  },
                  isStreaming: false,
                }))
                return
              }
            }

            // Stream ended without 'done' event — finalize
            set((s) => ({
              messages: {
                ...s.messages,
                [activeThreadId]: (s.messages[activeThreadId] ?? []).map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, ...metadata, isStreaming: false }
                    : m
                ),
              },
              isStreaming: false,
              streamingContent: '',
            }))
          } else {
            // Non-streaming JSON response
            const data = await res.json()
            const assistantMsg: Message = {
              id: nanoid(),
              role: 'assistant',
              content: data.response,
              timestamp: Date.now(),
              model_used: data.model_used,
              cached: data.cached,
              processing_time_ms: data.processing_time_ms,
              security_notes: data.security_notes,
            }
            set((s) => ({
              messages: {
                ...s.messages,
                [activeThreadId]: [
                  ...(s.messages[activeThreadId] ?? []),
                  assistantMsg,
                ],
              },
              isStreaming: false,
            }))
          }
        } catch (error) {
          console.error('Chat error:', error)
          const errMsg: Message = {
            id: nanoid(),
            role: 'assistant',
            content: '⚠ Connection error. Please check your network and try again.',
            timestamp: Date.now(),
          }
          set((s) => ({
            messages: {
              ...s.messages,
              [activeThreadId]: [
                ...(s.messages[activeThreadId] ?? []),
                errMsg,
              ],
            },
            isStreaming: false,
          }))
        }
      },
    }),
    {
      name: 'rag-chat-store',
      partialize: (s) => ({
        threads: s.threads,
        activeThreadId: s.activeThreadId,
        messages: s.messages,
      }),
    }
  )
)
