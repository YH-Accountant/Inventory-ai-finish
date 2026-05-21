'use client'

import { useAuth } from '@/app/contexts/AuthContext'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect } from 'react'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (loading) return

    // 로그인 안 됨 → 로그인 페이지로
    if (!user && pathname !== '/login') {
      router.push('/login')
      return
    }

    // 온보딩 미완료 → /onboarding 으로 (로그인/온보딩 페이지 제외)
    if (user && profile && !profile.onboarding_completed
      && pathname !== '/onboarding'
      && pathname !== '/login') {
      router.push('/onboarding')
      return
    }
  }, [user, profile, loading, pathname, router])

  // 로딩 중
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-xl text-gray-500">로딩 중...</p>
      </div>
    )
  }

  // 로그인 페이지는 그냥 보여줌
  if (pathname === '/login') {
    return <>{children}</>
  }

  // 로그인 안 된 상태면 아무것도 안 보여줌 (리다이렉트 중)
  if (!user) {
    return null
  }

  return <>{children}</>
}
