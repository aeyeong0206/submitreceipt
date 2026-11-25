import { ArrowDownLeft, ArrowLeftRight, CalendarDays, Check, ClipboardCheck, FileSearch, LockKeyhole, Printer, ReceiptText, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { OfficeHeader } from "../components/OfficeHeader";
import { SpendingCalendar } from "../components/SpendingCalendar";
import { dayLabel, firstLedgerYear, isLedgerMonth, isLedgerYear, stamp, today, won, type Ledger, type Receipt, type ReceiptDetail, type Transaction } from "../ledger";
import { ApiError, api } from "../lib/api";
import { DetailDrawer } from "../owner/DetailDrawer";
import "../office.css";

type Flag = "checked_at" | "printed_at";
type Mode = "link" | "pending" | "exempt";
type View = "receipts" | "bank" | "calendar";
type Session = { token: string; demo: boolean; data: Ledger };

function demoLedger(): Ledger {
  const d = today(), time = new Date().toISOString();
  const more: [string, string, number][] = [["03", "찬양팀 악보", 18000], ["12", "소그룹 간식", 34600], ["18", "예배실 청소용품", 26400]];
  const receipts = [
    { id: "demo-receipt-1", spent_on: d, submitter: "예시 김민지", description: "주일학교 교재 구입", amount: 48000, checked_at: null, printed_at: null },
    { id: "demo-receipt-2", spent_on: d, submitter: "예시 이지우", description: "예배 안내지 인쇄", amount: 22000, checked_at: time, printed_at: time },
    ...more.filter(([date]) => date !== d.slice(-2)).map(([date, description, amount]) => ({ id: `demo-receipt-${date}`, spent_on: `${d.slice(0, 7)}-${date}`, submitter: "예시 박서윤", description, amount, checked_at: time, printed_at: null })),
  ].sort((a, b) => b.spent_on.localeCompare(a.spent_on));
  return { receipts, transactions: [
    { id: "demo-tx-1", booked_on: d, direction: "out", description: "교재비 환급", amount: 48000, receipt_id: null, exempt: 0 },
    { id: "demo-tx-2", booked_on: d, direction: "out", description: "안내지 인쇄비 환급", amount: 22000, receipt_id: "demo-receipt-2", exempt: 0 },
    { id: "demo-tx-3", booked_on: d, direction: "in", description: "정기 입금", amount: 150000, receipt_id: null, exempt: 1 },
  ] };
}

const demoPhoto = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="430" height="325" viewBox="0 0 430 325"><rect width="430" height="325" fill="#f0eee5"/><rect x="25" y="25" width="380" height="275" fill="white" stroke="#c8d3c4"/><text x="215" y="104" font-size="29" text-anchor="middle" fill="#173d30">예시 영수증</text><path d="M60 145H370M60 170H370M60 195H295" stroke="#b9c9b9" stroke-width="2"/><text x="370" y="247" font-size="16" text-anchor="end" fill="#173d30">인쇄 미리보기용</text></svg>')}`;

export default function Admin() {
  const [session, setSession] = useState<Session | null>(null);
  const [gate, setGate] = useState({ busy: false, error: "" });
  async function unlock(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const token = String(new FormData(e.currentTarget).get("password") ?? "");
    setGate({ busy: true, error: "" });
    try { setSession({ token, demo: false, data: await adminApi<Ledger>(token, "/ledger") }); setGate({ busy: false, error: "" }); }
    catch (err) { setGate({ busy: false, error: err instanceof ApiError && err.status === 404 ? "회계 비밀번호를 확인해 주세요. 처음이라면 담당자 비밀번호 설정이 필요해요." : (err as Error).message }); }
  }
  return <div className="office"><OfficeHeader admin />
    {session ? <Desk session={session} lock={() => setSession(null)} /> : <main className="office-width gate-layout" id="office-main" tabIndex={-1}>
      <section className="gate"><span className="gate-icon"><LockKeyhole size={23} aria-hidden /></span>
        <h1>회계 담당자 전용</h1><p>접수된 영수증과 교회 계좌 내역을 보려면 비밀번호를 입력해 주세요.</p>
        <form onSubmit={unlock}><label>회계 비밀번호<input name="password" type="password" autoComplete="current-password" required /></label>
          {gate.error && <p className="office-error" role="alert">{gate.error}</p>}
          <button className="office-button primary" disabled={gate.busy}>{gate.busy ? "여는 중…" : "회계 장부 열기"}</button>
        </form>
        {import.meta.env.DEV && <div className="demo-entry"><button type="button" className="office-button quiet" onClick={() => setSession({ token: "", demo: true, data: demoLedger() })}>예시 장부 둘러보기</button><p>실제 정보와 분리된 연습 화면이에요.</p></div>}
      </section>
    </main>}
  </div>;
}

function adminApi<T>(token: string, path: string, method = "GET", body?: unknown) {
  return api<T>(`/api/admin${path}`, { method, headers: { authorization: `Bearer ${encodeURIComponent(token)}` }, body: body === undefined ? undefined : JSON.stringify(body) });
}

function Desk({ session, lock }: { session: Session; lock: () => void }) {
  const { token, demo } = session;
  const [ledger, setLedger] = useState(session.data);
  const [params, setParams] = useSearchParams();
  const view = params.get("view");
  const tab: View = view === "bank" || view === "calendar" ? view : "receipts";
  const monthParam = params.get("month") ?? "";
  const yearParam = params.get("year") ?? "";
  const month = isLedgerMonth(monthParam) ? monthParam : "";
  const year = month ? month.slice(0, 4) : isLedgerYear(yearParam) ? yearParam : "";
  const lastYear = Math.max(firstLedgerYear, Number(today().slice(0, 4)) + 1, Number(year));
  const years = useMemo(() => {
    const maxYear = Math.max(
      ledger.receipts.reduce((max, row) => Math.max(max, Number(row.spent_on.slice(0, 4))), lastYear),
      ledger.transactions.reduce((max, row) => Math.max(max, Number(row.booked_on.slice(0, 4))), lastYear),
    );
    return Array.from({ length: maxYear - firstLedgerYear + 1 }, (_, i) => firstLedgerYear + i);
  }, [lastYear, ledger.receipts, ledger.transactions]);
  const filter = params.get("filter") ?? "all";
  const [open, setOpen] = useState<string | null>(null);
  const [match, setMatch] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const receipt = ledger.receipts.find(r => r.id === open);
  const transaction = ledger.transactions.find(t => t.id === match);
  const receiptById = useMemo(() => new Map(ledger.receipts.map(r => [r.id, r])), [ledger.receipts]);
  const linkedIds = useMemo(() => new Set(ledger.transactions.map(t => t.receipt_id)), [ledger.transactions]);
  const period = month || year;
  const inPeriod = (d: string) => !period || d.startsWith(`${period}-`);
  const monthReceipts = ledger.receipts.filter(r => inPeriod(r.spent_on));
  const monthTransactions = ledger.transactions.filter(t => inPeriod(t.booked_on));
  const unchecked = monthReceipts.filter(r => !r.checked_at).length;
  const unprinted = monthReceipts.filter(r => !r.printed_at).length;
  const missing = monthTransactions.filter(t => !t.receipt_id && !t.exempt).length;

  function filterTo(value: string) { setParams(p => { if (value === "all") p.delete("filter"); else p.set("filter", value); return p; }, { replace: true }); }
  function go(value: View) { setNotice(""); setError(""); setParams(p => { if (value === "receipts") p.delete("view"); else p.set("view", value); p.delete("filter"); return p; }); }
  function openReceipt(id: string) { setOpen(id); setError(""); }
  function navigateCalendar(month: string, day?: string) { setParams(p => { p.set("calendar", month); if (day) p.set("day", day); else p.delete("day"); return p; }, { replace: true, preventScrollReset: true }); }
  function setPeriod(nextYear: string, nextMonth = "") {
    setParams(p => {
      p.delete("month"); p.delete("year");
      if (isLedgerMonth(`${nextYear}-${nextMonth}`)) p.set("month", `${nextYear}-${nextMonth}`);
      else if (isLedgerYear(nextYear)) p.set("year", nextYear);
      return p;
    }, { replace: true, preventScrollReset: true });
  }
  async function act(run: () => Promise<void>, message: string) {
    setBusy(true); setNotice(""); setError("");
    try { await run(); setNotice(message); return true; }
    catch (e) { setError((e as Error).message); return false; }
    finally { setBusy(false); }
  }
  async function flag(row: Receipt, field: Flag, value: boolean) {
    await act(async () => {
      const result = demo ? { stamp: value ? new Date().toISOString() : null } : await adminApi<{ stamp: string | null }>(token, `/receipts/${row.id}`, "PATCH", { field, value });
      setLedger(v => ({ ...v, receipts: v.receipts.map(r => r.id === row.id ? { ...r, [field]: result.stamp } : r) }));
    }, value ? field === "printed_at" ? "인쇄 완료로 표시했어요." : "확인 완료로 표시했어요." : "완료 표시를 해제했어요.");
  }
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget;
    const fields = new FormData(form);
    const draft = { booked_on: String(fields.get("booked_on")), direction: fields.get("direction") === "in" ? "in" as const : "out" as const, description: String(fields.get("description") ?? "").trim(), amount: Number(fields.get("amount")) };
    if (!draft.description) { setError("거래 내용을 입력해 주세요."); form.querySelector<HTMLInputElement>("[name=description]")?.focus(); return; }
    const saved = await act(async () => {
      const row = demo ? { ...draft, id: crypto.randomUUID(), receipt_id: null, exempt: 0 } : await adminApi<Transaction>(token, "/transactions", "POST", draft);
      setLedger(v => ({ ...v, transactions: [row, ...v.transactions].sort((a, b) => b.booked_on.localeCompare(a.booked_on)) }));
    }, "입출금 내역을 추가했어요.");
    if (saved) { form.reset(); setParams(p => {
      if (period && !inPeriod(draft.booked_on)) {
        const addedMonth = draft.booked_on.slice(0, 7);
        p.delete("month"); p.delete("year");
        if (isLedgerMonth(addedMonth)) p.set(month ? "month" : "year", month ? addedMonth : addedMonth.slice(0, 4));
      }
      p.delete("filter"); return p;
    }, { replace: true }); }
  }
  async function connect(row: Transaction, mode: Mode, receipt_id?: string) {
    const saved = await act(async () => {
      const patch = demo ? { receipt_id: mode === "link" ? receipt_id ?? null : null, exempt: mode === "exempt" ? 1 : 0 }
        : await adminApi<Pick<Transaction, "receipt_id" | "exempt">>(token, `/transactions/${row.id}`, "PATCH", { mode, receipt_id });
      setLedger(v => ({ ...v, transactions: v.transactions.map(t => t.id === row.id ? { ...t, ...patch } : t) }));
    }, mode === "link" ? "영수증을 거래에 연결했어요." : mode === "exempt" ? "영수증이 필요 없는 거래로 표시했어요." : "미접수 상태로 바꿨어요.");
    if (saved) setMatch(null);
  }

  const receiptRows = monthReceipts.filter(r => filter === "check" ? !r.checked_at : filter === "print" ? !r.printed_at : true);
  const transactionRows = monthTransactions.filter(t => filter === "missing" ? !t.receipt_id && !t.exempt : filter === "linked" ? !!t.receipt_id : filter === "exempt" ? !!t.exempt : true);
  return <main className="office-width desk" id="office-main" tabIndex={-1}>
    <div className="section-top desk-intro"><div><div className="desk-kicker">{demo ? "예시 장부 · 실제 자료와 분리됨" : "회계 담당자 전용"}</div><h1>교회 회계 장부</h1><p>영수증 접수부터 인쇄, 계좌 내역 대조까지 한 곳에서 관리해요.</p></div><button className="office-button quiet" type="button" onClick={lock}><LockKeyhole size={15} aria-hidden />{demo ? "예시 종료" : "장부 잠그기"}</button></div>
    {tab !== "calendar" && <div className="desk-stats">
      <button type="button" onClick={() => setParams(p => { p.delete("view"); p.set("filter", "check"); return p; })}><ClipboardCheck size={20} aria-hidden /><span>확인 전 영수증<strong>{unchecked}<small>건</small></strong></span></button>
      <button type="button" onClick={() => setParams(p => { p.delete("view"); p.set("filter", "print"); return p; })}><Printer size={20} aria-hidden /><span>미인쇄 영수증<strong>{unprinted}<small>건</small></strong></span></button>
      <button type="button" onClick={() => setParams(p => { p.set("view", "bank"); p.set("filter", "missing"); return p; })}><FileSearch size={20} aria-hidden /><span>영수증 미접수 거래<strong>{missing}<small>건</small></strong></span></button>
    </div>}
    <div className={`desk-controls${tab === "calendar" ? " calendar-controls" : ""}`}><nav className="desk-tabs" aria-label="회계 장부 보기">
      <button type="button" aria-current={tab === "receipts" ? "page" : undefined} onClick={() => go("receipts")}><ReceiptText size={17} aria-hidden /> 영수증 접수함</button>
      <button type="button" aria-current={tab === "bank" ? "page" : undefined} onClick={() => go("bank")}><ArrowLeftRight size={17} aria-hidden /> 계좌 입출금</button>
      <button type="button" aria-current={tab === "calendar" ? "page" : undefined} onClick={() => go("calendar")}><CalendarDays size={17} aria-hidden /> 지출 캘린더</button>
    </nav><div className="row-actions">{tab !== "calendar" && <div className="period-picker" role="group" aria-label="조회 기간">
      <select aria-label="조회 연도" name="year" value={year} onChange={e => setPeriod(e.target.value, month.slice(5))}>
        <option value="">전체 기간</option>{years.map(y => <option value={y} key={y}>{y}년</option>)}
      </select>
      <select aria-label="조회 월" name="month" value={month.slice(5)} disabled={!year} onChange={e => setPeriod(year, e.target.value)}>
        <option value="">전체 월</option>{Array.from({ length: 12 }, (_, i) => <option key={i} value={String(i + 1).padStart(2, "0")}>{i + 1}월</option>)}
      </select>
    </div>}
    {!demo && <button className="office-button" type="button" disabled={busy} onClick={() => void act(async () => setLedger(await adminApi<Ledger>(token, "/ledger")), "최신 내역을 불러왔어요.")}><RefreshCw size={15} aria-hidden /> 새로고침</button>}</div></div>
    {notice && <p className="office-notice" role="status">{notice}</p>}
    {error && !match && !open && <p className="office-error" role="alert">{error}</p>}
    {tab === "calendar" ? <SpendingCalendar receipts={ledger.receipts} monthParam={params.get("calendar")} dayParam={params.get("day")} navigate={navigateCalendar} openReceipt={openReceipt} /> : tab === "receipts" ? <section className="desk-panel" aria-labelledby="receipts-heading">
      <div className="section-top panel-top"><div><h2 id="receipts-heading">접수된 영수증</h2><p>지출일이 최근인 영수증부터 보여요. 확인과 인쇄는 따로 표시해요.</p></div><Filter value={filter} onChange={filterTo} options={[["all", "전체"], ["check", "확인 전"], ["print", "미인쇄"]]} /></div>
      {receiptRows.length ? receiptRows.map((r, i) => <div key={r.id} className="date-record">
        {r.spent_on !== receiptRows[i-1]?.spent_on && <h3 className="date-heading">{dayLabel(r.spent_on)}</h3>}
        <div className="ledger-row"><div className="record-title"><span className="record-icon"><ReceiptText size={18} aria-hidden /></span><div><strong>{r.description}</strong><small>{r.submitter} · 접수 번호 {r.id.slice(0, 8).toUpperCase()}</small></div></div><strong className="record-money">{won(r.amount)}</strong>
          <div className="row-actions"><label className="office-check"><input type="checkbox" checked={!!r.checked_at} disabled={busy} onChange={e => void flag(r, "checked_at", e.target.checked)} /> 확인 완료</label><label className="office-check"><input type="checkbox" checked={!!r.printed_at} disabled={busy} onChange={e => void flag(r, "printed_at", e.target.checked)} /> 인쇄 완료</label><button className="office-button" type="button" aria-label={`${r.description} 상세 보기`} onClick={() => openReceipt(r.id)}>상세 보기</button></div>
        </div></div>) : <Empty icon="receipt" title={monthReceipts.length ? "조건에 맞는 영수증이 없어요" : "접수된 영수증이 없어요"} body="제출된 영수증은 이곳에서 확인할 수 있어요." />}
    </section> : <div className="bank-layout"><section className="desk-panel" aria-labelledby="bank-heading">
      <div className="section-top panel-top"><div><h2 id="bank-heading">계좌 입출금 내역</h2><p>같은 금액의 영수증을 직접 연결해 거래와 대조해요.</p></div><Filter value={filter} onChange={filterTo} options={[["all", "전체"], ["missing", "미접수"], ["linked", "연결됨"], ["exempt", "불필요"]]} /></div>
      {transactionRows.length ? transactionRows.map((t, i) => <div key={t.id} className="date-record">
        {t.booked_on !== transactionRows[i-1]?.booked_on && <h3 className="date-heading">{dayLabel(t.booked_on)}</h3>}
        <div className="ledger-row transaction-row"><div className="record-title"><span className={`record-icon ${t.direction === "out" ? "out" : ""}`}><ArrowDownLeft size={18} aria-hidden /></span><div><strong>{t.description}</strong><small>{t.direction === "in" ? "입금" : "출금"}</small></div></div><strong className="record-money">{t.direction === "in" ? "+" : "−"}{won(t.amount)}</strong>
          <div className="row-actions"><span className={`state-pill ${t.receipt_id ? "linked" : t.exempt ? "neutral" : "waiting"}`}>{t.receipt_id ? "연결됨" : t.exempt ? "영수증 불필요" : "미접수"}</span><button className="office-button" type="button" aria-label={`${t.description} 영수증 대조`} onClick={() => { setMatch(t.id); setError(""); }}>대조</button></div>
        </div></div>) : <Empty icon="bank" title={monthTransactions.length ? "조건에 맞는 거래가 없어요" : "등록된 거래가 없어요"} body="입출금 내역을 추가하면 영수증과 대조할 수 있어요." />}
    </section><section className="desk-panel transaction-form" aria-labelledby="transaction-heading"><h2 id="transaction-heading">거래 추가</h2><p>은행 거래 내역을 보고 직접 입력해 주세요.</p>
      <form onSubmit={add} autoComplete="off"><fieldset className="field-grid" disabled={busy}>
        <label>거래일 <b>*</b><input type="date" name="booked_on" defaultValue={today()} required /></label>
        <label>구분 <b>*</b><select name="direction" defaultValue="out"><option value="out">출금</option><option value="in">입금</option></select></label>
        <label>거래 내용 <b>*</b><input name="description" maxLength={100} required placeholder="예: 교재비 환급" /></label>
        <label>금액 <b>*</b><span className="amount-input"><input name="amount" type="number" step={1} inputMode="numeric" min={1} max={100000000000} required placeholder="0" /><span>원</span></span></label>
      </fieldset><button className="office-button primary send" disabled={busy}>거래 저장 <Check size={18} aria-hidden /></button></form>
    </section></div>}
    {receipt && <ReceiptView key={receipt.id} row={receipt} demo={demo} token={token} busy={busy} error={error} close={() => { setOpen(null); setError(""); }} onPrintFlag={value => void flag(receipt, "printed_at", value)} />}
    {transaction && <MatchView key={transaction.id} row={transaction} linked={transaction.receipt_id ? receiptById.get(transaction.receipt_id) : undefined} options={ledger.receipts.filter(r => r.amount === transaction.amount && !linkedIds.has(r.id))} error={error} busy={busy} close={() => { setMatch(null); setError(""); }} save={(mode, id) => void connect(transaction, mode, id)} see={id => { setMatch(null); setOpen(id); }} />}
  </main>;
}

function Filter({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return <div className="chips" role="group" aria-label="상태별 보기">{options.map(([id, label]) => <button type="button" key={id} aria-pressed={value === id} onClick={() => onChange(id)}>{label}</button>)}</div>;
}

function Empty({ icon, title, body }: { icon: "receipt" | "bank"; title: string; body: string }) {
  return <div className="empty-state">{icon === "receipt" ? <ReceiptText size={28} aria-hidden /> : <ArrowLeftRight size={28} aria-hidden />}<h3>{title}</h3><p>{body}</p></div>;
}

function ReceiptView({ row, demo, token, busy, error, close, onPrintFlag }: { row: Receipt; demo: boolean; token: string; busy: boolean; error: string; close: () => void; onPrintFlag: (v: boolean) => void }) {
  const [detail, setDetail] = useState<ReceiptDetail | null>(demo ? { bank: "예시 은행", holder: "예시 예금주", account: "000-0000-0000", photo: demoPhoto } : null);
  const [failure, setFailure] = useState("");
  const [loaded, setLoaded] = useState(false);
  const printImage = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (demo) return;
    let ignore = false;
    void adminApi<ReceiptDetail>(token, `/receipts/${row.id}`).then(d => { if (!ignore) setDetail(d); }, e => { if (!ignore) setFailure(e.message); });
    return () => { ignore = true; };
  }, [demo, row.id, token]);
  return <>
    <DetailDrawer open onClose={close} title={row.description} subtitle={`${dayLabel(row.spent_on)} · ${row.submitter}`} footer={<div className="receipt-footer"><p>인쇄한 뒤 완료를 직접 표시해 주세요.</p><div className="row-actions"><button type="button" className="office-button primary" disabled={!loaded} onClick={async () => { try { await printImage.current?.decode(); window.print(); } catch { setFailure("인쇄할 사진을 불러오지 못했어요."); } }}><Printer size={17} aria-hidden /> 영수증 인쇄</button><label className="office-check"><input type="checkbox" disabled={busy} checked={!!row.printed_at} onChange={e => onPrintFlag(e.target.checked)} /> 인쇄 완료</label></div></div>}>
      <div className="receipt-detail-state">
        {(error || failure) && <p className="office-error" role="alert">{error || failure}</p>}
        <dl className="detail-grid"><dt>지출 금액</dt><dd>{won(row.amount)}</dd><dt>접수 번호</dt><dd>{row.id.slice(0, 8).toUpperCase()}</dd><dt>환급 계좌</dt><dd>{detail ? detail.account ? `${detail.bank} ${detail.account} (${detail.holder})` : "환급 요청 없음" : "—"}</dd><dt>확인</dt><dd>{row.checked_at ? stamp(row.checked_at) : "확인 전"}</dd><dt>인쇄</dt><dd>{row.printed_at ? stamp(row.printed_at) : "미인쇄"}</dd></dl>
        {detail ? <img className="receipt-photo" src={detail.photo} width={480} height={440} alt="첨부된 영수증" onLoad={() => setLoaded(true)} onError={() => setFailure("영수증 사진을 열 수 없어요.")} /> : !failure && <p role="status">영수증을 불러오는 중…</p>}
      </div>
    </DetailDrawer>
    {detail && <article className="print-sheet" aria-hidden="true"><h1>{demo ? "예시 영수증" : "교회 지출 영수증"}</h1><p>{dayLabel(row.spent_on)} · {row.description} · {won(row.amount)}</p><img ref={printImage} src={detail.photo} width={480} height={440} alt="영수증 인쇄본" /></article>}
  </>;
}

function MatchView({ row, linked, options, error, busy, close, save, see }: { row: Transaction; linked?: Receipt; options: Receipt[]; error: string; busy: boolean; close: () => void; save: (mode: Mode, id?: string) => void; see: (id: string) => void }) {
  return <DetailDrawer open onClose={close} title="영수증 대조" subtitle={`${row.description} · ${dayLabel(row.booked_on)} · ${won(row.amount)}`}>
    <div className="match-drawer">
      {error && <p className="office-error" role="alert">{error}</p>}
      {linked ? <div className="match-card"><h3>연결된 영수증</h3><p>{linked.description} · {linked.submitter}</p><div className="row-actions"><button className="office-button primary" type="button" onClick={() => see(linked.id)}>영수증 보기</button><button className="office-button" type="button" disabled={busy} onClick={() => save("pending")}>연결 해제</button></div></div>
        : <><h3>같은 금액의 미연결 영수증</h3><p>날짜와 제출자를 확인한 뒤 연결해 주세요. 지출일과 실제 입출금일은 다를 수 있어요.</p>
        {options.length ? <form className="select-line" onSubmit={e => { e.preventDefault(); save("link", String(new FormData(e.currentTarget).get("receipt_id"))); }}><label>연결할 영수증<select defaultValue="" name="receipt_id" required><option value="" disabled>영수증 선택</option>{options.map(r => <option key={r.id} value={r.id}>{r.spent_on} · {r.description} · {r.submitter} · {r.id.slice(0, 8).toUpperCase()}</option>)}</select></label><button className="office-button primary" disabled={busy}>영수증 연결</button></form> : <p className="match-card">아직 연결할 수 있는 영수증이 없어요.</p>}
        <button className="office-button" type="button" disabled={busy} onClick={() => save(row.exempt ? "pending" : "exempt")}>{row.exempt ? "영수증 필요로 되돌리기" : "영수증 불필요로 표시"}</button></>}
    </div>
  </DetailDrawer>;
}
