// utils/parseMarkdown.js
// 共用 Markdown 解析器，TripApp 和 TripSelector 都可以 import

export function parseMarkdown(mdText, tripStartDate) {
  const lines = mdText.split('\n');
  const itineraryItems = [];
  const checklistItems = [];
  const accommodationItems = [];
  const savedSpotItems = [];

  // 頂層 meta（# 標題、- 日期：、- 幣別：）
  let tripName = '';
  let parsedStartDate = '';
  let parsedEndDate = '';
  let parsedCurrency = '';

  let section = null;
  let currentDate = null;
  let currentItem = null;
  let currentAccom = null;
  let currentSpot = null;

  const pushCurrentItem = () => {
    if (!currentItem) return;
    if (currentItem.type === 'place' && currentItem.title)
      itineraryItems.push({ ...currentItem, id: crypto.randomUUID() });
    if (currentItem.type === 'transport' && currentItem.transportMode)
      itineraryItems.push({ ...currentItem, id: crypto.randomUUID() });
    currentItem = null;
  };
  const pushCurrentAccom = () => {
    if (currentAccom?.name) accommodationItems.push(currentAccom);
    currentAccom = null;
  };
  const pushCurrentSpot = () => {
    if (currentSpot?.name)
      savedSpotItems.push({ ...currentSpot, id: crypto.randomUUID(), createdAt: new Date().toISOString() });
    currentSpot = null;
  };

  const resolveDeadline = (val) => {
    const m = val?.match(/出發前(\d+)天/);
    if (m && (tripStartDate || parsedStartDate)) {
      const d = new Date(tripStartDate || parsedStartDate);
      d.setDate(d.getDate() - parseInt(m[1]));
      return d.toISOString().split('T')[0];
    }
    return val || '';
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    // ── 頂層標題 ──
    if (trimmed.startsWith('# ') && !tripName) {
      tripName = trimmed.slice(2).trim();
      continue;
    }

    // ── section 切換 ──
    if (trimmed.startsWith('## 必帶物品')) { section = 'musthave';      pushCurrentItem(); pushCurrentAccom(); pushCurrentSpot(); continue; }
    if (trimmed.startsWith('## 行程'))     { section = 'itinerary';     pushCurrentItem(); pushCurrentAccom(); pushCurrentSpot(); continue; }
    if (trimmed.startsWith('## 住宿'))     { section = 'accommodation'; pushCurrentItem(); pushCurrentAccom(); pushCurrentSpot(); continue; }
    if (trimmed.startsWith('## 收藏景點')) { section = 'spots';         pushCurrentItem(); pushCurrentAccom(); pushCurrentSpot(); continue; }
    if (trimmed.startsWith('## '))         { section = null;            pushCurrentItem(); pushCurrentAccom(); pushCurrentSpot(); continue; }

    // ── 日期標題 ──
    if (trimmed.startsWith('### ') && section === 'itinerary') {
      pushCurrentItem();
      const d = trimmed.replace('### ', '').trim().match(/\d{4}-\d{2}-\d{2}/);
      currentDate = d ? d[0] : null;
      continue;
    }

    // ── 景點或交通節點 ──
    if (trimmed.startsWith('#### ') && section === 'itinerary') {
      pushCurrentItem();
      const rest = trimmed.replace('#### ', '').trim();
      const transportMatch = rest.match(/^\[交通\]\s*(\d{2}:\d{2})?(.*)$/);
      const placeMatch     = rest.match(/^\[景點\]\s*(\d{2}:\d{2})\s+(.+)$/);
      if (transportMatch) {
        currentItem = { type: 'transport', date: currentDate||'', time: transportMatch[1]?.trim()||'',
          transportMode:'', from:'', to:'', title:'', duration:'', price:'', url:'', needTicket:false, ticketDeadline:'', notes:'' };
      } else if (placeMatch) {
        currentItem = { type: 'place', date: currentDate||'', time: placeMatch[1], title: placeMatch[2].trim(),
          location:'', notes:'', website:'', hours:'', tickets:'', shoppingList:[] };
      }
      continue;
    }

    // ── KV 欄位解析 ──
    const kvMatch = trimmed.match(/^-?\s*(.+?)：(.+)$/);
    if (kvMatch) {
      const [, key, val] = kvMatch;
      const k = key.trim(), v = val.trim();

      // 頂層 meta（section 為 null 時）
      if (!section) {
        if (k === '日期') {
          const dates = v.match(/(\d{4}-\d{2}-\d{2})\s*[~～\-]\s*(\d{4}-\d{2}-\d{2})/);
          if (dates) { parsedStartDate = dates[1]; parsedEndDate = dates[2]; }
          else {
            const single = v.match(/\d{4}-\d{2}-\d{2}/);
            if (single) parsedStartDate = single[0];
          }
        }
        if (k === '幣別') parsedCurrency = v;
        continue;
      }

      // 必帶物品
      if (section === 'musthave') {
        checklistItems.push({ id: crypto.randomUUID(), text: v || k, checked: false });
        continue;
      }

      // 行程欄位
      if (section === 'itinerary' && currentItem) {
        if (currentItem.type === 'transport') {
          if (k === '交通方式')  currentItem.transportMode = v;
          else if (k === '搭車地點')  currentItem.from = v;
          else if (k === '下車地點')  currentItem.to = v;
          else if (k === '班次名稱')  currentItem.title = v;
          else if (k === '預估時間')  currentItem.duration = v;
          else if (k === '票價')      currentItem.price = v;
          else if (k === '購票連結')  currentItem.url = v;
          else if (k === '需提前購票') currentItem.needTicket = v === '是';
          else if (k === '購票截止')  currentItem.ticketDeadline = resolveDeadline(v);
          else if (k === '備註')      currentItem.notes = v;
        } else {
          if (k === '地點')      currentItem.location = v;
          else if (k === '備註') currentItem.notes = v;
          else if (k === '官網') currentItem.website = v;
          else if (k === '營業時間') currentItem.hours = v;
          else if (k === '門票') currentItem.tickets = v;
        }
        continue;
      }

      // 住宿
      if (section === 'accommodation') {
        if (k === '入住') { pushCurrentAccom(); currentAccom = { name:'', location:'', checkIn: v, checkOut:'' }; }
        else if (currentAccom) {
          if (k === '退房') currentAccom.checkOut = v;
          else if (k === '名稱') currentAccom.name = v;
          else if (k === '地點') currentAccom.location = v;
        }
        continue;
      }

      // 收藏景點
      if (section === 'spots') {
        if (k === '名稱') { pushCurrentSpot(); currentSpot = { name: v, location:'', note:'', url:'' }; }
        else if (currentSpot) {
          if (k === '地點') currentSpot.location = v;
          else if (k === '備註') currentSpot.note = v;
          else if (k === '連結') currentSpot.url = v;
        }
        continue;
      }
    }

    // 必帶物品（純 - 列表）
    if (section === 'musthave' && trimmed.startsWith('- ')) {
      const text = trimmed.replace(/^-\s+/, '').trim();
      if (text) checklistItems.push({ id: crypto.randomUUID(), text, checked: false });
    }
  }

  pushCurrentItem();
  pushCurrentAccom();
  pushCurrentSpot();

  return {
    tripName,
    tripStartDate: parsedStartDate,
    tripEndDate:   parsedEndDate,
    baseCurrency:  parsedCurrency,
    itineraryItems,
    checklistItems,
    accommodationItems,
    savedSpotItems,
  };
}
