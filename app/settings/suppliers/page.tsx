'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/app/contexts/AuthContext'
import Navbar from '@/app/components/Navbar'

interface Supplier {
  id: string
  name: string
  contact_email: string | null
  contract_file_url: string | null
  contract_signed_at: string | null
  created_at: string
}

export default function SuppliersPage() {
  const { profile } = useAuth()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    contact_email: '',
    contract_signed_at: ''
  })
  const [contractFile, setContractFile] = useState<File | null>(null)

  useEffect(() => {
    if (!profile?.company_id) return
    fetchSuppliers()
  }, [profile?.company_id])

  async function fetchSuppliers() {
    setLoading(true)
    const { data } = await supabase
      .from('suppliers')
      .select('id, name, contact_email, contract_file_url, contract_signed_at, created_at')
      .eq('company_id', profile!.company_id!)
      .order('created_at', { ascending: true })
    setSuppliers(data || [])
    setLoading(false)
  }

  function resetForm() {
    setFormData({ name: '', contact_email: '', contract_signed_at: '' })
    setContractFile(null)
    setEditingId(null)
    setShowForm(false)
  }

  function openEdit(s: Supplier) {
    setFormData({
      name: s.name,
      contact_email: s.contact_email || '',
      contract_signed_at: s.contract_signed_at || ''
    })
    setContractFile(null)
    setEditingId(s.id)
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!formData.name.trim()) {
      alert('거래처명을 입력해주세요.')
      return
    }
    const cid = profile?.company_id
    if (!cid) return

    setSaving(true)
    try {
      let contractFileUrl: string | null = editingId
        ? suppliers.find(s => s.id === editingId)?.contract_file_url || null
        : null

      if (contractFile) {
        const ext = contractFile.name.split('.').pop() || 'bin'
        const path = `${cid}/supplier-contract/${(editingId || 'new')}-${Date.now()}.${ext}`
        const { error: uploadError } = await supabase.storage.from('evidence').upload(path, contractFile)
        if (uploadError) {
          alert('계약서 파일 업로드 실패: ' + uploadError.message)
          return
        }
        contractFileUrl = path
      }

      const payload = {
        name: formData.name.trim(),
        contact_email: formData.contact_email.trim() || null,
        contract_file_url: contractFileUrl,
        contract_signed_at: formData.contract_signed_at || null
      }

      const { error } = editingId
        ? await supabase.from('suppliers').update(payload).eq('id', editingId)
        : await supabase.from('suppliers').insert([{ ...payload, company_id: cid }])

      if (error) {
        alert('저장 실패: ' + error.message)
        return
      }

      resetForm()
      fetchSuppliers()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(s: Supplier) {
    if (!confirm(`"${s.name}" 거래처를 삭제하시겠습니까?\n\n이미 이 거래처로 기안된 발주품의서는 그대로 남습니다.`)) return
    const { error } = await supabase.from('suppliers').delete().eq('id', s.id)
    if (error) { alert('삭제 실패: ' + error.message); return }
    fetchSuppliers()
  }

  async function viewContract(s: Supplier) {
    if (!s.contract_file_url) return
    const { data, error } = await supabase.storage.from('evidence').createSignedUrl(s.contract_file_url, 300)
    if (error || !data) {
      alert('파일 조회 실패: ' + error?.message)
      return
    }
    window.open(data.signedUrl, '_blank')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-xl">로딩 중...</p>
      </div>
    )
  }

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-slate-50 pt-28 md:pt-20 p-4 md:p-8">
        <div className="max-w-3xl mx-auto">
          <div className="flex flex-wrap justify-between items-start gap-3 mb-6">
            <div>
              <h1 className="text-xl font-bold text-gray-900">거래처 관리</h1>
              <p className="text-sm text-gray-500 mt-1">
                발주품의서 기안 시 선택할 거래처를 등록합니다. 담당자 이메일을 등록해두면 발주서 발송 시 자동으로 채워집니다.
              </p>
            </div>
            <button
              onClick={() => showForm ? resetForm() : setShowForm(true)}
              className="bg-blue-600 text-white px-3 py-1.5 md:px-5 md:py-2 text-sm rounded-lg hover:bg-blue-700 transition shrink-0"
            >
              {showForm ? '취소' : '+ 거래처 추가'}
            </button>
          </div>

          {showForm && (
            <div className="bg-white rounded-lg shadow p-6 mb-8">
              <h2 className="text-lg font-semibold mb-4">{editingId ? '거래처 수정' : '거래처 추가'}</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">거래처명 *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">담당자 이메일</label>
                  <p className="text-xs text-gray-400 mb-1">발주서 발송 시 수신처로 자동 입력됩니다 (없어도 등록 가능)</p>
                  <input
                    type="email"
                    placeholder="order@supplier.com"
                    value={formData.contact_email}
                    onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                    className="w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">기본계약 체결일자</label>
                  <input
                    type="date"
                    value={formData.contract_signed_at}
                    onChange={(e) => setFormData({ ...formData, contract_signed_at: e.target.value })}
                    className="border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">기본계약서 파일</label>
                  <p className="text-xs text-gray-400 mb-1">업로드 안 해도 거래처 등록에는 문제 없습니다</p>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => setContractFile(e.target.files?.[0] || null)}
                    className="text-sm"
                  />
                  {editingId && suppliers.find(s => s.id === editingId)?.contract_file_url && !contractFile && (
                    <button
                      type="button"
                      onClick={() => viewContract(suppliers.find(s => s.id === editingId)!)}
                      className="block text-sm text-blue-600 hover:underline mt-1"
                    >
                      등록된 계약서 보기
                    </button>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition"
                >
                  {saving ? '저장 중...' : editingId ? '수정 저장' : '거래처 추가'}
                </button>
              </form>
            </div>
          )}

          <div className="bg-white rounded-lg shadow">
            <div className="p-3 md:p-6 border-b">
              <h2 className="text-base md:text-lg font-semibold">등록된 거래처 ({suppliers.length}곳)</h2>
            </div>
            <div className="p-3 md:p-6">
              {suppliers.length === 0 ? (
                <p className="text-gray-500 text-center py-8">등록된 거래처가 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {suppliers.map(s => (
                    <div key={s.id} className="flex items-center justify-between border-b py-3">
                      <div>
                        <p className="font-medium text-sm">{s.name}</p>
                        <p className="text-xs text-gray-500">{s.contact_email || '담당자 이메일 미등록'}</p>
                        <p className="text-xs text-gray-400">
                          {s.contract_file_url ? (
                            <button onClick={() => viewContract(s)} className="text-blue-600 hover:underline">
                              계약서 있음{s.contract_signed_at ? ` (체결 ${s.contract_signed_at})` : ''}
                            </button>
                          ) : '계약서 미등록'}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => openEdit(s)} className="text-sm text-blue-600 hover:underline">수정</button>
                        <button onClick={() => handleDelete(s)} className="text-sm text-red-500 hover:underline">삭제</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
