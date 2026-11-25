import { CircleCheck, ImagePlus, LockKeyhole } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { OfficeHeader } from "../components/OfficeHeader";
import { api } from "../lib/api";
import { today } from "../ledger";
import "../office.css";

async function receiptPhoto(file: File) {
  if (file.size > 20 * 1024 * 1024) throw new Error("20MB 이하의 사진을 선택해 주세요.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode().catch(() => { throw new Error("사진을 열 수 없어요. JPG, PNG 또는 WebP 사진을 선택해 주세요."); });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx || !image.naturalWidth || !image.naturalHeight) throw new Error("사진을 열 수 없어요. 다른 사진을 선택해 주세요.");
    for (const max of [2400, 1800, 1300, 950]) {
      const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const result = canvas.toDataURL("image/jpeg", .83);
      if (result.startsWith("data:image/jpeg;base64,") && result.length <= 1_000_000) return result;
    }
    throw new Error("사진을 줄일 수 없어요. 다른 사진을 선택해 주세요.");
  } finally { URL.revokeObjectURL(url); }
}

export default function Home() {
  const [refund, setRefund] = useState(false);
  const [photo, setPhoto] = useState<{ src: string; name: string } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const photoRequest = useRef(0);
  const photoInput = useRef<HTMLInputElement>(null);
  const [dirty, setDirty] = useState(false);
  const [state, setState] = useState<{ busy?: boolean; code?: string; error?: string; photoError?: string }>({});
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function choosePhoto(file: File) {
    const request = ++photoRequest.current;
    setDirty(true); setPreparing(true); setState({});
    try {
      const src = await receiptPhoto(file);
      if (request === photoRequest.current) setPhoto({ src, name: file.name });
    } catch (err) {
      if (request === photoRequest.current) setState({ photoError: `${(err as Error).message}${photo ? " 기존 사진은 그대로 남아 있어요." : ""}` });
    } finally { if (request === photoRequest.current) setPreparing(false); }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (preparing || state.busy) return;
    if (!photo) { setState({ photoError: "영수증 사진을 선택해 주세요." }); photoInput.current?.focus(); return; }
    const raw = Object.fromEntries(new FormData(e.currentTarget));
    setState({ busy: true });
    try {
      const { code } = await api<{ code: string }>("/api/receipts", { method: "POST", body: JSON.stringify({ ...raw, amount: Number(raw.amount), photo: photo.src }) });
      setState({ code }); setDirty(false); setPhoto(null);
    } catch (err) { setState({ error: (err as Error).message }); }
  }

  return <div className="office"><OfficeHeader />
    <main className="office-width public-layout" id="office-main" tabIndex={-1}>
      {state.code ? <section className="paper-form success-state" aria-labelledby="success-heading">
        <CircleCheck size={44} aria-hidden /><h1 id="success-heading">영수증을 접수했어요</h1><p>회계 담당자가 제출 내용을 확인할 거예요.</p>
        <div className="reference" role="status">접수 번호 <strong translate="no">{state.code}</strong></div>
        <button type="button" className="office-button primary" onClick={() => { setState({}); setRefund(false); }}>다른 영수증 보내기</button>
      </section> : <section className="paper-form" aria-labelledby="form-heading">
        <header className="form-heading"><h1 id="form-heading">영수증 제출</h1><p>영수증을 한 장씩 첨부하고 지출 정보를 적어 주세요.</p></header>
        <form onSubmit={submit} onChange={() => setDirty(true)} autoComplete="off" aria-busy={state.busy || preparing}>
          <fieldset className="photo-field" disabled={state.busy}>
            <legend className="field-title">영수증 사진 <b>*</b></legend>
            <label className={`upload-box${photo ? " has-photo" : ""}`} htmlFor="receipt-photo">
              {photo ? <img className="upload-thumbnail" alt="" src={photo.src} width={60} height={64} /> : <span className="upload-icon"><ImagePlus size={23} aria-hidden /></span>}
              <span className="upload-copy"><strong>{preparing ? "사진을 확인하는 중…" : photo ? "사진을 첨부했어요" : "사진 첨부하기"}</strong>
                <small id="photo-help">{photo ? photo.name : "JPG, PNG, WebP · 최대 20MB"}</small></span>
              {photo && <span className="upload-change">사진 바꾸기</span>}
              <input ref={photoInput} id="receipt-photo" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label={photo ? "영수증 사진 바꾸기" : "영수증 사진 첨부"} aria-describedby={state.photoError ? "photo-help photo-error" : "photo-help"} aria-invalid={!!state.photoError && !photo} onChange={e => {
                const file = e.currentTarget.files?.[0]; e.currentTarget.value = "";
                if (file) void choosePhoto(file);
              }} />
            </label>
            <span className="sr-only" role="status">{preparing ? "사진 확인 중" : photo ? `${photo.name} 첨부 완료` : ""}</span>
            {state.photoError && <p className="office-error" id="photo-error" role="alert">{state.photoError}</p>}
          </fieldset>
          <fieldset className="field-grid public-fields" disabled={state.busy}>
            <legend className="sr-only">지출 정보</legend>
            <label>제출자 이름 <b>*</b><input name="submitter" autoComplete="name" required maxLength={40} placeholder="예: 김민지" /></label>
            <label>지출일 <b>*</b><input name="spent_on" type="date" defaultValue={today()} required /></label>
            <label>사용처·지출 내용 <b>*</b><input name="description" required maxLength={100} placeholder="예: 주일학교 교재 구입" /></label>
            <label>지출 금액 <b>*</b><span className="amount-input"><input name="amount" type="number" inputMode="numeric" min={1} max={100000000000} step={1} required placeholder="0" /><span>원</span></span></label>
          </fieldset>
          <fieldset className="refund" disabled={state.busy}>
            <legend className="sr-only">환급 계좌</legend>
            <label className="refund-toggle"><span><strong>환급이 필요해요</strong><small>받을 계좌를 알려주세요.</small></span><input type="checkbox" role="switch" checked={refund} aria-controls="refund-fields" onChange={e => setRefund(e.target.checked)} /></label>
            <div className="field-grid bank-grid" id="refund-fields" hidden={!refund}>
              {refund && <><label>은행 <b>*</b><input name="bank" required maxLength={30} placeholder="예: 국민은행" /></label>
              <label>계좌번호 <b>*</b><input name="account" required maxLength={36} pattern="[0-9 \-]{4,36}" inputMode="numeric" placeholder="숫자와 하이픈" /></label>
              <label>예금주 <b>*</b><input name="holder" required maxLength={40} placeholder="예: 김민지" /></label></>}
            </div>
          </fieldset>
          {state.error && <p className="office-error" role="alert">{state.error}</p>}
          <button type="submit" className="office-button primary send" disabled={state.busy || preparing}>{state.busy ? "보내는 중…" : "영수증 보내기"}</button>
          <p className="private-note"><LockKeyhole size={14} aria-hidden /> 영수증과 계좌 정보는 회계 담당자만 볼 수 있어요.</p>
        </form>
      </section>}
    </main>
  </div>;
}
