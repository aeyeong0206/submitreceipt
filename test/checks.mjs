export const uiOnAll = true;
export const pages = ["/admin"];
export const expectedStatuses = [];

export async function api({ call, assert, owner }) {
  let n = 0;
  const ok = (value, message) => { assert(value, message); n++; };
  ok((await call("/api/admin/ledger")).status === 404, "ledger is private");
  ok((await call("/api/receipts")).status === 404, "no public receipt list");
  ok((await call("/api/receipts", { method: "POST", body: "{}" })).status === 400, "incomplete submission rejected");
  const result = await call("/api/admin/ledger", { headers: owner });
  ok(result.status === 200 && Array.isArray(result.body.receipts) && Array.isArray(result.body.transactions), "owner can load ledger");
  return n;
}

export async function ui({ page, shot, admin, viewport, base }) {
  const description = `검증용 교재비 ${viewport}`;
  const images = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 420; canvas.height = 360;
    const ctx = canvas.getContext("2d"); ctx.fillStyle = "white"; ctx.fillRect(0, 0, 420, 360);
    ctx.fillStyle = "black"; ctx.font = "24px sans-serif"; ctx.fillText("TEST RECEIPT", 25, 60);
    const first = canvas.toDataURL().split(",")[1];
    ctx.fillStyle = "#1464df"; ctx.fillRect(25, 80, 200, 15);
    return [first, canvas.toDataURL().split(",")[1]];
  });
  await page.getByLabel("제출자 이름").fill("검증용 제출자");
  await page.getByLabel("사용처·지출 내용").fill(description);
  const amount = String(45000 + Math.floor(Math.random() * 9000));
  const month = (await page.locator('[name="spent_on"]').inputValue()).slice(0, 7);
  const date = `${month}-${({ desktop: "11", iphone16pro: "12", iphonese: "13" })[viewport] ?? "14"}`;
  await page.getByLabel("지출일").fill(date);
  await page.getByLabel("지출 금액").fill(amount);
  if (await page.getByLabel("계좌번호").isVisible()) throw new Error("Refund fields should start collapsed");
  await page.getByRole("switch", { name: /환급이 필요해요/ }).click();
  await page.getByLabel("은행", { exact: false }).fill("검증용 은행");
  await page.getByLabel("계좌번호").fill("123-4567-8901");
  await page.getByLabel("예금주").fill("검증용 예금주");
  const upload = (name, image) => page.locator("#receipt-photo").setInputFiles({ name, mimeType: "image/png", buffer: Buffer.from(image, "base64") });
  await upload("receipt.png", images[0]);
  await page.getByText("receipt.png", { exact: true }).waitFor();
  const original = await page.locator(".upload-thumbnail").getAttribute("src");
  await upload("receipt-new.png", images[1]);
  await page.getByText("receipt-new.png", { exact: true }).waitFor();
  if (original === await page.locator(".upload-thumbnail").getAttribute("src")) throw new Error("Replacing a photo must update the preview");
  await page.getByRole("button", { name: "영수증 보내기" }).click();
  await page.getByRole("heading", { name: "영수증을 접수했어요" }).waitFor();

  await page.goto(`${base}/admin`);
  const unlock = async () => {
    await page.getByLabel("회계 비밀번호").fill(admin);
    await page.getByRole("button", { name: "회계 장부 열기" }).click();
    await page.getByRole("heading", { name: "교회 회계 장부" }).waitFor();
  };
  await unlock();
  const row = page.locator(".ledger-row").filter({ hasText: description });
  await row.getByRole("checkbox", { name: "확인 완료" }).click();
  await page.getByRole("status").filter({ hasText: "확인 완료로 표시했어요." }).waitFor();
  await row.getByRole("button", { name: `${description} 상세 보기` }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("검증용 은행 123-4567-8901 (검증용 예금주)").waitFor();
  await page.evaluate(() => { window.print = () => { window.__printed = true; }; });
  await dialog.getByRole("button", { name: "영수증 인쇄" }).click();
  await page.waitForFunction(() => window.__printed === true);
  if (await dialog.getByRole("checkbox", { name: "인쇄 완료" }).isChecked()) throw new Error("Printing must not automatically set completion");
  await page.emulateMedia({ media: "print" });
  if (!(await page.locator(".print-sheet").isVisible()) || await dialog.isVisible()) throw new Error("Print displays only the receipt sheet");
  await page.emulateMedia({ media: "screen" });
  await dialog.getByRole("checkbox", { name: "인쇄 완료" }).click();
  await page.getByRole("status").filter({ hasText: "인쇄 완료로 표시했어요." }).waitFor();
  await page.keyboard.press("Escape");
  await shot("admin-receipts");

  await page.getByRole("button", { name: "계좌 입출금", exact: true }).click();
  const note = `검증 거래 ${viewport}`;
  await page.getByLabel("거래 내용").fill(note);
  await page.getByLabel("금액", { exact: false }).fill(amount);
  await page.getByRole("button", { name: "거래 저장" }).click();
  const tx = page.locator(".transaction-row").filter({ hasText: note });
  await tx.getByText("미접수").waitFor();
  await tx.getByRole("button", { name: `${note} 영수증 대조` }).click();
  const option = dialog.getByRole("option", { name: new RegExp(description) });
  await dialog.getByLabel("연결할 영수증").selectOption(await option.getAttribute("value"));
  await dialog.getByRole("button", { name: "영수증 연결" }).click();
  await tx.getByText("연결됨").waitFor();
  await shot("admin-transactions");

  await page.reload(); await unlock();
  await tx.getByText("연결됨").waitFor();
  await page.getByRole("button", { name: "영수증 접수함", exact: true }).click();
  if (!(await row.getByRole("checkbox", { name: "확인 완료" }).isChecked()) || !(await row.getByRole("checkbox", { name: "인쇄 완료" }).isChecked())) throw new Error("Completion flags must persist after reload");
  await page.getByRole("button", { name: "지출 캘린더", exact: true }).click();
  const amountLabel = new Intl.NumberFormat("ko-KR").format(Number(amount)) + "원";
  const day = page.getByRole("button", { name: new RegExp(` ${Number(date.slice(-2))}일.*지출 ${amountLabel}, 영수증 1건`) });
  await day.click();
  await page.locator(".day-overview").getByText(amountLabel).waitFor();
  const calendarReceipt = page.getByRole("button", { name: new RegExp(description) });
  await calendarReceipt.click();
  await dialog.getByText(amountLabel).waitFor();
  await dialog.getByText(/검증용 제출자/).waitFor();
  await dialog.getByRole("img", { name: "첨부된 영수증" }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "이전 달" }).click();
  await page.getByText("등록된 지출이 없어요.").waitFor();
  await page.getByRole("button", { name: "다음 달" }).click();
  await day.click();
  await day.and(page.locator('[aria-pressed="true"]')).waitFor();
  await shot("admin-calendar");
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error("Unexpected horizontal overflow");
}
