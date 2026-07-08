'use client'

import { AuthProvider } from '@/app/contexts/AuthContext'
import { NotificationProvider } from '@/app/contexts/NotificationContext'
import AuthGuard from './AuthGuard'
import ChatWidget from './ChatWidget'
import NotificationToastHost from './NotificationToastHost'

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <NotificationProvider>
        <AuthGuard>
          {children}
        </AuthGuard>
        <ChatWidget />
        <NotificationToastHost />
      </NotificationProvider>
    </AuthProvider>
  )
}
