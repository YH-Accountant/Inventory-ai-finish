import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function extractConfirmedDate(text: string): string | null {
  const match = text.match(/(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})/)
  if (!match) return null
  const [, y, m, d] = match
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

interface InboundPayload {
  order_number: string
  text?: string
  attachment?: { filename: string; contentType: string; contentBase64: string } | null
}

export async function POST(request: Request) {
  const secret = request.headers.get('x-webhook-secret')
  if (!secret || secret !== process.env.INBOUND_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 })
  }

  const body: InboundPayload = await request.json()
  const { order_number, text, attachment } = body

  if (!order_number) {
    return NextResponse.json({ ok: false, reason: 'order_number가 없습니다.' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  const { data: doc, error: docError } = await supabase
    .from('approval_documents')
    .select('id, company_id, status, requested_by_user_id, order_number')
    .eq('order_number', order_number)
    .eq('doc_type', '발주품의서')
    .single()

  if (docError || !doc) {
    return NextResponse.json({ ok: false, reason: `발주번호 ${order_number} 문서를 찾을 수 없습니다.` }, { status: 404 })
  }

  let filePath: string | null = null
  if (attachment?.contentBase64) {
    const ext = attachment.filename.split('.').pop() || 'bin'
    const candidatePath = `${doc.company_id}/po-confirm/${doc.id}-auto-${Date.now()}.${ext}`
    const buffer = Buffer.from(attachment.contentBase64, 'base64')
    const { error: uploadError } = await supabase.storage
      .from('evidence')
      .upload(candidatePath, buffer, { contentType: attachment.contentType || 'application/octet-stream' })
    if (uploadError) {
      console.error('발주확인서 첨부파일 업로드 실패:', uploadError)
    } else {
      filePath = candidatePath
    }
  }

  const confirmedDate = extractConfirmedDate(text || '')

  const update: Record<string, string> = {}
  if (filePath) update.confirmation_file_url = filePath
  if (confirmedDate) update.confirmed_date = confirmedDate

  if (Object.keys(update).length > 0) {
    const { error: updateError } = await supabase
      .from('approval_documents')
      .update(update)
      .eq('id', doc.id)
    if (updateError) console.error('발주확인서 자동 반영 실패:', updateError)
  }

  if (doc.requested_by_user_id) {
    const { error: notifyError } = await supabase.from('notifications').insert([{
      company_id: doc.company_id,
      recipient_user_id: doc.requested_by_user_id,
      document_id: doc.id,
      type: '발주확인',
      message: `발주확인서 메일이 자동으로 접수되었습니다 (${order_number})${confirmedDate ? ` · 납기 ${confirmedDate}` : ''}`
    }])
    if (notifyError) console.error('발주확인 알림 발송 실패:', notifyError)
  }

  return NextResponse.json({ ok: true, document_id: doc.id, confirmed_date: confirmedDate, file: filePath })
}
