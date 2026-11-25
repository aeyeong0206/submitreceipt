import { BookOpen, ChevronRight, ReceiptText } from "lucide-react";
import { Link } from "react-router";
import { content } from "../content";

export function OfficeHeader({ admin = false }: { admin?: boolean }) {
  return <>
    <a className="office-skip" href="#office-main">본문으로 건너뛰기</a>
    <header className="office-header"><div className="office-width head-row">
      <Link className="brand" to="/"><span className="brand-icon"><BookOpen size={17} aria-hidden /></span>{content.title}</Link>
      <Link className="header-link" to={admin ? "/" : "/admin"}>{admin ? <ReceiptText size={16} aria-hidden /> : null}{admin ? "영수증 접수" : "회계 담당자"}{admin ? null : <ChevronRight size={16} aria-hidden />}</Link>
    </div></header>
  </>;
}
