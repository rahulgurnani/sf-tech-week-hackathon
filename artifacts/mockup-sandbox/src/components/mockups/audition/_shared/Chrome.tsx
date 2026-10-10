import React from "react";
import { Activity, Archive, ClipboardCheck, HelpCircle, Settings2, Users } from "lucide-react";

type Props = { active: "room" | "report"; children: React.ReactNode; crumb: string };
export function Chrome({ active, children, crumb }: Props) {
  return <div className="audition">
    <div style={{display:"flex",minHeight:"100dvh"}}>
      <aside className="side">
        <div className="brand"><span className="brand-mark"/><span>audition<small>fair skill signals</small></span></div>
        <div className="side-label">{active === "room" ? "Your audition" : "Workspace"}</div>
        {active === "report" && <div className="nav-item"><Users/><span>Talent</span></div>}
        <div className={`nav-item ${active === "room" ? "active" : ""}`}><Activity/><span>Auditions</span></div>
        {active === "report" && <>
          <div className="nav-item active"><ClipboardCheck/><span>Reviews</span></div>
          <div className="nav-item"><Archive/><span>Talent pool</span></div>
          <div className="side-label">Manage</div>
          <div className="nav-item"><Settings2/><span>Settings</span></div>
        </>}
        <div className="side-bottom">
          <div className="nav-item"><HelpCircle/><span>Help & guidance</span></div>
          <div className="side-user"><div className="avatar">{active === "room" ? "AM" : "JL"}</div><div><b>{active === "room" ? "Alex Morgan" : "Jordan Lee"}</b><span>{active === "room" ? "Candidate" : "Hiring team"}</span></div></div>
        </div>
      </aside>
      <main className="workspace">
        <header className="topline"><div className="crumb">Auditions <span>/</span> <strong>{crumb}</strong></div>
          <div className="top-actions"><span>Northstar</span><div className="avatar" style={{width:28,height:28}}>{active === "room" ? "AM" : "JL"}</div></div>
        </header>
        {children}
      </main>
    </div>
  </div>;
}
