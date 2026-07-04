'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/app/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

type Step = 'industry' | 'choose' | 'stocktake'

interface StocktakeRow {
  product_name: string
  quantity: number
  warehouse_name: string
}

interface IndustryTemplate {
  label: string
  description: string
  icon: string
  default_shelf_life_months: number
  shelf_life_warning_ratio: number
  inventory_unit: string
}

const INDUSTRY_TEMPLATES: Record<string, IndustryTemplate> = {
  화장품: {
    label: '화장품 / 뷰티',
    description: '스킨케어, 색조, 헤어케어 등',
    icon: '💄',
    default_shelf_life_months: 36,
    shelf_life_warning_ratio: 0.25,
    inventory_unit: '개'
  },
  냉동식품: {
    label: '냉동식품 / 식품',
    description: '냉동가공식품, 축산, 수산 등',
    icon: '🧊',
    default_shelf_life_months: 12,
    shelf_life_warning_ratio: 0.25,
    inventory_unit: '박스'
  },
  기타: {
    label: '기타',
    description: '위에 해당하지 않는 업종',
    icon: '📦',
    default_shelf_life_months: 24,
    shelf_life_warning_ratio: 0.25,
    inventory_unit: '개'
  }
}

export default function OnboardingPage() {
  const router = useRouter()
  const { profile, completeOnboarding } = useAuth()
  const [step, setStep] = useState<Step>('industry')
  const [selectedIndustry, setSelectedIndustry] = useState<string>('')
  const [rows, setRows] = useState<StocktakeRow[]>([
    { product_name: '', quantity: 0, warehouse_name: '' }
  ])
  const [saving, setSaving] = useState(false)

  // ── 업종 선택 완료 → companies 테이블 업데이트 후 choose 단계로
  async function handleIndustrySelect(industry: string) {
    setSelectedIndustry(industry)
    const template = INDUSTRY_TEMPLATES[industry]
    if (profile?.company_id) {
      await supabase.from('companies').update({
        industry,
        default_shelf_life_months: template.default_shelf_life_months,
        shelf_life_warning_ratio: template.shelf_life_warning_ratio,
        inventory_unit: template.inventory_unit
      }).eq('id', profile.company_id)
    }
    setStep('choose')
  }

  // ── 옵션 A: 엑셀 업로드 ──
  async function handleExcel() {
    await completeOnboarding()
    router.push('/upload')
  }

  // ── 옵션 B: 창고 실사 저장 ──
  async function handleStocktakeSave() {
    const validRows = rows.filter(r => r.product_name.trim() && r.quantity > 0 && r.warehouse_name.trim())
    if (validRows.length === 0) {
      alert('제품명, 수량, 창고명을 하나 이상 입력해주세요.')
      return
    }

    setSaving(true)
    try {
      const cid = profile?.company_id || ''
      for (const row of validRows) {
        let warehouseId: string
        const { data: existingWh } = await supabase
          .from('warehouses')
          .select('id')
          .ilike('name', row.warehouse_name.trim())
          .eq('company_id', cid)
          .single()

        if (existingWh) {
          warehouseId = existingWh.id
        } else {
          const { data: newWh } = await supabase
            .from('warehouses')
            .insert([{ name: row.warehouse_name.trim(), company_id: cid }])
            .select('id')
            .single()
          warehouseId = newWh!.id
        }

        let productId: string
        const { data: existingProd } = await supabase
          .from('products')
          .select('id')
          .ilike('product_name', row.product_name.trim())
          .eq('company_id', cid)
          .single()

        if (existingProd) {
          productId = existingProd.id
        } else {
          const { data: newProd } = await supabase
            .from('products')
            .insert([{
              product_name: row.product_name.trim(),
              product_code: row.product_name.trim().toUpperCase().replace(/\s+/g, '-').slice(0, 10),
              product_group: '미분류',
              is_active: true,
              company_id: cid
            }])
            .select('id')
            .single()
          productId = newProd!.id
        }

        const { data: existingInv } = await supabase
          .from('inventory')
          .select('id, quantity')
          .eq('product_id', productId)
          .eq('warehouse_id', warehouseId)
          .eq('company_id', cid)
          .is('lot_number', null)
          .single()

        if (existingInv) {
          await supabase.from('inventory')
            .update({ quantity: existingInv.quantity + row.quantity })
            .eq('id', existingInv.id)
        } else {
          await supabase.from('inventory').insert([{
            product_id: productId,
            warehouse_id: warehouseId,
            quantity: row.quantity,
            lot_number: null,
            company_id: cid
          }])
        }

        await supabase.from('transactions').insert([{
          product_id: productId,
          warehouse_id: warehouseId,
          type: '조정',
          sub_type: null,
          quantity: row.quantity,
          resulting_quantity: row.quantity,
          note: '초기 재고 실사 입력',
          recorded_by: profile?.name || null,
          company_id: cid
        }])
      }

      await completeOnboarding()
      alert('초기 재고가 등록되었습니다!')
      router.push('/')
    } catch (err) {
      console.error(err)
      alert('저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  function addRow() {
    setRows([...rows, { product_name: '', quantity: 0, warehouse_name: '' }])
  }

  function updateRow(idx: number, field: keyof StocktakeRow, value: string | number) {
    const updated = [...rows]
    updated[idx] = { ...updated[idx], [field]: value }
    setRows(updated)
  }

  function removeRow(idx: number) {
    setRows(rows.filter((_, i) => i !== idx))
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-2xl p-8">

        {/* ── STEP 1: 업종 선택 ── */}
        {step === 'industry' && (
          <div>
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-gray-900">어떤 업종인가요?</h1>
              <p className="text-gray-500 mt-2">업종에 맞게 유통기한 기준을 자동으로 설정해드려요</p>
              <p className="text-xs text-gray-400 mt-1">설정 페이지에서 언제든 변경할 수 있어요</p>
            </div>

            <div className="space-y-3">
              {Object.entries(INDUSTRY_TEMPLATES).map(([key, tmpl]) => (
                <button
                  key={key}
                  onClick={() => handleIndustrySelect(key)}
                  className="w-full text-left border-2 border-gray-200 hover:border-blue-400 rounded-xl p-5 transition group"
                >
                  <div className="flex items-center gap-4">
                    <span className="text-3xl">{tmpl.icon}</span>
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900 group-hover:text-blue-700">{tmpl.label}</p>
                      <p className="text-sm text-gray-500">{tmpl.description}</p>
                    </div>
                    <div className="text-right text-xs text-gray-400">
                      <p>유통기한 기본 {tmpl.default_shelf_life_months}개월</p>
                      <p>단위: {tmpl.inventory_unit}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── STEP 2: 시작 방법 선택 ── */}
        {step === 'choose' && (
          <div className="space-y-4">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-gray-900">재고관리 시작하기</h1>
              <p className="text-gray-500 mt-2">우리 회사에 맞는 방법을 골라주세요</p>
            </div>

            <button
              onClick={handleExcel}
              className="w-full text-left border-2 border-gray-200 hover:border-purple-400 rounded-xl p-5 transition group"
            >
              <div className="flex items-start gap-4">
                <span className="text-3xl">📂</span>
                <div>
                  <p className="font-semibold text-gray-900 group-hover:text-purple-700">엑셀 파일이 있어요</p>
                  <p className="text-sm text-gray-500 mt-1">기존에 관리하던 엑셀을 업로드하면 제품과 재고가 자동으로 들어와요</p>
                  <p className="text-xs text-purple-500 mt-2">과거 이력까지 연속성 있게 관리 가능</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => setStep('stocktake')}
              className="w-full text-left border-2 border-gray-200 hover:border-blue-400 rounded-xl p-5 transition group"
            >
              <div className="flex items-start gap-4">
                <span className="text-3xl">🔍</span>
                <div>
                  <p className="font-semibold text-gray-900 group-hover:text-blue-700">창고에 가서 직접 셀 수 있어요</p>
                  <p className="text-sm text-gray-500 mt-1">지금 창고에 있는 수량을 직접 입력해서 시작해요</p>
                  <p className="text-xs text-blue-500 mt-2">오늘부터 정확한 현황 파악 가능</p>
                </div>
              </div>
            </button>

            <p className="text-center text-xs text-gray-400 mt-4">
              나중에 <span className="font-medium">시작 가이드</span> 메뉴에서 언제든 다시 볼 수 있어요
            </p>
          </div>
        )}

        {/* ── STEP 3: 창고 실사 입력 ── */}
        {step === 'stocktake' && (
          <div>
            <button
              onClick={() => setStep('choose')}
              className="text-sm text-gray-500 hover:text-gray-700 mb-4 inline-block"
            >
              ← 뒤로
            </button>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">현재 창고 재고 입력</h2>
            <p className="text-sm text-gray-500 mb-4">지금 창고에 있는 수량을 입력해주세요. 로트번호는 나중에 추가해도 돼요.</p>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-800">제품이 많으신가요?</p>
                <p className="text-xs text-blue-600 mt-0.5">실사 결과를 엑셀로 정리했다면 바로 업로드할 수 있어요</p>
              </div>
              <button
                onClick={handleExcel}
                className="text-sm bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 transition whitespace-nowrap ml-3"
              >
                엑셀 업로드
              </button>
            </div>

            <div className="space-y-3 mb-4">
              {rows.map((row, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input
                    type="text"
                    placeholder="제품명"
                    value={row.product_name}
                    onChange={(e) => updateRow(idx, 'product_name', e.target.value)}
                    className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <input
                    type="number"
                    placeholder="수량"
                    min="1"
                    value={row.quantity || ''}
                    onChange={(e) => updateRow(idx, 'quantity', Number(e.target.value))}
                    className="w-24 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <input
                    type="text"
                    placeholder="창고명"
                    value={row.warehouse_name}
                    onChange={(e) => updateRow(idx, 'warehouse_name', e.target.value)}
                    className="w-32 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  {rows.length > 1 && (
                    <button
                      onClick={() => removeRow(idx)}
                      className="text-gray-400 hover:text-red-500 px-2"
                    >✕</button>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={addRow}
              className="text-sm text-blue-600 hover:underline mb-6"
            >
              + 행 추가
            </button>

            <button
              onClick={handleStocktakeSave}
              disabled={saving}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {saving ? '저장 중...' : '재고 등록 완료'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
