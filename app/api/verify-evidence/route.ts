import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ── 외부증빙 자동검증 서비스 (읽기전용 판정만; DB는 안 건드린다) ──
// 출고=집하확인서: 발송자(회사명) + 운송장번호 형식 + 총수량 대조
// 입고=거래명세서: 품목(코드/명) + 수량이 같은 줄에 있는지 대조 (발주확인서와 동일 패턴)
// 통과/불일치/추출불가 판정을 반환하고, 실제 완료/검토 반영은 호출측이 한다.

// pdf-parse 서버리스 우회 (inbound-po-confirmation과 동일: DOMMatrix 폴리필 + 워커 내장)
let workerConfigured = false
async function ensurePdfParseRuntime(): Promise<void> {
  if (typeof (globalThis as { DOMMatrix?: unknown }).DOMMatrix === 'undefined') {
    const { default: DOMMatrixPolyfill } = await import('dommatrix')
    ;(globalThis as { DOMMatrix?: unknown }).DOMMatrix = DOMMatrixPolyfill
  }
  if (!workerConfigured) {
    const { getData } = await import('pdf-parse/worker')
    const { PDFParse } = await import('pdf-parse')
    PDFParse.setWorker(getData())
    workerConfigured = true
  }
}

async function extractPdfText(buffer: Buffer): Promise<string | null> {
  try {
    await ensurePdfParseRuntime()
    const { PDFParse } = await import('pdf-parse')
    const parser = new PDFParse({ data: buffer })
    const result = await parser.getText()
    await parser.destroy()
    const text = (result.text || '').trim()
    return text.length > 0 ? text : null
  } catch {
    return null
  }
}

// 스캔본(이미지) 증빙: GPT-4o mini vision으로 본문 텍스트만 추출 (판정은 아래 규칙이 결정론적으로)
async function extractImageText(base64: string, contentType: string): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY) return null
  try {
    const { default: OpenAI } = await import('openai')
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: '이 거래 증빙 서류의 텍스트를 그대로 추출해줘. 표는 행 단위로, 숫자(수량·합계·번호)는 정확히 옮겨줘. 해석하지 말고 원문 텍스트만.' },
          { type: 'image_url', image_url: { url: `data:${contentType};base64,${base64}` } }
        ]
      }] as any
    })
    const text = res.choices[0]?.message?.content?.trim() || ''
    return text.length > 0 ? text : null
  } catch {
    return null
  }
}

// 공백 차이 흡수 (발주확인서 검증과 동일)
function normalizeForMatch(s: string): string {
  return s.replace(/\s+/g, '')
}

// 법인 표기 차이 흡수: "(주)아뛰드" == "주식회사 아뛰드" == "㈜아뛰드" -> 핵심 상호("아뛰드")로 대조
function stripCorpPrefix(s: string): string {
  return s.replace(/주식회사|유한회사|유한책임회사|㈜|㈜|\(주\)|\(유\)/g, '')
}

interface Item { product_name: string; product_code: string; quantity: number }
type Verdict = { verified: boolean; reason: string | null }

// 출고: 집하확인서 — 발송자(회사명) + 운송장번호 형식 + 총수량(대상 출고건 합)
function verifyOutbound(text: string, companyName: string, items: Item[]): Verdict {
  const norm = normalizeForMatch(stripCorpPrefix(text))
  const core = normalizeForMatch(stripCorpPrefix(companyName))
  if (core && !norm.includes(core)) {
    return { verified: false, reason: `발송자(${companyName})가 서류에서 확인되지 않습니다.` }
  }
  // 운송장번호: 하이픈 포함 번호(예 682-4471-9906) 또는 8자리 이상 숫자열
  const hasWaybill = /\d{3,4}-\d{3,4}-\d{3,4}/.test(text) || /\d{8,}/.test(norm)
  if (!hasWaybill) {
    return { verified: false, reason: '운송장번호를 서류에서 찾을 수 없습니다.' }
  }
  const total = items.reduce((s, i) => s + i.quantity, 0)
  if (!norm.includes(String(total))) {
    return { verified: false, reason: `총 집하수량(${total})이 서류의 수량과 일치하지 않습니다.` }
  }
  return { verified: true, reason: null }
}

// 입고: 거래명세서 — 각 품목의 식별자(코드/명)와 수량이 "같은 줄"에 함께 있는지
function verifyInbound(text: string, items: Item[]): Verdict {
  const lines = text.split('\n').map(normalizeForMatch)
  const allOk = items.every(i => {
    const qty = String(i.quantity)
    const code = normalizeForMatch(i.product_code)
    const name = normalizeForMatch(i.product_name)
    return lines.some(line =>
      line.includes(qty) && ((!!code && line.includes(code)) || (!!name && line.includes(name)))
    )
  })
  if (!allOk) return { verified: false, reason: '거래명세서의 품목·수량이 실물기록과 일치하지 않습니다.' }
  return { verified: true, reason: null }
}

export async function POST(request: Request) {
  // 로그인 세션 검증 (남용 방지 — OpenAI/파싱 리소스 보호)
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ verified: false, reason: 'unauthorized' }, { status: 401 })
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data: userData, error: authError } = await supabase.auth.getUser(token)
  if (authError || !userData?.user) {
    return NextResponse.json({ verified: false, reason: 'unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { source, companyName, items, file } = body as {
    source: '입고' | '출고'
    companyName: string
    items: Item[]
    file: { contentBase64: string; contentType: string; filename: string }
  }

  if (!file?.contentBase64 || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ verified: false, reason: '검증 입력이 올바르지 않습니다.' }, { status: 400 })
  }

  const buffer = Buffer.from(file.contentBase64, 'base64')
  const isPdf = file.contentType === 'application/pdf' || file.filename.toLowerCase().endsWith('.pdf')
  const text = isPdf
    ? await extractPdfText(buffer)
    : await extractImageText(file.contentBase64, file.contentType || 'image/png')

  // 텍스트 추출 자체가 안 되면 자동검증 불가 -> 검토 필요 (자동완료 금지)
  if (!text) {
    return NextResponse.json({
      verified: false,
      extractable: false,
      reason: '파일에서 텍스트를 추출할 수 없어 자동검증이 불가합니다. 담당자 검토가 필요합니다.'
    })
  }

  const verdict = source === '출고'
    ? verifyOutbound(text, companyName || '', items)
    : verifyInbound(text, items)

  return NextResponse.json({ ...verdict, extractable: true })
}
