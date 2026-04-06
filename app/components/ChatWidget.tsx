'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/app/contexts/AuthContext'

interface Product {
  id: string
  product_name: string
  product_code: string
  shelf_life_months?: number | null
}

interface Warehouse {
  id: string
  name: string
}

interface InventoryItem {
  product_id: string
  warehouse_id: string
  quantity: number
  lot_number?: string
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

const CHAT_MESSAGES_STORAGE_KEY = 'inventory-ai-chat-messages'

const DEFAULT_CHAT_MESSAGES: Message[] = [
  {
    role: 'assistant',
    content: '안녕하세요! 재고관리 AI입니다.\n\n예시: "쿠션A 500개 올리브영 출고"\n           입고(생산)/출고/(내부)이동'
  }
]

function isPersistedMessageList(v: unknown): v is Message[] {
  if (!Array.isArray(v) || v.length === 0) return false
  return v.every(
    m =>
      m &&
      typeof m === 'object' &&
      (m as Message).role !== undefined &&
      ((m as Message).role === 'user' || (m as Message).role === 'assistant') &&
      typeof (m as Message).content === 'string'
  )
}

export default function ChatWidget() {
  const { profile } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [todayTransactions, setTodayTransactions] = useState<{type: string; quantity: number; products: {product_name: string}; warehouses: {name: string}; channel: string | null; note: string | null; created_at: string}[]>([])
  const [messages, setMessages] = useState<Message[]>(DEFAULT_CHAT_MESSAGES)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [pendingAction, setPendingAction] = useState<Message['data'] | null>(null)

  interface PendingPartial {
    actionData: NonNullable<Message['data']>
    waitingFor: 'product' | 'warehouse'
    productChoices?: Product[]
    warehouseChoices?: Warehouse[]
    confirmedProduct?: Product
  }
  const [pendingPartial, setPendingPartial] = useState<PendingPartial | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchData()
  }, [])

  // 새로고침(reload) 후에도 대화 복원 — 입출고 확정 시 sessionStorage에 저장함
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CHAT_MESSAGES_STORAGE_KEY)
      if (!raw) return
      const parsed: unknown = JSON.parse(raw)
      if (!isPersistedMessageList(parsed)) return
      setMessages(parsed)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 채팅창 열릴 때: 스크롤 영역이 아직 안 잡힌 상태에서 scroll이 먹지 않을 수 있어 약간 늦춤
  useEffect(() => {
    if (!isOpen) return
    const t = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ block: 'end', behavior: 'auto' })
      inputRef.current?.focus()
    }, 100)
    return () => clearTimeout(t)
  }, [isOpen])

  async function fetchData() {
    const { data: productsData } = await supabase
      .from('products')
      .select('id, product_name, product_code, shelf_life_months')
      .eq('is_active', true)

    const { data: warehousesData } = await supabase
      .from('warehouses')
      .select('id, name')

    const { data: inventoryData } = await supabase
      .from('inventory')
      .select('product_id, warehouse_id, quantity, lot_number, products(product_name), warehouses(name)')
      .gt('quantity', 0)

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const { data: txData } = await supabase
      .from('transactions')
      .select('type, quantity, channel, note, created_at, products(product_name), warehouses(name)')
      .gte('created_at', todayStart.toISOString())
      .order('created_at', { ascending: false })

    setProducts(productsData || [])
    setWarehouses(warehousesData || [])
    setInventory(inventoryData || [])
    setTodayTransactions(txData || [])
  }

  // 제품+창고 확정 후 확인버튼 표시
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function proceedToConfirm(actionData: any, product: Product, warehouse: Warehouse) {
    const confirmed = {
      ...actionData,
      product_name: product.product_name,
      warehouse: warehouse.name
    }
    setPendingAction(confirmed)
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: `${actionData.action} 등록:\n- 제품: ${product.product_name}\n- 수량: ${(actionData.quantity || 0).toLocaleString()}개\n- 창고: ${warehouse.name}${actionData.channel ? `\n- 채널: ${actionData.channel}` : ''}\n\n진행할까요?`,
      data: confirmed
    }])
  }

  // 창고 선택 로직
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function resolveWarehouse(actionData: any, confirmedProduct: Product) {
    let availableWarehouses: Warehouse[]

    if (actionData.action === '입고') {
      availableWarehouses = warehouses
    } else {
      // 출고/이동: 재고 있는 창고만
      const productInv = inventory.filter(inv => inv.product_id === confirmedProduct.id && inv.quantity > 0)
      const warehouseIds = [...new Set(productInv.map(inv => inv.warehouse_id))]
      availableWarehouses = warehouses.filter(w => warehouseIds.includes(w.id))

      if (availableWarehouses.length === 0) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `${confirmedProduct.product_name} 재고가 없습니다.`
        }])
        return
      }
    }

    if (availableWarehouses.length === 1) {
      // 1개면 자동 확정
      proceedToConfirm(actionData, confirmedProduct, availableWarehouses[0])
    } else {
      // GPT가 창고 키워드를 반환했으면 매칭 시도
      if (actionData.warehouse) {
        const matched = availableWarehouses.find(w => w.name.includes(actionData.warehouse))
        if (matched) {
          proceedToConfirm(actionData, confirmedProduct, matched)
          return
        }
      }
      // 매칭 안되면 질문
      const list = availableWarehouses.map((w, i) => `${i + 1}. ${w.name}`).join('\n')
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `어느 창고인가요?\n${list}`
      }])
      setPendingPartial({
        actionData: { ...actionData, product_name: confirmedProduct.product_name },
        waitingFor: 'warehouse',
        warehouseChoices: availableWarehouses,
        confirmedProduct
      })
    }
  }

  // GPT 응답 후 제품 매칭 → 창고 선택
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function resolveAction(data: any) {
    const keyword = data.product_name || ''
    const matched = products.filter(p =>
      p.product_name.includes(keyword) || p.product_code.includes(keyword)
    )

    if (matched.length === 0) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `"${keyword}" 제품을 찾을 수 없습니다.`
      }])
      return
    }

    if (matched.length === 1) {
      await resolveWarehouse(data, matched[0])
    } else {
      const list = matched.map((p, i) => `${i + 1}. ${p.product_name}`).join('\n')
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `어떤 제품인가요?\n${list}`
      }])
      setPendingPartial({ actionData: data, waitingFor: 'product', productChoices: matched })
    }
  }

  // pendingPartial 상태에서 사용자 응답 처리
  async function handlePendingPartialResponse(userMessage: string) {
    if (!pendingPartial) return

    if (pendingPartial.waitingFor === 'product') {
      const choices = pendingPartial.productChoices || []
      const num = parseInt(userMessage)
      let selected: Product | undefined
      if (!isNaN(num) && num >= 1 && num <= choices.length) {
        selected = choices[num - 1]
      } else {
        selected = choices.find(p => p.product_name.includes(userMessage))
      }
      if (!selected) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `번호(1~${choices.length})로 입력해주세요.`
        }])
        return
      }
      setPendingPartial(null)
      await resolveWarehouse(pendingPartial.actionData, selected)

    } else if (pendingPartial.waitingFor === 'warehouse') {
      const choices = pendingPartial.warehouseChoices || []
      const num = parseInt(userMessage)
      let selected: Warehouse | undefined
      if (!isNaN(num) && num >= 1 && num <= choices.length) {
        selected = choices[num - 1]
      } else {
        selected = choices.find(w => w.name.includes(userMessage))
      }
      if (!selected) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `번호(1~${choices.length})로 입력해주세요.`
        }])
        return
      }
      setPendingPartial(null)
      proceedToConfirm(pendingPartial.actionData, pendingPartial.confirmedProduct!, selected)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || loading) return

    const userMessage = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setLoading(true)

    try {
      // pendingPartial 상태면 GPT 없이 직접 처리
      if (pendingPartial) {
        await handlePendingPartialResponse(userMessage)
        return
      }

      // setMessages는 바로 반영되지 않으므로, 방금 보낸 userMessage를 history에 직접 포함
      const historySource: Message[] = [
        ...messages,
        { role: 'user', content: userMessage }
      ]
      const recentHistory = historySource.slice(-6).map(m => ({
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
          todayTransactions,
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

      if (data.action === '입고' || data.action === '출고' || data.action === '창고이동') {
        await resolveAction(data)
      } else if (data.action === '질문' || data.action === '답변') {
        setMessages(prev => [...prev, { role: 'assistant', content: data.message }])
      } else if (data.action === '조회') {
        const inv = await getInventory(data.product_name)
        setMessages(prev => [...prev, { role: 'assistant', content: inv }])
      } else {
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

        // 출발 창고 로트별 재고 조회 (FIFO)
        const { data: fromLots } = await supabase
          .from('inventory')
          .select('id, quantity, lot_number')
          .eq('product_id', product.id)
          .eq('warehouse_id', warehouse.id)
          .gt('quantity', 0)
          .order('lot_number', { ascending: true })

        const fromTotal = (fromLots || []).reduce((sum, lot) => sum + lot.quantity, 0)
        if (fromTotal < (pendingAction.quantity || 0)) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `재고 부족!\n\n${warehouse.name} 가용 재고: ${fromTotal.toLocaleString()}개\n요청: ${pendingAction.quantity?.toLocaleString()}개`
          }])
          setPendingAction(null)
          return
        }

        // 날짜 처리
        const transactionDate = pendingAction.date
          ? new Date(pendingAction.date + 'T09:00:00').toISOString()
          : new Date().toISOString()

        // 로트별 FIFO 이동
        let remaining = pendingAction.quantity || 0
        const movedLots: string[] = []

        for (const lot of (fromLots || [])) {
          if (remaining <= 0) break
          const moveQty = Math.min(lot.quantity, remaining)
          const newFromQty = lot.quantity - moveQty

          // from 창고 차감
          if (newFromQty <= 0) {
            await supabase.from('inventory').delete().eq('id', lot.id)
          } else {
            await supabase.from('inventory').update({ quantity: newFromQty, updated_at: new Date().toISOString() }).eq('id', lot.id)
          }

          // to 창고: 동일 로트번호로 upsert
          const { data: toExisting } = await supabase
            .from('inventory')
            .select('id, quantity')
            .eq('product_id', product.id)
            .eq('warehouse_id', toWarehouse.id)
            .eq('lot_number', lot.lot_number)
            .maybeSingle()

          if (toExisting) {
            await supabase.from('inventory').update({ quantity: toExisting.quantity + moveQty, updated_at: new Date().toISOString() }).eq('id', toExisting.id)
          } else {
            await supabase.from('inventory').insert([{
              product_id: product.id,
              warehouse_id: toWarehouse.id,
              lot_number: lot.lot_number,
              quantity: moveQty
            }])
          }

          movedLots.push(`${lot.lot_number} ${moveQty.toLocaleString()}개`)
          remaining -= moveQty
        }

        // 이동 트랜잭션 기록
        const lotNote = `[로트] ${movedLots.join(' / ')}`
        await supabase.from('transactions').insert([{
          product_id: product.id,
          warehouse_id: warehouse.id,
          type: '이동',
          quantity: pendingAction.quantity,
          channel: null,
          note: `${warehouse.name} → ${toWarehouse.name} | ${lotNote}`,
          recorded_by: profile?.name || 'AI',
          created_at: transactionDate
        }])

        setMessages(prev => {
          const next: Message[] = [
            ...prev,
            {
              role: 'assistant',
              content: `이동 완료!\n${product.product_name} ${pendingAction.quantity?.toLocaleString()}개\n${warehouse.name} → ${toWarehouse.name}\n이동 로트: ${movedLots.join(', ')}`
            }
          ]
          try {
            sessionStorage.setItem(CHAT_MESSAGES_STORAGE_KEY, JSON.stringify(next))
          } catch {
            /* quota 등 */
          }
          return next
        })
      } else {
        // 날짜 처리: 지정된 날짜가 있으면 사용, 없으면 현재 시간
        const transactionDate = pendingAction.date
          ? new Date(pendingAction.date + 'T09:00:00').toISOString()
          : new Date().toISOString()

        // 출고인 경우: 임박/만료 제외 후 가용 재고 체크
        if (pendingAction.action === '출고') {
          const { data: inventoryLots } = await supabase
            .from('inventory')
            .select('id, quantity, lot_number')
            .eq('product_id', product.id)
            .eq('warehouse_id', warehouse.id)
            .gt('quantity', 0)

          const shelfLifeMonths = product.shelf_life_months || 24
          const today = new Date()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const isExpiredOrWarning = (lot: any): boolean => {
            if (!lot.lot_number || !/^\d{6}-\d{2}$/.test(lot.lot_number)) return false
            const y = parseInt('20' + lot.lot_number.substring(0, 2))
            const m = parseInt(lot.lot_number.substring(2, 4)) - 1
            const d = parseInt(lot.lot_number.substring(4, 6))
            const expiry = new Date(y, m, d)
            expiry.setMonth(expiry.getMonth() + shelfLifeMonths)
            const days = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
            return days <= shelfLifeMonths * 30 * 0.25
          }

          const eligibleCheck = (inventoryLots || []).filter((lot: any) => !isExpiredOrWarning(lot))
          const totalAvailable = eligibleCheck.reduce((sum: number, lot: any) => sum + lot.quantity, 0)
          if (totalAvailable < (pendingAction.quantity || 0)) {
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: `재고 부족!\n\n임박/만료 로트 제외 후 가용 재고: ${totalAvailable.toLocaleString()}개\n요청: ${pendingAction.quantity?.toLocaleString()}개`
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
          // 출고: 임박/만료 제외, 정상 로트만 FIFO 차감
          const { data: inventoryLots } = await supabase
            .from('inventory')
            .select('id, quantity, lot_number')
            .eq('product_id', product.id)
            .eq('warehouse_id', warehouse.id)
            .gt('quantity', 0)

          const shelfLifeMonths = product.shelf_life_months || 24
          const today = new Date()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const isExpiredOrWarning = (lot: any): boolean => {
            if (!lot.lot_number || !/^\d{6}-\d{2}$/.test(lot.lot_number)) return false
            const y = parseInt('20' + lot.lot_number.substring(0, 2))
            const m = parseInt(lot.lot_number.substring(2, 4)) - 1
            const d = parseInt(lot.lot_number.substring(4, 6))
            const expiry = new Date(y, m, d)
            expiry.setMonth(expiry.getMonth() + shelfLifeMonths)
            const days = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
            return days <= shelfLifeMonths * 30 * 0.25
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const eligibleLots = (inventoryLots || [])
            .filter((lot: any) => !isExpiredOrWarning(lot))
            .sort((a: any, b: any) => {
              if (a.lot_number && b.lot_number) return a.lot_number.localeCompare(b.lot_number)
              return 0
            })

          let remaining = pendingAction.quantity || 0
          const deductions: { lot: string; deducted: number; remaining: number }[] = []
          for (const lot of eligibleLots) {
            if (remaining <= 0) break
            const deduct = Math.min(lot.quantity, remaining)
            const newQty = lot.quantity - deduct
            if (newQty <= 0) {
              await supabase.from('inventory').delete().eq('id', lot.id)
            } else {
              await supabase.from('inventory')
                .update({ quantity: newQty, updated_at: new Date().toISOString() })
                .eq('id', lot.id)
            }
            remaining -= deduct
            deductions.push({
              lot: lot.lot_number || '미지정',
              deducted: deduct,
              remaining: newQty
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
        setMessages(prev => {
          const next: Message[] = [...prev, { role: 'assistant', content: completionMsg }]
          try {
            sessionStorage.setItem(CHAT_MESSAGES_STORAGE_KEY, JSON.stringify(next))
          } catch {
            /* quota 등 */
          }
          return next
        })
      }

      setPendingAction(null)
      // 전체 새로고침으로 대시보드·다른 페이지 재고 반영 (마운트 시 fetchData가 다시 실행됨)
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
    setPendingPartial(null)
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
