'use client'

import { useRouter } from 'next/navigation'
import { useNotifications } from '@/app/contexts/NotificationContext'

const TYPE_STYLE: Record<string, { icon: string; color: string }> = {
  결재요청: { icon: '📋', color: 'border-orange-400' },
  승인: { icon: '✅', color: 'border-green-500' },
  반려: { icon: '❌', color: 'border-red-500' }
}

export default function NotificationToastHost() {
  const { toastQueue, markAsRead, dismissToast } = useNotifications()
  const router = useRouter()

  if (toastQueue.length === 0) return null

  return (
    <div className="fixed top-20 right-4 z-[100] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
      {toastQueue.map(n => {
        const style = TYPE_STYLE[n.type] || { icon: '🔔', color: 'border-gray-300' }
        return (
          <div
            key={n.id}
            onClick={() => {
              markAsRead(n.id)
              dismissToast(n.id)
              if (n.document_id) router.push(`/approvals/${n.document_id}`)
            }}
            className={`bg-white shadow-lg rounded-lg border-l-4 ${style.color} p-3 flex items-start gap-2 cursor-pointer hover:shadow-xl transition`}
          >
            <span className="text-lg shrink-0">{style.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">{n.type}</p>
              <p className="text-sm text-gray-600 truncate">{n.message}</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); dismissToast(n.id) }}
              className="text-gray-300 hover:text-gray-500 shrink-0"
            >
              ✕
            </button>
          </div>
        )
      })}
    </div>
  )
}
