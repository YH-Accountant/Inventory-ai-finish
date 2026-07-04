import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { getInboundReconciliation, getOutboundReconciliation, getTransferReconciliation } from '@/lib/reconciliation'

const resend = new Resend(process.env.RESEND_API_KEY)

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: Request) {
  try {
    const { company_id } = await request.json()
    if (!company_id) return NextResponse.json({ error: 'company_id 필요' }, { status: 400 })

    const supabase = getSupabaseAdmin()

    const { data: companyData } = await supabase
      .from('companies')
      .select('name')
      .eq('id', company_id)
      .single()
    const companyName = companyData?.name || '회사'

    const [inbound, outbound, transfer] = await Promise.all([
      getInboundReconciliation(company_id, supabase),
      getOutboundReconciliation(company_id, supabase),
      getTransferReconciliation(company_id, supabase)
    ])

    const missing = [
      ...inbound.progress.filter(p => p.remaining_qty > 0).map(p => ({ ...p, source: '입고' })),
      ...outbound.progress.filter(p => p.remaining_qty > 0).map(p => ({ ...p, source: '출고' })),
      ...transfer.progress.filter(p => p.remaining_qty > 0).map(p => ({ ...p, source: '이동' }))
    ]
    const unmatched = [
      ...inbound.unmatched.map(u => ({ ...u, source: '입고' })),
      ...outbound.unmatched.map(u => ({ ...u, source: '출고' })),
      ...transfer.unmatched.map(u => ({ ...u, source: '이동' }))
    ]

    if (missing.length === 0 && unmatched.length === 0) {
      return NextResponse.json({ sent: false, reason: '예외 사항 없음' })
    }

    const { data: managers } = await supabase
      .from('profiles')
      .select('email, name')
      .eq('company_id', company_id)
      .eq('role', '본사')

    if (!managers || managers.length === 0) {
      return NextResponse.json({ sent: false, reason: '본사 담당자 계정 없음' })
    }

    const subject = `[재고관리 AI] 결재 대사 예외 알림 - ${missing.length + unmatched.length}건`

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type AnyRowLike = any

    const buildRows = (
      items: AnyRowLike[],
      valueLabel: (item: AnyRowLike) => string
    ) => items.map((item, i) => `
        <tr style="border-bottom:1px solid #f0f0f0;">
          <td style="padding:10px 8px;font-weight:500;">${i + 1}. [${item.source}] ${item.product_name}</td>
          <td style="padding:10px 8px;color:#666;">${item.display_location}</td>
          <td style="padding:10px 8px;text-align:right;font-weight:bold;">${valueLabel(item)}</td>
        </tr>`).join('')

    const missingRows = buildRows(missing, (item: AnyRowLike) => `미달 ${item.remaining_qty.toLocaleString()} (${item.actual_qty.toLocaleString()}/${item.approved_qty.toLocaleString()})`)
    const unmatchedRows = buildRows(unmatched, (item: AnyRowLike) => `${item.quantity.toLocaleString()}개 (${item.reason})`)

    const html = `
      <div style="font-family:-apple-system,sans-serif;max-width:640px;margin:0 auto;color:#1a1a1a;">
        <div style="background:#2563eb;padding:24px 32px;border-radius:12px 12px 0 0;">
          <h1 style="margin:0;color:white;font-size:20px;">재고관리 AI</h1>
          <p style="margin:4px 0 0;color:#bfdbfe;font-size:13px;">결재 증빙 ↔ 실물기록 대사 예외 알림</p>
        </div>
        <div style="background:white;padding:28px 32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
          <p style="margin:0 0 20px;font-size:15px;">
            안녕하세요.<br/>
            <strong>${companyName}</strong>의 승인 증빙과 실물기록 간 불일치가 감지되었습니다.<br/>
            확인 후 조치해 주세요.
          </p>
          ${missing.length > 0 ? `
          <div style="margin-bottom:24px;">
            <h3 style="margin:0 0 8px;padding:8px 12px;background:#f59e0b15;border-left:4px solid #f59e0b;color:#f59e0b;font-size:14px;">
              증빙 있음 · 기록 없음/미달 (${missing.length}건)
            </h3>
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <tbody>${missingRows}</tbody>
            </table>
          </div>` : ''}
          ${unmatched.length > 0 ? `
          <div>
            <h3 style="margin:0 0 8px;padding:8px 12px;background:#ef444415;border-left:4px solid #ef4444;color:#ef4444;font-size:14px;">
              기록 있음 · 증빙 없음 (${unmatched.length}건)
            </h3>
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <tbody>${unmatchedRows}</tbody>
            </table>
          </div>` : ''}
          <div style="margin-top:24px;padding:16px;background:#f8fafc;border-radius:8px;font-size:12px;color:#6b7280;text-align:center;">
            재고관리 AI 시스템에서 자동 발송된 메일입니다.
          </div>
        </div>
      </div>`

    const recipients = managers.map(m => m.email)
    const { error: emailError } = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: recipients,
      subject,
      html
    })

    if (emailError) {
      console.error('📧 대사 예외 이메일 발송 실패:', emailError)
      return NextResponse.json({ sent: false, reason: emailError.message })
    }

    console.log(`📧 대사 예외 알림 발송 완료 → ${recipients.join(', ')} (미달 ${missing.length}건 / 미매칭 ${unmatched.length}건)`)
    return NextResponse.json({
      sent: true,
      recipients,
      missing_count: missing.length,
      unmatched_count: unmatched.length
    })

  } catch (error) {
    console.error('check-reconciliation-alert 에러:', error)
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}
