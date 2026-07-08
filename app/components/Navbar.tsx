'use client'

import Link from 'next/link'
import { useState, useRef, useEffect } from 'react'
import { useAuth } from '@/app/contexts/AuthContext'
import { useNotifications } from '@/app/contexts/NotificationContext'
import { usePathname, useRouter } from 'next/navigation'

const NAV_LINKS = [
  { href: '/approvals', label: '결재' },
  { href: '/transactions', label: '입출고' },
  { href: '/exceptions', label: '예외리스트' },
  { href: '/products', label: '제품관리' },
  { href: '/lots', label: '로트관리' },
  { href: '/plans', label: '기획관리' },
  { href: '/report', label: 'AI 리포트' },
]

export default function Navbar() {
  const { profile, signOut } = useAuth()
  const { notifications, unreadCount, markAsRead } = useNotifications()
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const bellRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const initial = profile?.name?.[0]?.toUpperCase() || '?'

  return (
    <nav className="bg-blue-900 text-white fixed top-0 left-0 right-0 z-40 shadow-md">
      {/* 상단 행: 로고 + 메뉴(데스크탑) + 프로필 */}
      <div className="h-14 flex items-center px-4 md:px-6 gap-4 md:gap-8">
        {/* 로고 */}
        <Link href="/" className="font-bold text-base flex items-center gap-2 shrink-0 hover:text-blue-200 transition">
          <span className="text-lg">📦</span>
          <span>재고AI</span>
        </Link>

        {/* 데스크탑 메뉴 */}
        <div className="hidden md:flex items-center gap-1 flex-1">
          {NAV_LINKS.map(({ href, label }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  active
                    ? 'bg-blue-700 text-white'
                    : 'text-blue-200 hover:text-white hover:bg-blue-800'
                }`}
              >
                {label}
              </Link>
            )
          })}
        </div>

        {/* 알림 벨 */}
        <div className="relative shrink-0 ml-auto" ref={bellRef}>
          <button
            onClick={() => setBellOpen(!bellOpen)}
            className="relative flex items-center justify-center hover:bg-blue-800 w-9 h-9 rounded-lg transition"
          >
            <span className="text-lg">🔔</span>
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 bg-red-500 rounded-full text-[10px] font-bold flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {bellOpen && (
            <div className="absolute right-0 top-12 bg-white text-gray-700 rounded-xl shadow-xl w-80 max-w-[calc(100vw-2rem)] py-2 z-50 border border-gray-100 max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-6">알림이 없습니다</p>
              ) : (
                notifications.map(n => (
                  <button
                    key={n.id}
                    onClick={() => {
                      markAsRead(n.id)
                      setBellOpen(false)
                      if (n.document_id) router.push(`/approvals/${n.document_id}`)
                    }}
                    className={`w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm flex items-start gap-2 ${!n.read_at ? 'bg-blue-50/50' : ''}`}
                  >
                    {!n.read_at && <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1.5 shrink-0" />}
                    <div className={!n.read_at ? '' : 'pl-3.5'}>
                      <p className="font-medium">{n.type}</p>
                      <p className="text-gray-500 text-xs mt-0.5">{n.message}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* 프로필 드롭다운 */}
        <div className="relative shrink-0" ref={dropdownRef}>
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center gap-2 hover:bg-blue-800 px-2 md:px-3 py-1.5 rounded-lg transition"
          >
            <div className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center text-xs font-bold">
              {initial}
            </div>
            <span className="hidden sm:inline text-sm font-medium">{profile?.name}</span>
            <span className={`hidden sm:inline text-xs px-1.5 py-0.5 rounded-full font-medium ${
              profile?.role === '본사' ? 'bg-blue-700 text-blue-200' : 'bg-emerald-700 text-emerald-200'
            }`}>
              {profile?.role}
            </span>
            <svg className={`w-3 h-3 text-blue-300 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {open && (
            <div className="absolute right-0 top-12 bg-white text-gray-700 rounded-xl shadow-xl w-48 py-2 z-50 border border-gray-100">
              <Link
                href="/upload"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-gray-50 text-sm"
              >
                <span>📤</span> 엑셀 업로드
              </Link>
              <Link
                href="/onboarding"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-gray-50 text-sm"
              >
                <span>🚀</span> 시작 가이드
                {!profile?.onboarding_completed && (
                  <span className="ml-auto w-2 h-2 bg-red-500 rounded-full" />
                )}
              </Link>
              <Link
                href="/settings"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-gray-50 text-sm"
              >
                <span>⚙️</span> 회사 설정
              </Link>
              <div className="border-t my-1" />
              <button
                onClick={() => { setOpen(false); signOut() }}
                className="w-full text-left flex items-center gap-2.5 px-4 py-2.5 hover:bg-red-50 text-red-600 text-sm"
              >
                <span>→</span> 로그아웃
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 모바일 하단 행: 가로 스크롤 메뉴 */}
      <div className="md:hidden border-t border-blue-800 overflow-x-auto">
        <div className="flex items-center px-2 py-1 gap-1 min-w-max">
          {NAV_LINKS.map(({ href, label }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition whitespace-nowrap ${
                  active
                    ? 'bg-blue-700 text-white'
                    : 'text-blue-200 hover:text-white hover:bg-blue-800'
                }`}
              >
                {label}
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
