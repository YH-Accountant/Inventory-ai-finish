// isExpiredOrWarning 로직 테스트
// 실행: node test-fifo.mjs

const today = new Date('2026-04-02') // 오늘 날짜 고정

function isExpiredOrWarning(lot, shelfLifeMonths) {
  if (!lot.lot_number || !/^\d{6}-\d{2}$/.test(lot.lot_number)) return false
  const y = parseInt('20' + lot.lot_number.substring(0, 2))
  const m = parseInt(lot.lot_number.substring(2, 4)) - 1
  const d = parseInt(lot.lot_number.substring(4, 6))
  const expiry = new Date(y, m, d)
  expiry.setMonth(expiry.getMonth() + shelfLifeMonths)
  const days = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  return days <= shelfLifeMonths * 30 * 0.25
}

function filterEligible(lots, shelfLifeMonths) {
  return lots
    .filter(lot => !isExpiredOrWarning(lot, shelfLifeMonths))
    .sort((a, b) => a.lot_number.localeCompare(b.lot_number))
}

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`✅ ${name}`)
    passed++
  } catch (e) {
    console.log(`❌ ${name}: ${e.message}`)
    failed++
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg)
}

// --- 테스트 케이스 (shelfLifeMonths=24 기준) ---
// 오늘: 2026-04-02
// 임박 기준: 24개월 * 30일 * 0.25 = 180일 이하 남은 경우
// 만료일이 2026-10-01 이전이면 임박/만료

test('정상 로트 - 충분히 신선 (2025-01-01 제조)', () => {
  const lot = { id: '1', lot_number: '250101-01', quantity: 100 }
  // 만료일: 2027-01-01, 남은일수 약 639일 → 정상
  assert(!isExpiredOrWarning(lot, 24), '정상 로트가 필터링되면 안됨')
})

test('정상 로트 - 경계값 근처지만 정상 (2025-06-01 제조)', () => {
  const lot = { id: '2', lot_number: '250601-01', quantity: 100 }
  // 만료일: 2027-06-01, 남은일수 약 425일 → 정상
  assert(!isExpiredOrWarning(lot, 24), '정상 로트가 필터링되면 안됨')
})

test('임박 로트 - 만료 180일 이내 (2024-04-01 제조)', () => {
  const lot = { id: '3', lot_number: '240401-01', quantity: 100 }
  // 만료일: 2026-04-01, 남은일수 -1 → 만료
  assert(isExpiredOrWarning(lot, 24), '임박/만료 로트는 필터링되어야 함')
})

test('만료 로트 - 이미 만료 (2023-01-01 제조)', () => {
  const lot = { id: '4', lot_number: '230101-01', quantity: 100 }
  // 만료일: 2025-01-01 → 이미 만료
  assert(isExpiredOrWarning(lot, 24), '만료 로트는 필터링되어야 함')
})

test('잘못된 로트번호 형식 → 필터링 안됨', () => {
  const lot = { id: '5', lot_number: 'INVALID', quantity: 100 }
  assert(!isExpiredOrWarning(lot, 24), '잘못된 형식은 false 반환')
})

test('null 로트번호 → 필터링 안됨', () => {
  const lot = { id: '6', lot_number: null, quantity: 100 }
  assert(!isExpiredOrWarning(lot, 24), 'null은 false 반환')
})

// --- FIFO 차감 시뮬레이션 ---
test('FIFO 차감: 정상 로트만 오래된 순으로 차감', () => {
  const lots = [
    { id: '1', lot_number: '250301-01', quantity: 300 }, // 정상
    { id: '2', lot_number: '240401-01', quantity: 200 }, // 만료
    { id: '3', lot_number: '250101-01', quantity: 200 }, // 정상 (더 오래됨)
  ]
  const eligible = filterEligible(lots, 24)
  assert(eligible.length === 2, `정상 로트 2개여야 함 (got ${eligible.length})`)
  assert(eligible[0].lot_number === '250101-01', 'FIFO: 오래된 로트 먼저')
  assert(eligible[1].lot_number === '250301-01', 'FIFO: 최신 로트 나중')
})

test('FIFO 차감: 정상 재고 합계 계산', () => {
  const lots = [
    { id: '1', lot_number: '250301-01', quantity: 300 },
    { id: '2', lot_number: '240401-01', quantity: 200 }, // 만료 제외
    { id: '3', lot_number: '250101-01', quantity: 200 },
  ]
  const eligible = filterEligible(lots, 24)
  const total = eligible.reduce((sum, lot) => sum + lot.quantity, 0)
  assert(total === 500, `가용 재고 500이어야 함 (got ${total})`)
})

test('출고 수량이 가용 재고 초과시 차단', () => {
  const lots = [
    { id: '1', lot_number: '250101-01', quantity: 300 },
    { id: '2', lot_number: '240401-01', quantity: 1000 }, // 만료 → 제외
  ]
  const eligible = filterEligible(lots, 24)
  const total = eligible.reduce((sum, lot) => sum + lot.quantity, 0)
  const requested = 500
  assert(total < requested, '만료 재고 포함하면 가능하지만 정상만으론 부족해야 함')
})

// --- 결과 ---
console.log(`\n결과: ${passed}개 통과 / ${failed}개 실패`)
if (failed > 0) process.exit(1)
