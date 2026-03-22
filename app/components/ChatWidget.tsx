'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/app/contexts/AuthContext'

interface Product {
  id: string
  product_name: string
  product_code: string
}

interface Warehouse {
  id: string
  name: string
}

interface InventoryItem {
  product_id: string
  warehouse_id: string
  quantity: number
  products: { product_name: string }
  warehouses: { name: string }
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  data?: {
    action: string
    action_detail?: string
    product_name?: string
    quantity?: number
    warehouse?: string
    to_warehouse?: string  // 창고 이동 시 목적지
    channel?: string
    date?: string  // YYYY-MM-DD 형식
    lot_number?: string  // 입고 시 로트번호 (YYMMDD-01)
    note?: string
  }
}

export default function ChatWidget() {
  const { profile } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: '안녕하세요! 재고관리 AI입니다.\n\n예시: "쿠션A 500개 올리브영 출고"\n           입고(생산)/출고/(내부)이동'
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [pendingAction, setPendingAction] = useState<Message['data'] | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 채팅창 열릴 때 입력란 자동 포커스
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  async function fetchData() {
    const { data: productsData } = await supabase
      .from('products')
      .select('id, product_name, product_code')
      .eq('is_active', true)

    const { data: warehousesData } = await supabase
      .from('warehouses')
      .select('id, name')

    const { data: inventoryData } = await supabase
      .from('inventory')
      .select('product_id, warehouse_id, quantity, products(product_name), warehouses(name)')

    setProducts(productsData || [])
    setWarehouses(warehousesData || [])
    setInventory(inventoryData || [])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || loading) return

    const userMessage = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setLoading(true)

    try {
      // 최근 대화 히스토리 (최대 6개)를 함께 전달
      const recentHistory = messages.slice(-6).map(m => ({
        role: m.role,
        content: m.content
      }))

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          products,
          warehouses,
          inventory,
          history: recentHistory
        })
      })

      const data = await response.json()

      if (data.error) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: '오류가 발생했습니다. 다시 시도해주세요.'
        }])
        return
      }

      // 새 로직: AI가 스스로 추론하여 필요한 것만 질문
      if (data.action === '입고' || data.action === '출고' || data.action === '창고이동') {
        // 필수 정보가 모두 있는지 검증
        const hasRequiredFields = data.product_name && data.quantity && data.warehouse
          && (data.action !== '창고이동' || data.to_warehouse)

        if (hasRequiredFields) {
          // 모든 정보가 확정된 경우 - 확인 버튼 표시
          setPendingAction({
            action: data.action,
            product_name: data.product_name,
            quantity: data.quantity,
            warehouse: data.warehouse,
            to_warehouse: data.to_warehouse,
            channel: data.channel,
            date: data.date,
            lot_number: data.lot_number
          })
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: data.message + '\n\n진행할까요?',
            data
          }])
        } else {
          // 필수 정보 부족 - 질문으로 처리 (텍스트 입력 가능)
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: data.message
          }])
        }
      } else if (data.action === '질문') {
        // AI가 추가 정보 필요 - 질문만 표시
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.message
        }])
      } else if (data.action === '조회') {
        const inv = await getInventory(data.product_name)
        setMessages(prev => [...prev, { role: 'assistant', content: inv }])
      } else {
        // 기타 응답
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.message || '요청을 이해하지 못했습니다. 다시 말씀해주세요.'
        }])
      }
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '네트워크 오류가 발생했습니다.'
      }])
    } finally {
      setLoading(false)
      // 입력란에 자동 포커스 유지
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }

  async function getInventory(productName: string) {
    const { data } = await supabase
      .from('inventory')
      .select(`quantity, products!inner(product_name), warehouses!inner(name)`)

    if (!data || data.length === 0) return '등록된 재고가 없습니다.'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filtered = data.filter((item: any) =>
      item.products?.product_name?.includes(productName)
    )

    if (filtered.length === 0) return `"${productName}" 관련 재고를 찾을 수 없습니다.`

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = filtered.map((item: any) =>
      `${item.products?.product_name} - ${item.warehouses?.name}: ${item.quantity.toLocaleString()}개`
    ).join('\n')

    return `재고 현황:\n${result}`
  }

  async function confirmAction() {
    if (!pendingAction) return
    setLoading(true)

    try {
      const product = products.find(p =>
        p.product_name.includes(pendingAction.product_name || '') ||
        p.product_code.includes(pendingAction.product_name || '')
      )

      if (!product) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `"${pendingAction.product_name}" 제품을 찾을 수 없습니다.`
        }])
        setPendingAction(null)
        return
      }

      const warehouse = warehouses.find(w =>
        w.name.includes(pendingAction.warehouse || '충주')
      ) || warehouses[0]

      if (!warehouse) {
        setMessages(prev => [...prev, { role: 'assistant', content: '창고를 찾을 수 없습니다.' }])
        setPendingAction(null)
        return
      }

      // 비고 메모 생성
      const noteText = pendingAction.channel
        ? `[${pendingAction.channel}] AI 채팅으로 등록`
        : 'AI 채팅으로 등록'

      // 입고용 로트번호: AI가 준 것 또는 오늘 날짜 자동 생성
      const lotNumber = pendingAction.lot_number || (() => {
        const today = new Date()
        const yy = today.getFullYear().toString().slice(-2)
        const mm = (today.getMonth() + 1).toString().padStart(2, '0')
        const dd = today.getDate().toString().padStart(2, '0')
        return `${yy}${mm}${dd}-01`
      })()

      // 창고 이동인 경우
      const isTransfer = pendingAction.action === '창고이동' && pendingAction.to_warehouse

      if (isTransfer) {
        const toWarehouse = warehouses.find(w =>
          w.name.includes(pendingAction.to_warehouse || '')
        )

        if (!toWarehouse) {
          setMessages(prev => [...prev, { role: 'assistant', content: `"${pendingAction.to_warehouse}" 창고를 찾을 수 없습니다.` }])
          setPendingAction(null)
          return
        }

        // 이동 시 출발 창고 재고 부족 체크
        const { data: fromInvCheck } = await supabase
          .from('inventory')
          .select('quantity')
          .eq('product_id', product.id)
          .eq('warehouse_id', warehouse.id)
          .gt('quantity', 0)

        const fromTotal = (fromInvCheck || []).reduce((sum, inv) => sum + inv.quantity, 0)
        if (fromTotal < (pendingAction.quantity || 0)) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `재고 부족!\n\n${warehouse.name} 가용 재고: ${fromTotal.toLocaleString()}개\n요청: ${pendingAction.quantity?.toLocaleString()}개`
          }])
          setPendingAction(null)
          return
        }

        // 날짜 처리: 지정된 날짜가 있으면 사용, 없으면 현재 시간
        const transactionDate = pendingAction.date
          ? new Date(pendingAction.date + 'T09:00:00').toISOString()
          : new Date().toISOString()

        // 이동 트랜잭션 (단일 레코드)
        await supabase.from('transactions').insert([{
          product_id: product.id,
          warehouse_id: warehouse.id,
          type: '이동',
          quantity: pendingAction.quantity,
          channel: null,
          note: `${warehouse.name} → ${toWarehouse.name}`,
          recorded_by: profile?.name || 'AI',
          created_at: transactionDate
        }])

        // 3. from 창고 재고 감소
        const { data: fromInv } = await supabase
          .from('inventory')
          .select('id, quantity')
          .eq('product_id', product.id)
          .eq('warehouse_id', warehouse.id)
          .single()

        if (fromInv) {
          await supabase.from('inventory')
            .update({ quantity: fromInv.quantity - (pendingAction.quantity || 0) })
            .eq('id', fromInv.id)
        }

        // 4. to 창고 재고 증가
        const { data: toInv } = await supabase
          .from('inventory')
          .select('id, quantity')
          .eq('product_id', product.id)
          .eq('warehouse_id', toWarehouse.id)
          .single()

        if (toInv) {
          await supabase.from('inventory')
            .update({ quantity: toInv.quantity + (pendingAction.quantity || 0) })
            .eq('id', toInv.id)
        } else {
          await supabase.from('inventory').insert([{
            product_id: product.id,
            warehouse_id: toWarehouse.id,
            quantity: pendingAction.quantity
          }])
        }

        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `이동 완료!\n${product.product_name} ${pendingAction.quantity?.toLocaleString()}개\n${warehouse.name} → ${toWarehouse.name}`
        }])
      } else {
        // 날짜 처리: 지정된 날짜가 있으면 사용, 없으면 현재 시간
        const transactionDate = pendingAction.date
          ? new Date(pendingAction.date + 'T09:00:00').toISOString()
          : new Date().toISOString()

        // 출고인 경우: 재고 부족 체크 먼저
        if (pendingAction.action === '출고') {
          const { data: inventoryLots } = await supabase
            .from('inventory')
            .select('id, quantity')
            .eq('product_id', product.id)
            .eq('warehouse_id', warehouse.id)
            .gt('quantity', 0)
            .order('lot_number', { ascending: true })

          const totalAvailable = (inventoryLots || []).reduce((sum, lot) => sum + lot.quantity, 0)
          if (totalAvailable < (pendingAction.quantity || 0)) {
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: `재고 부족!\n\n요청: ${pendingAction.quantity?.toLocaleString()}개\n가용 재고: ${totalAvailable.toLocaleString()}개`
            }])
            setPendingAction(null)
            return
          }
        }

        // 입출고 기록 저장
        await supabase.from('transactions').insert([{
          product_id: product.id,
          warehouse_id: warehouse.id,
          type: pendingAction.action,
          quantity: pendingAction.quantity,
          channel: pendingAction.channel || null,
          note: noteText,
          recorded_by: profile?.name || 'AI',
          created_at: transactionDate
        }])

        // 재고 업데이트
        if (pendingAction.action === '입고') {
          // 입고: 제품+창고+로트번호 기준으로 조회
          const { data: existingInv } = await supabase
            .from('inventory')
            .select('id, quantity')
            .eq('product_id', product.id)
            .eq('warehouse_id', warehouse.id)
            .eq('lot_number', lotNumber)
            .single()

          if (existingInv) {
            await supabase.from('inventory')
              .update({ quantity: existingInv.quantity + (pendingAction.quantity || 0) })
              .eq('id', existingInv.id)
          } else {
            await supabase.from('inventory').insert([{
              product_id: product.id,
              warehouse_id: warehouse.id,
              quantity: pendingAction.quantity,
              lot_number: lotNumber
            }])
          }
        } else {
          // 출고: FIFO 순차 차감
          const { data: inventoryLots } = await supabase
            .from('inventory')
            .select('id, quantity, lot_number')
            .eq('product_id', product.id)
            .eq('warehouse_id', warehouse.id)
            .gt('quantity', 0)
            .order('lot_number', { ascending: true })

          let remaining = pendingAction.quantity || 0
          const deductions: { lot: string; deducted: number; remaining: number }[] = []
          for (const lot of (inventoryLots || [])) {
            if (remaining <= 0) break
            const deduct = Math.min(lot.quantity, remaining)
            await supabase.from('inventory')
              .update({ quantity: lot.quantity - deduct })
              .eq('id', lot.id)
            remaining -= deduct
            deductions.push({
              lot: lot.lot_number || '미지정',
              deducted: deduct,
              remaining: lot.quantity - deduct
            })
          }

          // 차감 내역을 transaction note에 업데이트
          if (deductions.length > 0) {
            const lotDetail = deductions.map(d => `${d.lot}:-${d.deducted}`).join(', ')
            const updatedNote = `${noteText} | ${lotDetail}`
            await supabase.from('transactions')
              .update({ note: updatedNote })
              .eq('product_id', product.id)
              .eq('created_at', transactionDate)
              .eq('type', pendingAction.action)
          }
        }

        // 완료 메시지 (출고 시 차감 내역 포함)
        let completionMsg = `${pendingAction.action} 완료!\n${product.product_name} ${pendingAction.quantity?.toLocaleString()}개`
        if (pendingAction.action === '출고') {
          const { data: lots } = await supabase
            .from('inventory')
            .select('lot_number, quantity')
            .eq('product_id', product.id)
            .eq('warehouse_id', warehouse.id)
            .gte('quantity', 0)
            .order('lot_number', { ascending: true })

          if (lots && lots.length > 0) {
            completionMsg += '\n\n잔여 재고:'
            lots.forEach(l => {
              completionMsg += `\n- LOT ${l.lot_number}: ${l.quantity.toLocaleString()}개`
            })
          }
        }
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: completionMsg
        }])
      }

      setPendingAction(null)
      fetchData()
      // 페이지 새로고침하여 재고 반영
      window.location.reload()
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '처리 중 오류가 발생했습니다.' }])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }

  function cancelAction() {
    setPendingAction(null)
    setMessages(prev => [...prev, { role: 'assistant', content: '취소되었습니다.' }])
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  return (
    <>
      {/* 채팅 버튼 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition flex items-center justify-center text-2xl z-50"
      >
        {isOpen ? '✕' : '💬'}
      </button>

      {/* 채팅 창 */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 w-80 sm:w-96 h-[500px] bg-white rounded-lg shadow-2xl flex flex-col z-50 border">
          {/* 헤더 */}
          <div className="bg-blue-600 text-white p-3 rounded-t-lg">
            <h3 className="font-semibold">AI 재고관리 어시스턴트</h3>
          </div>

          {/* 메시지 영역 */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg p-3 text-sm ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
                </div>
              </div>
            ))}

            {/* 확인/취소 버튼 */}
            {pendingAction && (
              <div className="flex justify-center gap-2">
                <button
                  onClick={confirmAction}
                  disabled={loading}
                  className="bg-green-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
                >
                  {loading ? '처리 중...' : '확인'}
                </button>
                <button
                  onClick={cancelAction}
                  disabled={loading}
                  className="bg-gray-400 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-gray-500 disabled:opacity-50"
                >
                  취소
                </button>
              </div>
            )}

            {loading && !pendingAction && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-lg p-3 text-sm text-gray-500">
                  생각 중...
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* 입력 영역 */}
          <form onSubmit={handleSubmit} className="p-3 border-t flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="입고/출고/이동 요청 입력..."
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading || !!pendingAction}
              autoFocus
            />
            <button
              type="submit"
              disabled={loading || !input.trim() || !!pendingAction}
              className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              전송
            </button>
          </form>
        </div>
      )}
    </>
  )
}
