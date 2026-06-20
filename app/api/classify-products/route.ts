import { NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export async function POST(request: Request) {
  try {
    const { productNames } = await request.json()

    if (!productNames || !Array.isArray(productNames) || productNames.length === 0) {
      return NextResponse.json({ suggest_off: [], needs_review: [] })
    }

    console.log('🤖 [분류] 제품 분류 요청:', productNames.length, '개')

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `당신은 재고 유통기한 관리 분류 전문가입니다.
제품명 목록을 보고 아래 세 갈래 중 해당하는 것만 JSON에 포함합니다.

## 분류 기준

### suggest_off (유통기한 관리 OFF 추천)
유통기한이 존재하지 않음이 "이름만 봐도" 명백한 비소모품 단품.
예: 우산, 파우치, 가방, 케이스, 홀더, 컵, 텀블러, 수저, 머그, 충전기, 케이블, 이어폰, 스피커, 인형, 키링, 뱃지, 거울, 액자, 양말, 장갑, 모자

### needs_review (사람 확인 필요)
이름만으로는 판단이 갈리는 경우만. 조건 중 하나라도 해당하면 포함:
- 제품명에 "기획", "세트", "증정", "구성", "패키지", "선물", "기프트"가 포함됨
  (화장품 단품이 포함된 구성품일 수 있음)
- 비소모품 키워드(파우치·박스·케이스 등)가 있으나 채널명·브랜드명과 결합되어 내용물 불확실
  예: "올리브영 기획용 파우치", "틴트 증정 박스"

### 아무 목록에도 넣지 말 것 (조용히 ON 처리)
- 화장품·뷰티: 쿠션, 파운데이션, 립스틱, 틴트, 아이섀도, 마스카라, 블러셔, 선크림, 로션, 크림, 세럼, 에센스, 앰플, 토너, 미스트, 스킨, 클렌저, 폼클렌징, 팩, 마스크팩, 퍼퓸, 향수, BB크림, CC크림, 프라이머, 컨실러, 하이라이터, 브론저, 젤, 왁스, 샴푸, 컨디셔너, 트리트먼트, 바디로션, 바디워시, 핸드크림
- 식품·음료: 모든 식품, 음료, 주류, 과자, 건강식품, 영양제, 비타민, 프로틴, 콜라겐
- 위 카테고리에 명확히 속하는 제품은 절대 needs_review에 넣지 말 것
  예: "데일리쿠션", "로맨틱퍼퓸", "수분크림", "비타민C" → ON 처리, 목록 제외

## 중요 규칙
- suggest_off와 needs_review는 서로 겹치지 않음
- 화장품·식품임이 명백하면 어느 목록에도 넣지 않음
- 불확실하면 suggest_off가 아닌 needs_review (혹은 제외)
- "기획" 키워드가 있어도 화장품 단품이 명백하면 제외 (예: "기획 수분크림 50ml")
- 비소모품 키워드가 없는데 단순히 제품명이 짧거나 불명확하다고 needs_review에 넣지 말 것

JSON으로만 응답 (다른 텍스트 없이):
{"suggest_off": ["제품명"], "needs_review": ["제품명"]}`
        },
        {
          role: 'user',
          content: `다음 제품들을 분류해 주세요:\n${productNames.join('\n')}`
        }
      ],
      temperature: 0.1,
      max_tokens: 1000
    })

    const content = response.choices[0]?.message?.content || '{}'
    console.log('🤖 [분류] AI 응답:', content)

    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      console.log('🤖 [분류] suggest_off:', parsed.suggest_off || [], '/ needs_review:', parsed.needs_review || [])
      return NextResponse.json({
        suggest_off: parsed.suggest_off || [],
        needs_review: parsed.needs_review || []
      })
    }

    return NextResponse.json({ suggest_off: [], needs_review: [] })
  } catch (error) {
    console.error('🤖 [분류] 에러:', error)
    return NextResponse.json({ suggest_off: [], needs_review: [] })
  }
}
