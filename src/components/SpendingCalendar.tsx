import { CalendarDays, ChevronLeft, ChevronRight, ReceiptText } from "lucide-react";
import { useMemo, useRef } from "react";
import { dayLabel, firstLedgerMonth, isLedgerMonth, today, won, type Receipt } from "../ledger";

const monthFormat = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", timeZone: "UTC" });
const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
const compactNumber = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 });
function briefWon(amount: number) {
  if (amount >= 100_000_000) return `${compactNumber.format(amount / 100_000_000)}억`;
  if (amount >= 10_000) return `${compactNumber.format(amount / 10_000)}만`;
  return won(amount);
}

export function SpendingCalendar({ receipts, monthParam, dayParam, navigate, openReceipt }: {
  receipts: Receipt[];
  monthParam: string | null;
  dayParam: string | null;
  navigate: (month: string, day?: string) => void;
  openReceipt: (id: string) => void;
}) {
  const current = today();
  const details = useRef<HTMLElement>(null);
  const currentMonth = current.slice(0, 7);
  const month = monthParam && isLedgerMonth(monthParam) ? monthParam : currentMonth < firstLedgerMonth ? firstLedgerMonth : currentMonth;
  const first = new Date(`${month}-01T00:00:00Z`);
  const last = new Date(first);
  last.setUTCMonth(first.getUTCMonth() + 1, 0);
  const count = last.getUTCDate();
  const weekday = first.getUTCDay();
  const dates = Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
  const data = useMemo(() => {
    const days = new Map<string, { rows: Receipt[]; total: number }>();
    let total = 0;
    let count = 0;
    for (const receipt of receipts) {
      if (!receipt.spent_on.startsWith(`${month}-`)) continue;
      let day = days.get(receipt.spent_on);
      if (!day) { day = { rows: [], total: 0 }; days.set(receipt.spent_on, day); }
      day.rows.push(receipt);
      day.total += receipt.amount;
      total += receipt.amount;
      count++;
    }
    return { days, total, count };
  }, [month, receipts]);
  const date = dayParam && dates.includes(dayParam) ? dayParam : current.startsWith(`${month}-`) ? current : dates.find(day => data.days.has(day)) ?? dates[0];
  const selected = data.days.get(date);

  function move(offset: number) {
    const target = new Date(first);
    target.setUTCMonth(target.getUTCMonth() + offset);
    const value = target.toISOString().slice(0, 7);
    if (isLedgerMonth(value)) navigate(value, value === currentMonth ? current : undefined);
  }

  function selectDate(value: string, pointer: boolean) {
    navigate(month, value);
    if (!pointer || !window.matchMedia("(max-width: 760px)").matches) return;
    const panel = details.current;
    if (panel && panel.getBoundingClientRect().top > window.innerHeight - 110) {
      panel.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    }
  }

  return <section className="spending-layout" aria-label="지출 캘린더">
    <div className="desk-panel calendar-panel">
      <div className="calendar-top"><div><h2>지출 캘린더</h2><p>접수된 영수증을 지출일 기준으로 합산해요.</p></div><button type="button" className="office-button calendar-today" disabled={currentMonth < firstLedgerMonth} onClick={() => navigate(currentMonth, current)}>오늘</button></div>
      <div className="calendar-summary"><span>이달 지출 합계</span><strong>{won(data.total)}</strong><small>영수증 {data.count}건</small></div>
      <div className="calendar-month">
        <button type="button" className="office-button calendar-arrow" aria-label="이전 달" disabled={month === firstLedgerMonth} onClick={() => move(-1)}><ChevronLeft size={20} aria-hidden /></button>
        <h3 aria-live="polite">{monthFormat.format(first)}</h3>
        <button type="button" className="office-button calendar-arrow" aria-label="다음 달" disabled={month === "9999-12"} onClick={() => move(1)}><ChevronRight size={20} aria-hidden /></button>
      </div>
      <div className="calendar-week" aria-hidden="true">{weekdays.map(name => <span key={name}>{name}</span>)}</div>
      <div className="calendar-days" role="group" aria-label="날짜별 지출 합계">
        {Array.from({ length: weekday }, (_, i) => <span className="calendar-blank" key={`start-${i}`} aria-hidden="true" />)}
        {dates.map((value, i) => {
          const entry = data.days.get(value);
          return <button type="button" className="calendar-day" key={value} aria-pressed={date === value} aria-current={value === current ? "date" : undefined} aria-controls="calendar-details"
            aria-label={`${dayLabel(value)}, ${entry ? `지출 ${won(entry.total)}, 영수증 ${entry.rows.length}건` : "등록된 지출 없음"}`} onClick={e => selectDate(value, e.detail > 0)}>
            <span className="calendar-day-number">{i + 1}</span>
            {entry && <span className="calendar-day-money" aria-hidden="true">{entry.total < 100_000 ? won(entry.total) : briefWon(entry.total)}</span>}
          </button>;
        })}
        {Array.from({ length: (7 - (count + weekday) % 7) % 7 }, (_, i) => <span className="calendar-blank" key={`end-${i}`} aria-hidden="true" />)}
      </div>
    </div>
    <section id="calendar-details" ref={details} className="desk-panel calendar-details" aria-labelledby="calendar-date">
      <div className="day-overview" aria-live="polite"><span className="day-caption"><CalendarDays size={15} aria-hidden /> 선택한 날짜</span>
        <h2 id="calendar-date">{dayLabel(date)}</h2><strong>{won(selected?.total ?? 0)}</strong><small>영수증 {selected?.rows.length ?? 0}건</small>
      </div>
      {selected ? <ul className="calendar-records" aria-label="선택한 날의 영수증">{selected.rows.map(receipt => <li key={receipt.id} className="date-record">
        <button type="button" className="calendar-record" onClick={() => openReceipt(receipt.id)}>
          <span className="record-icon"><ReceiptText size={17} aria-hidden /></span><span className="calendar-record-name"><strong>{receipt.description}</strong><small>{receipt.submitter}</small></span>
          <strong className="record-money">{won(receipt.amount)}</strong><ChevronRight size={15} aria-hidden />
        </button>
      </li>)}</ul> : <p className="calendar-empty">등록된 지출이 없어요.</p>}
    </section>
  </section>;
}
