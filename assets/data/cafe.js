// 체험용 카페 주문 키오스크 데이터. 가게 이름은 가상이다.
// 문구마다 기본(n)과 쉬운 말(e)이 있다. 쉬운 말은 생성형 AI로 초안을 만들고 사람이 고쳤다.

export const CAFE = {
  id: 'cafe',
  name: '온새미 커피',
  tag: '체험용 주문기',
  brand: '#B4531A',
  brandSoft: '#FBEFE7',
};

export const C_COPY = {
  menu:    { n: '메뉴를 선택해 주세요.', e: '무엇을 드실래요? 말로 해도 돼요.' },
  more:    { n: '전체 메뉴', e: '다른 메뉴 더 보기' },
  option:  { n: '옵션을 선택해 주세요.', e: '어떻게 드릴까요?' },
  cart:    { n: '장바구니', e: '고른 것' },
  pay:     { n: '결제 수단을 선택해 주세요.', e: '어떻게 계산할까요?' },
  confirm: { n: '주문 내역을 확인한 후 결제를 진행해 주세요.', e: '이대로 주문할까요?' },
  paying:  { n: '카드를 투입구에 꽂아 주세요.', e: '카드를 아래 구멍에 꽂아 주세요.' },
  done:    { n: '주문이 완료되었습니다. 주문번호를 확인해 주세요.', e: '주문됐어요. 이 번호를 부르면 받으러 오세요.' },
  ask:     { n: '드시고 싶은 메뉴를 말씀해 주세요.', e: '드시고 싶은 걸 말해 주세요. 예) 따뜻한 라테 한 잔' },
  demo:    { n: '체험용으로 실제 결제는 되지 않습니다.', e: '체험이라 돈은 안 나가요.' },
};

export const CATS = [
  { id: 'coffee', n: '커피', e: '커피' },
  { id: 'tea', n: '라테·차', e: '커피 아닌 음료' },
  { id: 'dessert', n: '디저트', e: '빵·케이크' },
];

// temps: 고를 수 있는 온도. alias: 사람들이 부르는 다른 이름(AI가 말과 맞춰 볼 때 씀)
export const MENU = [
  { id: 'americano', ic: 'coffee', cat: 'coffee', n: '아메리카노', price: 3000, temps: ['HOT', 'ICE'], pop: 1,
    d: '에스프레소에 물을 더한 커피', e: '쓴맛 나는 기본 커피',
    alias: ['아메리카노', '블랙커피', '기본 커피', '쓴 커피', '그냥 커피', '커피 한 잔', '아아', '뜨아'] },
  { id: 'latte', ic: 'coffee', cat: 'coffee', n: '카페라테', price: 3800, temps: ['HOT', 'ICE'], pop: 2,
    d: '에스프레소와 스팀 우유', e: '우유가 들어간 부드러운 커피',
    alias: ['라떼', '라테', '카페 라떼', '우유 커피', '밀크 커피', '부드러운 커피', '우유 들어간 커피'] },
  { id: 'vanilla', ic: 'coffee', cat: 'coffee', n: '바닐라라테', price: 4300, temps: ['HOT', 'ICE'], pop: 4,
    d: '바닐라 시럽을 넣은 카페라테', e: '달콤한 우유 커피',
    alias: ['바닐라 라떼', '단 커피', '달달한 커피', '달콤한 커피', '달게 해 주세요'] },
  { id: 'cappuccino', ic: 'coffee', cat: 'coffee', n: '카푸치노', price: 3800, temps: ['HOT', 'ICE'], pop: 8,
    d: '우유 거품을 듬뿍 올린 커피', e: '우유 거품이 많은 커피',
    alias: ['카푸치노', '거품 많은 커피', '카프치노'] },
  { id: 'caramel', ic: 'coffee', cat: 'coffee', n: '카라멜마키아토', price: 4500, temps: ['HOT', 'ICE'], pop: 7,
    d: '카라멜 소스를 올린 라테', e: '카라멜 맛 나는 아주 단 커피',
    alias: ['캐러멜 마키아토', '카라멜 커피', '아주 단 커피'] },
  { id: 'decaf', ic: 'coffee', cat: 'coffee', n: '디카페인 아메리카노', price: 3500, temps: ['HOT', 'ICE'], pop: 6,
    d: '카페인을 97% 이상 줄인 원두', e: '카페인을 뺀 커피, 밤에 마셔도 돼요',
    alias: ['디카페인', '카페인 없는 커피', '밤에 마셔도 되는 커피', '잠 안 깨는 커피'] },
  { id: 'coldbrew', ic: 'coffee', cat: 'coffee', n: '콜드브루', price: 4000, temps: ['ICE'], pop: 9,
    d: '찬물로 12시간 우려낸 커피', e: '찬물로 오래 내린 시원한 커피',
    alias: ['콜드브루', '더치커피', '찬물로 내린 커피'] },
  { id: 'greentea', ic: 'milk', cat: 'tea', n: '녹차라테', price: 4300, temps: ['HOT', 'ICE'], pop: 10,
    d: '말차 파우더와 우유', e: '녹차 맛 우유',
    alias: ['녹차 라떼', '말차 라떼', '녹차 우유'] },
  { id: 'sweetpotato', ic: 'milk', cat: 'tea', n: '고구마라테', price: 4300, temps: ['HOT', 'ICE'], pop: 5,
    d: '국내산 고구마와 우유', e: '고구마 맛 우유, 커피 아니에요',
    alias: ['고구마 라떼', '고구마 우유', '커피 말고 달달한 거'] },
  { id: 'yuja', ic: 'tea', cat: 'tea', n: '유자차', price: 4000, temps: ['HOT', 'ICE'], pop: 3,
    d: '고흥 유자청으로 만든 차', e: '새콤달콤한 차',
    alias: ['유자차', '유자', '목에 좋은 차', '감기 기운 있을 때 마시는 차', '새콤한 차'] },
  { id: 'ginger', ic: 'tea', cat: 'tea', n: '생강차', price: 4000, temps: ['HOT'], pop: 11,
    d: '생강청으로 만든 따뜻한 차', e: '몸을 따뜻하게 하는 차',
    alias: ['생강차', '생강', '몸 따뜻해지는 차'] },
  { id: 'chamomile', ic: 'tea', cat: 'tea', n: '캐모마일', price: 3800, temps: ['HOT', 'ICE'], pop: 12,
    d: '카페인이 없는 허브티', e: '카페인 없는 꽃차',
    alias: ['캐모마일', '카모마일', '허브차', '꽃차', '카페인 없는 차'] },
  { id: 'cheesecake', ic: 'cake', cat: 'dessert', n: '치즈케이크', price: 5000, temps: [], pop: 13,
    d: '뉴욕 스타일 치즈케이크', e: '부드러운 치즈 케이크 한 조각',
    alias: ['치즈케이크', '케이크', '치즈 케익'] },
  { id: 'muffin', ic: 'cupcake', cat: 'dessert', n: '초코머핀', price: 3500, temps: [], pop: 14,
    d: '초콜릿 칩 머핀', e: '초콜릿 빵',
    alias: ['머핀', '초코 머핀', '초콜릿 빵'] },
  { id: 'croffle', ic: 'waffle', cat: 'dessert', n: '크로플', price: 4500, temps: [], pop: 15,
    d: '크루아상 반죽으로 구운 와플', e: '바삭한 와플 모양 빵',
    alias: ['크로플', '와플', '바삭한 빵'] },
];

export const SIZE_UP = 500;   // 큰 사이즈
export const SHOT_UP = 500;   // 샷 추가 (커피만)

export const PAYS = [
  { id: 'card', n: '신용·체크카드', e: '카드' },
  { id: 'pay', n: '간편결제', e: '휴대폰으로 내기' },
];
