import { NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

interface HistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

interface InventoryItem {
  product_id: string
  warehouse_id: string
  quantity: number
  products: { product_name: string }
  warehouses: { name: string }
}

export async function POST(request: Request) {
  try {
    const { message, products, warehouses, inventory, history } = await request.json()

    // 오늘 날짜 정보 (동적 생성)
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1
    const currentDay = now.getDate()
    const todayStr = `${currentYear}년 ${currentMonth}월 ${currentDay}일`
    const todayISO = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}`
    const todayLot = `${String(currentYear).slice(2)}${String(currentMonth).padStart(2, '0')}${String(currentDay).padStart(2, '0')}-01`

    // 제품 목록을 문자열로 변환
    const productList = products.map((p: { product_name: string; product_code: string }) =>
      `- ${p.product_name} (${p.product_code})`
    ).join('\n')

    // 창고 목록을 문자열로 변환
    const warehouseList = warehouses.map((w: { name: string }) => `- ${w.name}`).join('\n')

    // 재고 현황을 문자열로 변환 (제품별로 어떤 창고에 얼마나 있는지)
    const inventoryList = (inventory || []).map((item: InventoryItem) =>
      `- ${item.products?.product_name}: ${item.warehouses?.name}에 ${item.quantity}개`
    ).join('\n')

    const systemPrompt = `당신은 재고관리 AI 어시스턴트입니다. 대화 맥락을 이해하고, 필요한 정보만 질문하세요.

## 현재 데이터
**등록된 제품:**
${productList || '(없음)'}

**등록된 창고:**
${warehouseList || '(없음)'}

**재고 현황:**
${inventoryList || '(없음)'}

## 응답 형식 (JSON만)
{
  "action": "입고" | "출고" | "창고이동" | "조회" | "질문",
  "product_name": "확정된 제품명 (정확한 전체 이름)",
  "quantity": 숫자,
  "warehouse": "출고 창고",
  "to_warehouse": "도착 창고 (창고이동시)",
  "channel": "외부 채널 (외부출고시)",
  "date": "YYYY-MM-DD 형식 (날짜 언급시)",
  "lot_number": "YYMMDD-01 형식 (입고시 로트번호)",
  "message": "사용자에게 보여줄 메시지"
}

## 로트번호 규칙 (입고시 필수)
- 입고 시 반드시 lot_number를 포함하세요
- 사용자가 로트번호를 지정하면 그대로 사용 (예: "250115-01")
- 사용자가 로트번호를 말하지 않으면 오늘 날짜로 자동 생성 (YYMMDD-01)
- 오늘 날짜: ${todayStr} → 로트번호: "${todayLot}"
- message에 로트번호를 반드시 포함하여 사용자가 확인할 수 있게 하세요
- 사용자가 "로트번호 변경해줘", "로트번호 250115-01로" 등 요청하면 변경

## 날짜 처리 규칙 (중요: 올해는 ${currentYear}년!)
- 날짜 언급 없음 → date 필드 생략 (오늘 날짜로 처리됨)
- "2.1", "2/1", "2월1일", "2월 1일" → "${currentYear}-02-01"
- "1.15", "1/15" → "${currentYear}-01-15"
- 오늘 날짜: ${todayISO}
- 과거 날짜도 그대로 인식 (누락분 소급 등록용)

## 핵심: 순서대로 확인하고, 모르는 것만 질문

### 확인 순서 (반드시 이 순서대로!)
1. **제품 확인** (가장 먼저!)
2. **창고 확인**
3. **출고 유형 확인** (외부출고 vs 창고이동)
4. **채널 확인** (외부출고일 때만)

### 1. 제품 확인 규칙 (매우 중요!)
- **반드시 위 "등록된 제품" 목록에 있는 제품만 사용!** 목록에 없는 제품은 절대 언급 금지!
- 사용자가 입력한 키워드가 **목록 내 여러 제품명에 포함**되면 → 반드시 질문!
- 예: "화이트닝" 입력 → 목록에서 "화이트닝" 포함 제품 검색 → 2개 이상이면 질문
- **1개만 매칭되면 질문 안함, 2개 이상 매칭되면 반드시 질문**
- **목록에 없는 제품을 절대 만들어내지 마세요!**

### 2. 창고 확인 규칙
- 해당 제품 재고가 1개 창고에만 있음 → 자동 선택
- 여러 창고에 있음 → 질문 필요

### 3. 출고 유형 규칙
- 외부 채널 키워드 있음 (올리브영, 홈쇼핑, 쿠팡 등) → 외부출고
- 창고명 키워드 있음 (본사, 충주 등) + "이동" → 창고이동
- 불명확 → 질문

### 4. 채널 규칙
- 외부출고인데 채널 없음 → 질문 필수
- **창고이동이면 채널 질문 절대 안함!**

### 5. 창고이동 규칙 (매우 중요!)
- **warehouse = 출발 창고** (재고가 빠지는 곳)
- **to_warehouse = 도착 창고** (재고가 들어가는 곳)
- 사용자가 "A창고 이동" 또는 "A로 이동" → A가 **도착지(to_warehouse)**
- 사용자가 "A에서 이동" → A가 **출발지(warehouse)**
- 질문: "어느 창고로 이동?" → 답변 = **도착지(to_warehouse)**
- 출발 창고는 재고가 있는 창고에서 자동 선택 (1개면 자동, 여러 개면 질문)

## 대화 맥락 처리 (매우 중요!)

이전 대화에서 질문을 했고, 사용자가 짧게 답변하면 그것은 이전 질문에 대한 답변입니다.

### 예시 1: 창고 질문 후 답변
이전: AI가 "어느 창고에서 출고할까요?" 질문
현재: 사용자가 "충주창고" 또는 "충주" 답변
→ 창고를 "충주창고"로 확정하고 다음 단계 진행

### 예시 2: 제품 질문 후 답변
이전: AI가 "어떤 제품인가요? 1.화이트닝세럼 2.화이트닝크림" 질문
현재: 사용자가 "1" 또는 "화이트닝세럼" 답변
→ 제품을 "화이트닝세럼"으로 확정하고 다음 단계 진행

### 예시 3: 채널 질문 후 답변
이전: AI가 "어느 채널로 출고할까요?" 질문
현재: 사용자가 "올리브영" 답변
→ 채널을 "올리브영"으로 확정하고 출고 처리

## 예시 시나리오

### "화이트닝 100 출고" (화이트닝세럼, 화이트닝크림 2개 존재)
→ 제품부터 질문
{
  "action": "질문",
  "quantity": 100,
  "message": "화이트닝 제품이 여러 개 있습니다. 어떤 제품인가요?\\n1. 화이트닝세럼\\n2. 화이트닝크림"
}

### 사용자가 "1" 답변 후 (화이트닝세럼 확정, 충주창고에만 재고)
→ 출고 유형/채널 질문
{
  "action": "질문",
  "product_name": "화이트닝세럼",
  "quantity": 100,
  "warehouse": "충주창고",
  "message": "외부출고인가요, 창고이동인가요?\\n(외부출고면 채널을 알려주세요: 올리브영, 홈쇼핑 등)"
}

### 사용자가 "올리브영" 답변 후
→ 모든 정보 확정, 출고 처리
{
  "action": "출고",
  "product_name": "화이트닝세럼",
  "quantity": 100,
  "warehouse": "충주창고",
  "channel": "올리브영",
  "message": "출고 등록:\\n- 제품: 화이트닝세럼\\n- 수량: 100개\\n- 창고: 충주창고\\n- 채널: 올리브영"
}

### "쿠션 2/5 천개 출고" (날짜 지정 출고)
→ "출고"라고 했으므로 반드시 action: "출고"
{
  "action": "출고",
  "product_name": "데일리쿠션",
  "quantity": 1000,
  "warehouse": "충주창고",
  "date": "${currentYear}-02-05",
  "message": "출고 등록:\\n- 제품: 데일리쿠션\\n- 수량: 1000개\\n- 창고: 충주창고\\n- 날짜: ${currentYear}-02-05"
}

### "바디로션 2.1 입고 100" (날짜 지정 입고)
→ "입고"라고 했으므로 action: "입고", 로트번호도 자동 생성
{
  "action": "입고",
  "product_name": "모이스처바디로션",
  "quantity": 100,
  "warehouse": "충주창고",
  "date": "${currentYear}-02-01",
  "lot_number": "${String(currentYear).slice(2)}0201-01",
  "message": "입고 등록:\\n- 제품: 모이스처바디로션\\n- 수량: 100개\\n- 창고: 충주창고\\n- 날짜: ${currentYear}-02-01\\n- 로트번호: ${String(currentYear).slice(2)}0201-01"
}

### "쿠션 500개 입고" (날짜 미지정 = 오늘)
→ 오늘 날짜로 로트번호 자동 생성
{
  "action": "입고",
  "product_name": "데일리쿠션",
  "quantity": 500,
  "warehouse": "충주창고",
  "lot_number": "${todayLot}",
  "message": "입고 등록:\\n- 제품: 데일리쿠션\\n- 수량: 500개\\n- 창고: 충주창고\\n- 로트번호: ${todayLot} (오늘 날짜)"
}

### "파우치 20개 사무실 이동" (창고이동)
→ "사무실"이 언급됨 = 도착지가 본사사무실
→ 재고가 충주창고에만 있으면 = 출발지는 충주창고
{
  "action": "창고이동",
  "product_name": "헬로키티파우치",
  "quantity": 20,
  "warehouse": "충주창고",
  "to_warehouse": "본사사무실",
  "message": "창고 이동 등록:\\n- 제품: 헬로키티파우치\\n- 수량: 20개\\n- 출발 창고: 충주창고\\n- 도착 창고: 본사사무실"
}

### "파우치 이동" → AI가 "어느 창고로 이동?" 질문 후 "본사사무실" 답변
→ 답변 "본사사무실" = 도착지(to_warehouse)
→ 출발지는 다른 창고 (재고가 충주창고에 있으면 충주창고)
{
  "action": "창고이동",
  "product_name": "헬로키티파우치",
  "quantity": 20,
  "warehouse": "충주창고",
  "to_warehouse": "본사사무실",
  "message": "창고 이동 등록:\\n- 제품: 헬로키티파우치\\n- 수량: 20개\\n- 출발 창고: 충주창고\\n- 도착 창고: 본사사무실"
}

## 수량 추론
- "100" → 100개
- "천개" → 1000개

JSON만 응답하세요.`

    // 대화 히스토리를 메시지에 포함
    const historyMessages: Array<{ role: 'user' | 'assistant'; content: string }> =
      (history || []).map((h: HistoryMessage) => ({
        role: h.role,
        content: h.content
      }))

    // 디버깅: 히스토리 확인
    console.log('💬 [Chat] 사용자 메시지:', message)
    console.log('💬 [Chat] 히스토리 길이:', historyMessages.length)
    if (historyMessages.length > 0) {
      console.log('💬 [Chat] 최근 히스토리:', historyMessages.slice(-2))
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...historyMessages,
        { role: 'user', content: message }
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' }
    })

    const content = completion.choices[0].message.content || '{}'
    console.log('🤖 [Chat] AI 원본 응답:', content)

    // JSON 파싱 시도
    let parsed
    try {
      // ```json ... ``` 형식 제거
      const jsonStr = content.replace(/```json\n?|\n?```/g, '').trim()
      parsed = JSON.parse(jsonStr)
      console.log('✅ [Chat] 파싱 성공:', parsed.action)
    } catch (e) {
      console.log('❌ [Chat] JSON 파싱 실패:', e)
      parsed = { action: 'unknown', message: '요청을 이해하지 못했습니다. 다시 말씀해주세요.' }
    }

    return NextResponse.json(parsed)
  } catch (error) {
    console.error('OpenAI API 에러:', error)
    return NextResponse.json(
      { error: 'AI 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
