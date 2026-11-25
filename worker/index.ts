import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { bad, clean, ownerOnly, rateLimited, type Bindings } from "./lib";

const app = new Hono<{ Bindings: Bindings }>().basePath("/api");
const date = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !v.startsWith("0000") && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const money = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0 && v <= 100_000_000_000;
const idFormat = /^[a-f0-9-]{36}$/;
const photoPrefix = "data:image/jpeg;base64,";

app.use("*", async (c, next) => {
  await next();
  c.header("cache-control", "no-store");
  c.header("x-robots-tag", "noindex");
  c.header("x-content-type-options", "nosniff");
});

app.get("/health", c => c.json({ ok: true }));

app.post("/receipts", bodyLimit({ maxSize: 1_010_000, onError: c => c.json({ error: "사진이 너무 커요. 다른 사진을 선택해 주세요." }, 413) }), async c => {
  const b = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!b || typeof b !== "object") return bad(c, "접수 내용을 다시 확인해 주세요.");
  const { spent_on, amount, photo } = b;
  const submitter = clean(b.submitter, 40), description = clean(b.description, 100);
  const bank = clean(b.bank, 30), account = clean(b.account, 36), holder = clean(b.holder, 40);
  if (!date(spent_on) || !money(amount) || !submitter || !description) return bad(c, "이름, 지출일, 사용처와 금액을 확인해 주세요.");
  if ((bank || account || holder) && (!bank || !holder || !/^[0-9 -]{4,36}$/.test(account) || account.replace(/\D/g, "").length < 4)) return bad(c, "은행, 계좌번호와 예금주를 모두 확인해 주세요.");
  if (typeof photo !== "string" || photo.length > 1_000_000 || !photo.startsWith(photoPrefix + "/9j/") || !/^[A-Za-z0-9+/]+={0,2}$/.test(photo.slice(photoPrefix.length))) return bad(c, "영수증 사진을 다시 첨부해 주세요.");
  if (await rateLimited(c, "receipt", 20, 600)) return bad(c, "잠시 뒤 다시 보내 주세요.", 429);
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO receipts (id, spent_on, submitter, description, amount, bank, account, holder, photo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, spent_on, submitter, description, amount, bank, account, holder, photo).run();
  return c.json({ code: id.slice(0, 8).toUpperCase() }, 201);
});

app.use("/admin/*", ownerOnly);
app.use("/admin/*", bodyLimit({ maxSize: 8_192, onError: c => c.json({ error: "입력 내용이 너무 길어요." }, 413) }));

app.get("/admin/ledger", async c => {
  const [receipts, transactions] = await Promise.all([
    c.env.DB.prepare("SELECT id, spent_on, submitter, description, amount, checked_at, printed_at FROM receipts ORDER BY spent_on DESC, created_at DESC, id DESC").all(),
    c.env.DB.prepare("SELECT id, booked_on, direction, description, amount, receipt_id, exempt FROM transactions ORDER BY booked_on DESC, created_at DESC, id DESC").all(),
  ]);
  return c.json({ receipts: receipts.results, transactions: transactions.results });
});

app.get("/admin/receipts/:id", async c => {
  const row = await c.env.DB.prepare("SELECT bank, account, holder, photo FROM receipts WHERE id = ?").bind(c.req.param("id")).first();
  return row ? c.json(row) : bad(c, "영수증을 찾을 수 없어요.", 404);
});

app.patch("/admin/receipts/:id", async c => {
  const b = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!b || typeof b.value !== "boolean" || (b.field !== "checked_at" && b.field !== "printed_at")) return bad(c, "바꿀 상태를 확인해 주세요.");
  const stamp = b.value ? new Date().toISOString() : null;
  const query = b.field === "checked_at" ? "UPDATE receipts SET checked_at = ? WHERE id = ?" : "UPDATE receipts SET printed_at = ? WHERE id = ?";
  const result = await c.env.DB.prepare(query).bind(stamp, c.req.param("id")).run();
  return result.meta.changes ? c.json({ stamp }) : bad(c, "영수증을 찾을 수 없어요.", 404);
});

app.post("/admin/transactions", async c => {
  const b = await c.req.json<Record<string, unknown>>().catch(() => null);
  const description = clean(b?.description, 100);
  if (!b || !date(b.booked_on) || !money(b.amount) || !description || (b.direction !== "in" && b.direction !== "out")) return bad(c, "거래일, 구분, 내용과 금액을 확인해 주세요.");
  const row = { id: crypto.randomUUID(), booked_on: b.booked_on, direction: b.direction, description, amount: b.amount, receipt_id: null, exempt: 0 };
  await c.env.DB.prepare("INSERT INTO transactions (id, booked_on, direction, description, amount) VALUES (?, ?, ?, ?, ?)")
    .bind(row.id, row.booked_on, row.direction, row.description, row.amount).run();
  return c.json(row, 201);
});

app.patch("/admin/transactions/:id", async c => {
  const b = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!b || (b.mode !== "link" && b.mode !== "pending" && b.mode !== "exempt")) return bad(c, "대조 상태를 확인해 주세요.");
  const id = c.req.param("id");
  const receiptId = b.mode === "link" ? clean(b.receipt_id, 40) : null;
  if (b.mode === "link" && (!receiptId || !idFormat.test(receiptId))) return bad(c, "연결할 영수증을 선택해 주세요.");
  const exempt = b.mode === "exempt" ? 1 : 0;
  const result = await c.env.DB.prepare(`UPDATE OR IGNORE transactions SET receipt_id = ?1, exempt = ?2 WHERE id = ?3 AND
    (?1 IS NULL OR EXISTS (SELECT 1 FROM receipts WHERE id = ?1 AND amount = transactions.amount))`)
    .bind(receiptId, exempt, id).run();
  return result.meta.changes ? c.json({ receipt_id: receiptId, exempt }) : bad(c, "금액이 다르거나 이미 다른 거래에 연결된 영수증이에요. 목록을 새로고침해 주세요.", 409);
});

app.notFound(c => c.json({ error: "페이지를 찾을 수 없어요." }, 404));
app.onError((_, c) => {
  console.error(`[api] ${c.req.method} 요청 처리 실패`);
  return c.json({ error: "잠시 뒤 다시 시도해 주세요." }, 500);
});

export default app;
