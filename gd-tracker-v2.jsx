import { useState, useRef, useCallback, useEffect } from "react";

// ── DESIGN TOKENS ──────────────────────────────────────────────
const T = {
  primary:"#0857C3", primaryDark:"#064299", primaryLight:"#DBEAFE", primaryText:"#1E3A8A",
  secondary:"#1D6FBB", secondaryLight:"#EFF6FF",
  highlight:"#0E7490", highlightLight:"#CFFAFE",
  white:"#FFFFFF",
  gray50:"#F8FAFC", gray100:"#F1F5F9", gray200:"#E2E8F0", gray300:"#CBD5E1",
  gray400:"#94A3B8", gray500:"#64748B", gray600:"#475569", gray700:"#334155",
  gray800:"#1E293B", gray900:"#0F172A",
  green50:"#F0FDF4", green100:"#DCFCE7", green600:"#16A34A", green700:"#15803D",
  red50:"#FEF2F2",   red100:"#FEE2E2",   red600:"#DC2626",  red700:"#B91C1C",
  amber50:"#FFFBEB", amber100:"#FEF3C7", amber600:"#D97706", amber700:"#B45309",
  orange50:"#FFF7ED",orange600:"#EA580C",
  purple50:"#F5F3FF",purple600:"#9333EA", purple700:"#7C3AED",
  sidebarBg:"#064299", sidebarText:"#BFDBFE", sidebarSub:"#93C5FD",
};

// ── RBAC ──────────────────────────────────────────────────────
const ROLE_PAGES = {
  designer:  ["dashboard","my-tasks","board","profile","notifications","edit-profile"],
  lead:      ["dashboard","queue","board","team","task-list","reports","notifications","profile","edit-profile"],
  team_lead: ["dashboard","board","team","task-list","reports","notifications","profile","edit-profile"],
};
const PERMISSIONS = {
  approve_request:["lead"], reject_request:["lead"], assign_designer:["lead"],
  add_user:["lead"], remove_user:["lead"], edit_any_profile:["lead"],
  view_all_board:["lead","team_lead","designer"], view_reports:["lead","team_lead"],
  view_team:["lead","team_lead"],
  accept_task:["designer","lead"], update_task_status:["designer","lead"],
};
const can     = (role,action) => (PERMISSIONS[action]||[]).includes(role);
const allowed = (role,page)   => (ROLE_PAGES[role]||[]).includes(page);

// ── CONSTANTS ─────────────────────────────────────────────────
const STATUS_LABELS = {pending:"Pending",approved:"Approved",backlog:"Backlog",assigned:"Assigned",on_progress:"In Progress",on_review:"On Review",revision:"Revision",done:"Done",rejected:"Rejected",on_hold:"On Hold",canceled:"Canceled"};
const KANBAN_COLS   = ["backlog","assigned","on_progress","on_review","revision","on_hold","canceled","done"];
const PRIORITIES    = ["Low","Medium","High"];
const DESIGN_TYPES  = ["Illustration","Icon","Logo","Banner","Poster","Presentation","UI/UX","Motion","Other"];
const DEPARTMENTS   = ["Marketing","Product","Engineering","Sales","HR","Finance","Operations","Design","Other"];
const WORKLOADS     = [{label:"Light (1–5 pts)",value:"light",pts:[1,5]},{label:"Medium (6–15 pts)",value:"medium",pts:[6,15]},{label:"Heavy (10–20 pts)",value:"heavy",pts:[10,20]}];
const ALL_ROLES     = ["designer","lead","team_lead"];
const ROLE_LABELS   = {designer:"Designer",lead:"Stream Lead",team_lead:"Team Lead"};
const NO_POINT_STATUSES = ["on_hold","canceled","rejected"];

const STATUS_COLOR = {
  pending:    {bg:"#DBEAFE",text:"#1E3A8A",border:"#93C5FD",dot:"#3B82F6"},
  approved:   {bg:"#DCFCE7",text:"#14532D",border:"#86EFAC",dot:"#22C55E"},
  backlog:    {bg:"#E0F7FA",text:"#164E63",border:"#67E8F9",dot:"#06B6D4"},
  assigned:   {bg:"#EDE9FE",text:"#3B0764",border:"#C4B5FD",dot:"#8B5CF6"},
  on_progress:{bg:"#FEF9C3",text:"#713F12",border:"#FDE047",dot:"#EAB308"},
  on_review:  {bg:"#FFEDD5",text:"#7C2D12",border:"#FDBA74",dot:"#F97316"},
  revision:   {bg:"#FCE7F3",text:"#831843",border:"#F9A8D4",dot:"#EC4899"},
  done:       {bg:"#DCFCE7",text:"#14532D",border:"#86EFAC",dot:"#22C55E"},
  rejected:   {bg:"#FEE2E2",text:"#7F1D1D",border:"#FCA5A5",dot:"#EF4444"},
  on_hold:    {bg:"#F5F3FF",text:"#4C1D95",border:"#C4B5FD",dot:"#8B5CF6"},
  canceled:   {bg:"#F1F5F9",text:"#475569",border:"#CBD5E1",dot:"#94A3B8"},
};
const PRIORITY_COLOR = {
  Low:   {bg:"#DCFCE7",text:"#14532D",border:"#86EFAC",icon:"↓"},
  Medium:{bg:"#FEF9C3",text:"#713F12",border:"#FDE047",icon:"→"},
  High:  {bg:"#FEE2E2",text:"#7F1D1D",border:"#FCA5A5",icon:"↑"},
};

// ── HELPERS ───────────────────────────────────────────────────
let _seq=3;
const genReqId  = ()=>{_seq++;const d=new Date();const dd=String(d.getDate()).padStart(2,"0");const mm=String(d.getMonth()+1).padStart(2,"0");const yy=String(d.getFullYear()).slice(-2);return `GDR-${dd}${mm}${yy}-${String(_seq%10000).padStart(4,"0")}`;};
const genTaskId = (r,sfx)=>r.replace("GDR-","TSK-")+sfx;
const uid  = ()=>Math.random().toString(36).slice(2,10);
const now  = ()=>new Date().toISOString();
const fmtDate = s=>s?new Date(s).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}):"—";
const fmtTime = s=>s?new Date(s).toLocaleString("en-GB",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}):"—";
const inits = n=>(n||"?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
const COOLDOWN=30000; let lastSubmit=0;
const checkRate=()=>{const n=Date.now();if(n-lastSubmit<COOLDOWN)return`Please wait ${Math.ceil((COOLDOWN-(n-lastSubmit))/1000)}s.`;lastSubmit=n;return null;};

// Deadline helpers
const deadlineStatus=(deadline)=>{
  if(!deadline)return null;
  const now2=new Date(); now2.setHours(0,0,0,0);
  const dl=new Date(deadline); dl.setHours(0,0,0,0);
  const diff=Math.round((dl-now2)/(1000*60*60*24));
  if(diff<0)return{label:`${Math.abs(diff)}d overdue`,color:"#DC2626",bg:"#FEE2E2",border:"#FCA5A5"};
  if(diff===0)return{label:"Due today",color:"#B45309",bg:"#FFFBEB",border:"#FCD34D"};
  if(diff===1)return{label:"Due tomorrow",color:"#B45309",bg:"#FFFBEB",border:"#FCD34D"};
  if(diff<=3)return{label:`${diff}d left`,color:"#B45309",bg:"#FFFBEB",border:"#FCD34D"};
  if(diff<=7)return{label:`${diff}d left`,color:"#0E7490",bg:"#CFFAFE",border:"#67E8F9"};
  return null;
};

// ── SEED DATA ─────────────────────────────────────────────────
const r0=uid(),r1=uid(),r2=uid(),t0=uid(),t1=uid();
const mkU=(id,name,email,role,dept,phone,pts=0)=>({id,name,email,password:"pass",role,department:dept,phone,points:pts,bio:"",avatar_color:T.secondary,avatar_img:""});
const INIT_USERS=[
  mkU("u2","Jordan Lee","jordan@co.com","lead","Design","+62 877-2211-1173"),
  mkU("u6","Riley Chen","riley@co.com","team_lead","Design","+62 812-3456-7890"),
  mkU("u3","Sam Rivera","sam@co.com","designer","Design","+1 555 0103",48),
  mkU("u4","Chris Park","chris@co.com","designer","Design","+1 555 0104",32),
  mkU("u5","Dana Kim","dana@co.com","designer","Design","+1 555 0105",21),
];
const today=new Date().toISOString().split("T")[0];
const tomorrow=new Date(Date.now()+86400000).toISOString().split("T")[0];
const nextWeek=new Date(Date.now()+7*86400000).toISOString().split("T")[0];
const INIT_REQUESTS=[
  {id:r0,request_id:"GDR-140425-0001",applicant_name:"Alex Morgan",role_title:"Marketing Manager",department:"Marketing",email:"alex@co.com",phone:"+1 555 0101",product:"Brand Campaign Q2",title:"Q2 Campaign Banner Set",design_type:"Banner",description:"Need 5 banners for Q2 campaign. Must follow brand guidelines strictly.",guideline_link:"https://brand.company.com",priority:"High",workload:"medium",status:"on_review",deadline:tomorrow,created_at:now(),attachments:[],source:"public_form"},
  {id:r1,request_id:"GDR-140425-0002",applicant_name:"Dana Reyes",role_title:"Product Designer",department:"Product",email:"dana.r@co.com",phone:"+1 555 0200",product:"App Launch",title:"App Store Screenshots",design_type:"UI/UX",description:"Screenshots for App Store listing. 6 screens needed.",guideline_link:"",priority:"Medium",workload:"light",status:"assigned",deadline:nextWeek,created_at:now(),attachments:[],source:"public_form"},
  {id:r2,request_id:"GDR-140425-0003",applicant_name:"Marco Silva",role_title:"Brand Manager",department:"Marketing",email:"marco@co.com",phone:"+1 555 0303",product:"Rebrand 2025",title:"Company Logo Redesign",design_type:"Logo",description:"Full rebrand — new logo, color palette, typography.",guideline_link:"",priority:"High",workload:"heavy",status:"backlog",deadline:nextWeek,created_at:now(),attachments:[],source:"public_form"},
];
const INIT_TASKS=[
  {id:t0,task_id:"TSK-140425-0001-A",request_id:r0,designer_id:"u3",assigned_by:"u2",status:"on_review",points_awarded:0,accepted_at:now(),completed_at:null,created_at:now(),revision_count:1,files:[]},
  {id:t1,task_id:"TSK-140425-0002-A",request_id:r1,designer_id:"u4",assigned_by:"u2",status:"assigned",points_awarded:0,accepted_at:null,completed_at:null,created_at:now(),revision_count:0,files:[]},
];
const INIT_COMMENTS=[
  {id:uid(),task_id:t0,author_id:"u2",content:"Assigned to Sam. Check brand guidelines before starting.",type:"system",created_at:now()},
  {id:uid(),task_id:t0,author_id:"u3",content:"Started working on the banners. Using existing brand colors.",type:"note",created_at:now()},
  {id:uid(),task_id:t0,author_id:"u2",content:"Please adjust the font size on banner #3 — too small on mobile.",type:"revision",created_at:now()},
];
const INIT_ACTIVITY=[
  {id:uid(),request_id:r0,task_id:t0,actor_id:"u2",action:"approved",detail:"Request approved with Medium workload",created_at:now()},
  {id:uid(),request_id:r0,task_id:t0,actor_id:"u2",action:"assigned",detail:"Assigned to Sam Rivera",created_at:now()},
  {id:uid(),request_id:r0,task_id:t0,actor_id:"u3",action:"status_change",detail:"Status → In Progress",created_at:now()},
  {id:uid(),request_id:r0,task_id:t0,actor_id:"u3",action:"status_change",detail:"Status → On Review",created_at:now()},
  {id:uid(),request_id:r0,task_id:t0,actor_id:"u2",action:"revision",detail:"Revision requested: adjust font size",created_at:now()},
];
const INIT_NOTIFS=[
  {id:uid(),user_id:"u3",title:"New task assigned",body:"You have been assigned: Q2 Campaign Banner Set",type:"task",is_read:false,created_at:now()},
  {id:uid(),user_id:"u4",title:"New task assigned",body:"You have been assigned: App Store Screenshots",type:"task",is_read:false,created_at:now()},
  {id:uid(),user_id:"u3",title:"⏰ Deadline tomorrow",body:'"Q2 Campaign Banner Set" is due tomorrow',type:"deadline",is_read:false,created_at:now()},
];

// ── NAV ICONS ─────────────────────────────────────────────────
const Ico=({ch,size=18,stroke="white"})=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{ch}</svg>;
const IcoHome  =({s,c})=><Ico size={s} stroke={c} ch={<><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>}/>;
const IcoTasks =({s,c})=><Ico size={s} stroke={c} ch={<><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12l2 2 4-4"/></>}/>;
const IcoUser  =({s,c})=><Ico size={s} stroke={c} ch={<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>}/>;
const IcoBell  =({s,c})=><Ico size={s} stroke={c} ch={<><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>}/>;
const IcoInbox =({s,c})=><Ico size={s} stroke={c} ch={<><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/></>}/>;
const IcoBoard =({s,c})=><Ico size={s} stroke={c} ch={<><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></>}/>;
const IcoTeam  =({s,c})=><Ico size={s} stroke={c} ch={<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>}/>;
const IcoChart =({s,c})=><Ico size={s} stroke={c} ch={<><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>}/>;
const IcoSearch=({s,c})=><Ico size={s} stroke={c} ch={<><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></>}/>;
const IcoFilter=({s,c})=><Ico size={s} stroke={c} ch={<><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></>}/>;
const IcoFile  =({s,c})=><Ico size={s} stroke={c} ch={<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>}/>;
const IcoHistory=({s,c})=><Ico size={s} stroke={c} ch={<><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/></>}/>;
const IcoX     =({s,c})=><Ico size={s} stroke={c} ch={<><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>}/>;
const WaIcon=({size=16})=><svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M20.52 3.48A11.93 11.93 0 0 0 12 0C5.37 0 0 5.37 0 12c0 2.11.55 4.16 1.6 5.97L0 24l6.18-1.62A11.94 11.94 0 0 0 12 24c6.63 0 12-5.37 12-12 0-3.2-1.25-6.22-3.48-8.52zM12 22c-1.85 0-3.66-.5-5.24-1.44l-.37-.22-3.87 1.02 1.03-3.78-.24-.39A9.94 9.94 0 0 1 2 12C2 6.48 6.48 2 12 2c2.67 0 5.17 1.04 7.07 2.93A9.94 9.94 0 0 1 22 12c0 5.52-4.48 10-10 10zm5.44-7.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51-.17 0-.37-.02-.57-.02-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.87 1.22 3.07.15.2 2.1 3.2 5.08 4.49.71.31 1.27.49 1.7.63.72.23 1.37.2 1.88.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35z"/></svg>;

// ── SHARED UI COMPONENTS ──────────────────────────────────────
function StatusBadge({status}){
  const c=STATUS_COLOR[status]||{bg:T.gray100,text:T.gray700,border:T.gray300,dot:T.gray500};
  return <span style={{display:"inline-flex",alignItems:"center",gap:5,padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,border:`1px solid ${c.border}`,background:c.bg,color:c.text}}>
    <span style={{width:6,height:6,borderRadius:"50%",background:c.dot,display:"inline-block",flexShrink:0}}/>
    {STATUS_LABELS[status]||status}
  </span>;
}
function PriorityBadge({priority}){
  const c=PRIORITY_COLOR[priority]||{bg:T.gray100,text:T.gray700,border:T.gray300,icon:"·"};
  return <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 9px",borderRadius:20,fontSize:11,fontWeight:700,border:`1px solid ${c.border}`,background:c.bg,color:c.text}}>
    <span style={{fontWeight:900,fontSize:12}}>{c.icon}</span>{priority}
  </span>;
}
function DeadlineBadge({deadline,status}){
  if(!deadline||["done","canceled","rejected"].includes(status))return null;
  const ds=deadlineStatus(deadline);
  if(!ds)return null;
  return <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 9px",borderRadius:20,fontSize:11,fontWeight:700,background:ds.bg,color:ds.color,border:`1px solid ${ds.border}`}}>⏱ {ds.label}</span>;
}
function Avatar({name,size=36,fontSize=13,color=T.secondary,img}){
  if(img)return <div style={{width:size,height:size,borderRadius:"50%",overflow:"hidden",flexShrink:0}}><img src={img} alt={name} style={{width:"100%",height:"100%",objectFit:"cover"}}/></div>;
  return <div style={{width:size,height:size,borderRadius:"50%",background:color,display:"flex",alignItems:"center",justifyContent:"center",fontSize,fontWeight:700,color:"#fff",flexShrink:0}}>{inits(name)}</div>;
}
function DesignerLink({user,onNavigate,style={}}){
  if(!user)return <span style={{color:T.gray500,...style}}>—</span>;
  if(user.role!=="designer")return <span style={{color:T.gray800,fontWeight:500,...style}}>{user.name}</span>;
  return <span style={{color:T.primary,fontWeight:600,cursor:"pointer",...style}} onClick={e=>{e.stopPropagation();onNavigate&&onNavigate(user);}}>{user.name}</span>;
}
function Empty({icon,text,sub}){return <div style={{textAlign:"center",padding:"48px 20px",color:T.gray500}}>
  <div style={{fontSize:36,marginBottom:10}}>{icon}</div>
  <div style={{fontSize:14,fontWeight:600,color:T.gray600,marginBottom:4}}>{text}</div>
  {sub&&<div style={{fontSize:12,color:T.gray400}}>{sub}</div>}
</div>;}
function Sparkline({data,color}){
  if(!data||data.length<2)return null;
  const W=72,H=32,P=2,mn=Math.min(...data),mx=Math.max(...data),range=mx-mn||1;
  const pts=data.map((v,i)=>`${P+(i/(data.length-1))*(W-2*P)},${H-P-((v-mn)/range)*(H-2*P)}`).join(" ");
  const [fx]=pts.split(" ")[0].split(",");const [lx]=pts.split(" ").slice(-1)[0].split(",");
  const gid=`sg${color.replace(/[^a-z0-9]/gi,"")}${Math.random().toString(36).slice(2,6)}`;
  return(<svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{overflow:"visible"}}><defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.2"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs><polygon points={`${pts} ${lx},${H} ${fx},${H}`} fill={`url(#${gid})`}/><polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/></svg>);
}
function WorkloadBar({active,capacity=8,pts}){
  const pct=Math.min(100,Math.round((active/capacity)*100));
  const col=pct>80?"#DC2626":pct>50?"#D97706":"#16A34A";
  return <div style={{display:"flex",alignItems:"center",gap:8}}>
    <div style={{flex:1,height:5,background:T.gray200,borderRadius:3,overflow:"hidden"}}>
      <div style={{width:`${pct}%`,height:"100%",background:col,borderRadius:3,transition:"width .4s"}}/>
    </div>
    <span style={{fontSize:11,color:T.gray500,whiteSpace:"nowrap"}}>{active} active · {pts} pts</span>
  </div>;
}

// ── CSS ───────────────────────────────────────────────────────
const css=`
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#EEF3FA;color:#1E293B;-webkit-font-smoothing:antialiased}

/* ── LAYOUT ── */
.app{display:flex;height:100vh;overflow:hidden}
.main{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0}
.content{flex:1;overflow-y:auto;padding:24px;background:#EEF3FA}

/* ── SIDEBAR ── */
.sidebar{width:252px;min-width:252px;background:linear-gradient(180deg,#053A8C 0%,#064299 60%,#0A4FA8 100%);display:flex;flex-direction:column;overflow-y:auto;flex-shrink:0;box-shadow:2px 0 12px rgba(6,42,100,.18)}
.sb-brand{padding:18px 16px 14px;display:flex;align-items:center;gap:11px;border-bottom:1px solid rgba(255,255,255,.09)}
.sb-logo{width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,#1D6FBB,#0E7490);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:#fff;letter-spacing:-.5px;flex-shrink:0;box-shadow:0 2px 6px rgba(0,0,0,.2)}
.sb-name{font-size:13px;font-weight:700;color:#fff;letter-spacing:-.2px}.sb-sub{font-size:10px;color:#93C5FD;margin-top:1px;opacity:.8}
.sb-user{margin:10px 8px;padding:10px 11px;background:rgba(255,255,255,.07);border-radius:11px;display:flex;align-items:center;gap:9px;cursor:pointer;transition:background .15s;border:1px solid rgba(255,255,255,.07)}
.sb-user:hover{background:rgba(255,255,255,.13)}
.sb-uname{font-size:12px;font-weight:700;color:#fff;line-height:1.2}.sb-urole{font-size:10px;color:#93C5FD;margin-top:1px;opacity:.85}
.sb-section{padding:14px 16px 5px;font-size:9px;font-weight:800;color:rgba(147,197,253,.5);text-transform:uppercase;letter-spacing:.1em}
.nav-item{display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:9px;cursor:pointer;font-size:13px;color:rgba(191,219,254,.8);margin:1px 8px;transition:all .12s;min-height:40px}
.nav-item:hover{background:rgba(255,255,255,.09);color:#fff}
.nav-item.active{background:linear-gradient(135deg,rgba(29,111,187,.75),rgba(14,116,144,.55));color:#fff;font-weight:700;box-shadow:inset 0 0 0 1px rgba(255,255,255,.14),0 3px 10px rgba(0,0,0,.18)}
.nav-badge{margin-left:auto;background:#EF4444;color:#fff;font-size:9px;font-weight:800;padding:2px 6px;border-radius:9px;min-width:18px;text-align:center;line-height:15px;box-shadow:0 1px 4px rgba(239,68,68,.4)}
.sb-footer{margin-top:auto;padding:12px 8px}
.sb-logout{width:100%;padding:9px 12px;border-radius:9px;border:1px solid rgba(255,255,255,.1);background:transparent;color:rgba(147,197,253,.7);font-size:12px;cursor:pointer;font-weight:500;transition:all .15s;display:flex;align-items:center;gap:8px;font-family:inherit}
.sb-logout:hover{background:rgba(255,255,255,.1);color:#fff;border-color:rgba(255,255,255,.2)}

/* ── TOPBAR ── */
.topbar{height:60px;min-height:60px;background:#fff;border-bottom:1px solid #E4ECF5;display:flex;align-items:center;padding:0 24px;gap:14px;box-shadow:0 2px 8px rgba(8,87,195,.06)}
.topbar-title{font-size:14px;font-weight:700;flex:1;color:#0F172A;min-width:0;letter-spacing:-.2px}
.topbar-av{width:34px;height:34px;border-radius:50%;background:#DBEAFE;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#1E3A8A;border:2px solid #93C5FD;overflow:hidden;cursor:pointer;flex-shrink:0;transition:box-shadow .15s}
.topbar-av:hover{box-shadow:0 0 0 3px rgba(147,197,253,.4)}
.topbar-btn{width:34px;height:34px;border-radius:8px;border:none;background:none;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#64748B;transition:background .15s,color .15s;flex-shrink:0}
.topbar-btn:hover{background:#F1F5F9;color:#334155}

/* ── CARDS ── */
.card{background:#fff;border:1px solid #E4ECF5;border-radius:16px;padding:20px;box-shadow:0 1px 5px rgba(8,87,195,.05)}
.card-sm{background:#fff;border:1px solid #E8EDF5;border-radius:11px;padding:13px 15px}
.card-hover{transition:border-color .15s,box-shadow .15s,transform .15s}
.card-hover:hover{border-color:#C3D8F8;box-shadow:0 4px 18px rgba(8,87,195,.09);transform:translateY(-2px)}
.lift{transition:transform .15s,box-shadow .15s,border-color .15s}
.lift:hover{transform:translateY(-2px);box-shadow:0 6px 22px rgba(8,87,195,.1);border-color:#C3D8F8!important}
.card-flat{background:#F8FAFC;border:1px solid #F1F5F9;border-radius:12px;padding:14px 16px}
.card-glass{background:rgba(255,255,255,.75);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.95);border-radius:14px;padding:16px 18px;box-shadow:0 2px 8px rgba(8,87,195,.06)}

/* ── STAT CARDS ── */
.stat-card{background:#fff;border:1px solid #E8EDF5;border-radius:16px;padding:16px 18px;box-shadow:0 1px 4px rgba(8,87,195,.04);position:relative;overflow:hidden;transition:transform .15s,box-shadow .15s}
.stat-card:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(8,87,195,.09)}
.stat-card::before{content:"";position:absolute;top:0;left:0;right:0;height:3px;background:var(--accent,#0857C3);border-radius:16px 16px 0 0}

/* ── GREETING BANNER ── */
.greeting-banner{background:linear-gradient(135deg,#053A8C 0%,#0857C3 50%,#0E7490 100%);border-radius:18px;padding:22px 26px;position:relative;overflow:hidden;color:#fff;box-shadow:0 6px 24px rgba(8,87,195,.28),0 0 0 1px rgba(255,255,255,.06)}
.greeting-banner::before{content:"";position:absolute;right:-40px;top:-40px;width:160px;height:160px;border-radius:50%;background:rgba(255,255,255,.05)}
.greeting-banner::after{content:"";position:absolute;right:60px;bottom:-50px;width:100px;height:100px;border-radius:50%;background:rgba(255,255,255,.04)}
.greeting-banner .gb-blob{position:absolute;left:-20px;bottom:-30px;width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,.03)}

/* ── REMINDER CARD ── */
.reminder-section{background:#fff;border:1px solid #E4ECF5;border-radius:16px;padding:18px 20px;box-shadow:0 2px 8px rgba(8,87,195,.05)}
.reminder-row{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:10px;cursor:pointer;transition:all .15s;margin-bottom:6px;border:1px solid transparent}
.reminder-row:last-child{margin-bottom:0}
.reminder-row:hover{border-color:currentColor;opacity:.88}
.reminder-tag{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:7px;font-size:10px;font-weight:700;white-space:nowrap}
.flow-strip{display:flex;align-items:center;gap:0}
.flow-node{width:7px;height:7px;border-radius:50%;background:#E2E8F0;flex-shrink:0;transition:background .2s}
.flow-node.done{background:#16A34A}
.flow-node.active{background:#0857C3;box-shadow:0 0 0 3px rgba(8,87,195,.18)}
.flow-edge{width:18px;height:2px;background:#E2E8F0;flex-shrink:0}
.flow-edge.done{background:#16A34A}

/* ── QUICK ACTIONS ── */
.quick-strip{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px}
.quick-btn{display:flex;align-items:center;gap:11px;padding:13px 15px;border-radius:13px;border:1.5px solid #E4ECF5;background:#fff;cursor:pointer;transition:all .18s;font-family:inherit;text-align:left;box-shadow:0 1px 4px rgba(8,87,195,.05)}
.quick-btn:hover{border-color:#93C5FD;background:linear-gradient(135deg,#EFF6FF,#F8FCFF);transform:translateY(-2px);box-shadow:0 6px 18px rgba(8,87,195,.12)}
.quick-btn .qb-icon{width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0;box-shadow:0 1px 3px rgba(0,0,0,.08)}

/* ── LAYOUT GRIDS ── */
.g2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
.g4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.ph{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:20px;gap:12px}
.ph-actions{display:flex;gap:8px;align-items:center;flex-shrink:0;flex-wrap:wrap}
.pt{font-size:17px;font-weight:800;color:#0F172A;letter-spacing:-.3px}
.pd{font-size:13px;color:#64748B;margin-top:3px}
.sh{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.st{font-size:13px;font-weight:700;color:#334155;display:flex;align-items:center;gap:6px}
.divider{height:1px;background:#F1F5F9;margin:14px 0}
.section-title{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#94A3B8;margin-bottom:10px}

/* ── SEC DIVIDER ── */
.sec-divider{display:flex;align-items:center;gap:10px;margin:6px 0 14px}
.sec-divider-line{flex:1;height:1px;background:#EEF2F8}
.sec-divider-label{font-size:9px;font-weight:800;color:#B0BCCC;text-transform:uppercase;letter-spacing:.1em;white-space:nowrap}

/* ── INFO ROW ── */
.ir{display:flex;flex-wrap:wrap;gap:10px;padding:10px 14px;background:#F7FAFE;border-radius:10px;margin-bottom:12px;border:1px solid #EEF2F8}
.ii{font-size:12px;color:#64748B;display:flex;align-items:center;gap:4px}.ii b{color:#1E293B;font-weight:600}

/* ── BUTTONS ── */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:36px;padding:0 16px;border-radius:9px;border:1.5px solid #D1DAE8;background:#fff;color:#1E293B;font-size:13px;cursor:pointer;font-weight:600;transition:all .15s;white-space:nowrap;font-family:inherit;line-height:1;text-decoration:none}
.btn:hover{background:#F5F8FE;border-color:#A5B8D0;box-shadow:0 1px 4px rgba(0,0,0,.07)}
.btn:active{transform:scale(.98)}
.btn:focus-visible{outline:3px solid #93C5FD;outline-offset:2px}
.btn-primary{background:linear-gradient(135deg,#0857C3,#0A64D6);color:#fff;border-color:#0857C3;box-shadow:0 2px 8px rgba(8,87,195,.3)}
.btn-primary:hover{background:linear-gradient(135deg,#064299,#0857C3);border-color:#064299;color:#fff;box-shadow:0 3px 12px rgba(8,87,195,.35)}
.btn-outline{background:#EFF6FF;color:#1E3A8A;border-color:#BFDBFE}
.btn-outline:hover{background:#DBEAFE;border-color:#93C5FD;color:#1E3A8A}
.btn-success{background:linear-gradient(135deg,#15803D,#16A34A);color:#fff;border-color:#15803D;box-shadow:0 2px 6px rgba(21,128,61,.25)}
.btn-success:hover{background:linear-gradient(135deg,#166534,#15803D);color:#fff}
.btn-ghost-red{background:#FEF2F2;color:#991B1B;border-color:#FECACA}
.btn-ghost-red:hover{background:#FEE2E2;border-color:#FCA5A5;color:#7F1D1D}
.btn-wa{background:linear-gradient(135deg,#15803D,#16A34A);color:#fff;border-color:#15803D;box-shadow:0 2px 6px rgba(21,128,61,.25)}
.btn-wa:hover{background:linear-gradient(135deg,#166534,#15803D);color:#fff}
.btn-amber{background:#FFFBEB;color:#92400E;border-color:#FCD34D}
.btn-amber:hover{background:#FEF3C7;border-color:#FBBF24;color:#78350F}
.btn-orange{background:#FFF7ED;color:#9A3412;border-color:#FDBA74}
.btn-orange:hover{background:#FFEDD5;border-color:#FB923C;color:#7C2D12}
.btn-purple{background:#F5F3FF;color:#4C1D95;border-color:#C4B5FD}
.btn-purple:hover{background:#EDE9FE;border-color:#A78BFA;color:#3B0764}
.btn-sm{height:30px;padding:0 12px;font-size:12px;border-radius:8px;font-weight:600}
.btn-xs{height:26px;padding:0 9px;font-size:11px;border-radius:7px;font-weight:600}
.btn:disabled{opacity:.4;cursor:not-allowed;pointer-events:none}

/* ── FORMS ── */
.fg{margin-bottom:14px}
.fl{font-size:11px;font-weight:700;color:#4A5568;display:block;margin-bottom:5px;text-transform:uppercase;letter-spacing:.05em}
.fl .req{color:#DC2626;margin-left:2px}
.fi{width:100%;padding:9px 12px;border-radius:9px;border:1.5px solid #D1DAE8;background:#fff;color:#1E293B;font-size:13px;font-family:inherit;outline:none;transition:border-color .15s,box-shadow .15s}
.fi:focus{border-color:#0857C3;box-shadow:0 0 0 3px rgba(8,87,195,.1)}
.fi.err{border-color:#DC2626;box-shadow:0 0 0 3px rgba(220,38,38,.08)}
textarea.fi{resize:vertical;min-height:80px;line-height:1.6;font-size:13px}
.fe{font-size:11px;color:#DC2626;margin-top:4px;font-weight:600}
.fdrop{border:2px dashed #D1DAE8;border-radius:11px;padding:24px 16px;text-align:center;cursor:pointer;transition:all .15s;background:#F9FAFB}
.fdrop:hover,.fdrop.drag{border-color:#0857C3;background:#EFF6FF}
.fchip{display:inline-flex;align-items:center;gap:5px;background:#EFF6FF;color:#1E3A8A;border:1px solid #BFDBFE;border-radius:20px;padding:3px 10px;font-size:11px;margin:2px}
.fchip-x{cursor:pointer;font-weight:700;opacity:.5}.fchip-x:hover{opacity:1}
.search-box{position:relative;display:flex;align-items:center}
.search-box svg{position:absolute;left:10px;pointer-events:none}
.search-box input{padding-left:34px}

/* ── TABLES ── */
.tw{overflow:hidden;border-radius:14px;border:1px solid #E8EDF5;background:#fff;box-shadow:0 1px 4px rgba(8,87,195,.04)}
.tbl{width:100%;border-collapse:collapse;font-size:13px}
.tbl th{text-align:left;padding:10px 15px;font-size:10px;font-weight:800;color:#7A8FA6;background:#F7FAFE;border-bottom:1px solid #EEF2F8;text-transform:uppercase;letter-spacing:.06em;white-space:nowrap}
.tbl td{padding:12px 15px;border-bottom:1px solid #F1F5F9;color:#334155;vertical-align:middle}
.tbl tr:last-child td{border-bottom:none}
.tbl tbody tr{cursor:pointer;transition:background .1s}
.tbl tbody tr:hover td{background:#F7FAFE}

/* ── KANBAN ── */
.kanban{display:flex;gap:10px;overflow-x:auto;padding-bottom:8px;-webkit-overflow-scrolling:touch}
.kcol{min-width:206px;max-width:206px;background:#EEF2F8;border-radius:14px;padding:11px;flex-shrink:0}
.kch{font-size:10px;font-weight:800;margin-bottom:10px;display:flex;align-items:center;gap:7px;color:#5A6A7E;text-transform:uppercase;letter-spacing:.06em}
.kcd{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.kcc{margin-left:auto;background:#fff;border:1px solid #E8EDF5;border-radius:9px;padding:1px 7px;font-size:10px;color:#7A8FA6;font-weight:700}
.tc{background:#fff;border:1px solid #E8EDF5;border-radius:10px;padding:11px 13px;margin-bottom:7px;cursor:pointer;transition:all .15s;box-shadow:0 1px 2px rgba(0,0,0,.03)}
.tc:hover{border-color:#BFDBFE;box-shadow:0 4px 14px rgba(8,87,195,.1);transform:translateY(-1px)}
.tc-id{font-size:9px;color:#A0AEC0;margin-bottom:3px;font-family:monospace;letter-spacing:.02em}
.tc-title{font-size:12px;font-weight:600;margin-bottom:7px;line-height:1.4;color:#1E293B}
.tc-foot{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-top:5px}

/* ── TABS ── */
.tabs{display:flex;gap:2px;background:#EEF2F8;border-radius:11px;padding:3px;margin-bottom:16px}
.tab{flex:1;text-align:center;padding:7px 14px;font-size:12px;cursor:pointer;border-radius:9px;color:#64748B;font-weight:600;transition:all .15s}
.tab.active{background:#fff;color:#0857C3;box-shadow:0 1px 5px rgba(8,87,195,.12);font-weight:700}

/* ── MODALS ── */
.mo{position:fixed;inset:0;background:rgba(6,24,74,.45);backdrop-filter:blur(6px);z-index:100;display:flex;align-items:flex-start;justify-content:center;padding:28px 16px;overflow-y:auto}
.modal{background:#fff;border-radius:20px;width:100%;max-width:700px;position:relative;box-shadow:0 32px 80px rgba(0,0,0,.2),0 0 0 1px rgba(8,87,195,.06);overflow:hidden}
.modal-hdr{padding:20px 24px 16px;border-bottom:1px solid #F1F5F9;display:flex;align-items:flex-start;gap:12px;background:linear-gradient(180deg,#FAFCFF 0%,#fff 100%)}
.modal-body{padding:20px 24px}
.modal-footer{padding:14px 24px;border-top:1px solid #F1F5F9;display:flex;justify-content:flex-end;gap:8px;background:#FAFBFD}
.mi{width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,#DBEAFE,#EFF6FF);display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0;box-shadow:0 1px 4px rgba(8,87,195,.12)}
.mt{font-size:15px;font-weight:800;color:#0F172A;line-height:1.2;letter-spacing:-.2px}
.ms{font-size:12px;color:#64748B;margin-top:2px}
.mc{position:absolute;top:16px;right:16px;background:#F1F5F9;border:none;font-size:14px;cursor:pointer;color:#64748B;width:30px;height:30px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-weight:700;transition:all .15s}
.mc:hover{background:#E2E8F0;color:#334155}

/* ── ACTIVITY ── */
.activity-item{display:flex;gap:12px;padding:9px 0;border-bottom:1px solid #F8FAFC}
.activity-item:last-child{border-bottom:none}
.activity-dot{width:8px;height:8px;border-radius:50%;background:#D1DAE8;flex-shrink:0;margin-top:5px}
.activity-dot.system{background:#0857C3}.activity-dot.note{background:#16A34A}
.activity-dot.revision{background:#DC2626}.activity-dot.file{background:#D97706}
.cb{padding:11px 13px;border-radius:10px;background:#F8FAFC;border:1px solid #EEF2F8;margin-bottom:7px}
.cb-rev{background:#FEF2F2;border-color:#FECACA}
.cb-file{background:#FFFBEB;border-color:#FEF08A}
.cb-system{background:#EFF6FF;border-color:#DBEAFE}
.cb-auth{font-size:11px;font-weight:700;margin-bottom:3px;display:flex;align-items:center;gap:6px}
.cb-text{font-size:13px;line-height:1.5;color:#334155}
.cb-time{font-size:10px;color:#A0AEC0;margin-top:4px}

/* ── NOTIFICATIONS ── */
.ni{padding:13px 16px;border-bottom:1px solid #F1F5F9;cursor:pointer;transition:background .1s;display:flex;gap:12px;align-items:flex-start}
.ni:hover{background:#F8FAFE}
.ni.unread{background:#EFF6FF;border-left:3px solid #0857C3}
.ni-icon{width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px}

/* ── BADGES & TAGS ── */
.badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:9px;font-size:11px;font-weight:700;border:1px solid}
.tag{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:8px;font-size:11px;font-weight:600;background:#EEF2F8;color:#5A6A7E;border:1px solid #E0E7F0}

/* ── MISC ── */
.dot-anim{width:6px;height:6px;border-radius:50%;background:#0857C3;animation:bnc .9s infinite}
.dot-anim:nth-child(2){animation-delay:.15s}.dot-anim:nth-child(3){animation-delay:.3s}
@keyframes bnc{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-5px)}}
.ai-bub{background:linear-gradient(135deg,#E0F7FA,#EFF6FF);border:1px solid #A5F3FC;border-radius:11px;padding:13px 15px;font-size:13px;color:#164E63;line-height:1.7;margin-top:10px;white-space:pre-line;box-shadow:inset 0 1px 0 rgba(255,255,255,.6)}
.pb-t{height:5px;background:#EEF2F8;border-radius:3px;overflow:hidden}
.pb-f{height:100%;background:linear-gradient(90deg,#0857C3,#0E7490);border-radius:3px;transition:width .4s}
.rc{display:flex;align-items:flex-start;gap:12px;cursor:pointer;padding:12px 14px;border-radius:11px;border:1.5px solid #E0E7F0;background:#fff;transition:all .15s;margin-bottom:8px}
.rc.sel{border-color:#0857C3;background:#EFF6FF}
.rc-l{font-size:13px;font-weight:600;color:#334155}.rc-s{font-size:11px;color:#64748B;margin-top:2px}
.toast{position:fixed;bottom:24px;right:24px;padding:12px 18px;border-radius:11px;font-size:13px;font-weight:600;z-index:300;box-shadow:0 8px 28px rgba(0,0,0,.14);animation:sup .2s ease;max-width:320px;display:flex;align-items:center;gap:8px;border:1px solid}
@keyframes sup{from{transform:translateY(10px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
.forbidden{display:flex;flex-direction:column;align-items:center;justify-content:center;height:60%;color:#94A3B8;gap:8px}
.filter-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:16px}
.section-title{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.09em;color:#7A8FA6;margin-bottom:10px}
/* ── REMINDER ROW ENHANCED ── */
.reminder-row{display:flex;align-items:center;gap:10px;padding:10px 13px;border-radius:11px;cursor:pointer;transition:all .15s;margin-bottom:6px;border:1px solid transparent}
.reminder-row:last-child{margin-bottom:0}
.reminder-row:hover{transform:translateX(2px);filter:brightness(.97)}

/* ── PUBLIC FORM ── */
.pub-wrap{min-height:100vh;background:linear-gradient(160deg,#0A2D6E 0%,#0857C3 45%,#D8E8FF 100%);padding:28px 16px 60px;display:flex;flex-direction:column;align-items:center}
.pub-hdr{text-align:center;margin-bottom:28px;color:#fff}
.pub-hdr-logo{width:50px;height:50px;border-radius:14px;background:rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:#fff;margin:0 auto 12px;backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.2);box-shadow:0 4px 14px rgba(0,0,0,.1)}
.pub-hdr h1{font-size:24px;font-weight:800;margin-bottom:5px;letter-spacing:-.3px}
.pub-hdr p{font-size:13px;opacity:.75}
.pub-card{background:#fff;border-radius:20px;width:100%;max-width:680px;padding:28px 30px;box-shadow:0 24px 64px rgba(0,0,0,.18)}
.pub-sec{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#1D6FBB;margin:20px 0 12px;padding-bottom:7px;border-bottom:1px solid #EEF2F8}
.pub-sec:first-of-type{margin-top:0}
.pub-ok{display:flex;flex-direction:column;align-items:center;text-align:center;padding:36px 20px}
.pub-ok-icon{width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,#DCFCE7,#BBF7D0);border:2px solid #16A34A;display:flex;align-items:center;justify-content:center;font-size:26px;margin:0 auto 16px;box-shadow:0 4px 12px rgba(21,128,61,.2)}
.step-bar{display:flex;align-items:center;margin-bottom:24px}
.step{display:flex;align-items:center;gap:5px;font-size:11px;color:#A0AEC0}
.step.active{color:#0857C3;font-weight:700}.step.done{color:#16A34A;font-weight:600}
.step-c{width:22px;height:22px;border-radius:50%;border:2px solid #D1DAE8;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0}
.step.active .step-c{border-color:#0857C3;background:#0857C3;color:#fff;box-shadow:0 0 0 3px rgba(8,87,195,.15)}
.step.done .step-c{border-color:#16A34A;background:#16A34A;color:#fff}
.step-line{flex:1;height:2px;background:#EEF2F8;margin:0 4px;min-width:14px}
.step-line.done{background:#16A34A}

/* ── LOGIN ── */
.login-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#0A2D6E 0%,#0857C3 60%,#1D6FBB 100%);padding:16px}
.login-card{background:#fff;border-radius:20px;padding:32px 28px;width:100%;max-width:380px;box-shadow:0 28px 72px rgba(0,0,0,.24)}
.login-err{background:#FEF2F2;border:1px solid #FECACA;border-radius:9px;padding:10px 13px;margin-bottom:12px;font-size:12px;color:#7F1D1D;font-weight:600}

/* ── RESPONSIVE ── */
@media(max-width:900px){.g4{grid-template-columns:1fr 1fr}.quick-strip{grid-template-columns:1fr 1fr}}
@media(max-width:700px){
  .sidebar{position:fixed;left:0;top:0;height:100%;z-index:50;transform:translateX(-100%);transition:transform .25s}
  .sidebar.open{transform:translateX(0)}
  .sb-overlay{display:block;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:49;backdrop-filter:blur(2px)}
  .hamburger{display:flex!important}
  .content{padding:14px}
  .g2{grid-template-columns:1fr}
  .g4{grid-template-columns:1fr 1fr}
  .g3{grid-template-columns:1fr}
  .ph{flex-direction:column;gap:10px}
  .ph-actions{width:100%}
  .quick-strip{grid-template-columns:1fr 1fr}
  .mo{padding:0;align-items:flex-end}
  .modal{border-radius:18px 18px 0 0;max-height:92vh;overflow-y:auto}
  .filter-bar{flex-direction:column;align-items:stretch}
  .pub-card{padding:20px 16px}
  .tw{overflow-x:auto}
  .pub-side{display:none}
}
`;
// ── FORM SCHEMA ───────────────────────────────────────────────
const FORM_SECTIONS=[
  {label:"Your Information",    fields:["applicant_name","role","department","email","phone"]},
  {label:"Request Details",     fields:["product","request_title","design_type","description","guideline_link"]},
  {label:"Attachments & Timing",fields:["attachments","deadline","priority"]},
];
const FORM_FIELDS={
  applicant_name:{label:"Full Name",type:"text",required:true},
  role:          {label:"Your Role / Title",type:"text",required:true},
  department:    {label:"Division / Group",type:"text",required:true},
  email:         {label:"Email",type:"email",required:true},
  phone:         {label:"Phone",type:"text",required:true},
  product:       {label:"Product / Project",type:"text",required:true},
  request_title: {label:"Request Title",type:"text",required:true},
  design_type:   {label:"Design Type",type:"select",required:true,options:DESIGN_TYPES},
  description:   {label:"Description",type:"textarea",required:true},
  guideline_link:{label:"Brand / Guideline Link",type:"url",required:false},
  attachments:   {label:"Attachments",type:"file",required:false},
  deadline:      {label:"Deadline",type:"date",required:true},
  priority:      {label:"Priority",type:"select",required:true,options:PRIORITIES},
};

// ── ROOT ──────────────────────────────────────────────────────
export default function App(){
  const [view,setView]=useState("public");
  const [users,setUsers]=useState(INIT_USERS);
  const [requests,setRequests]=useState(INIT_REQUESTS);
  const [session,setSession]=useState(null);
  if(view==="public")return <PublicForm onSubmitReq={req=>setRequests(x=>[req,...x])} onStaffLogin={()=>setView("login")}/>;
  if(view==="login"||!session)return <LoginScreen users={users} onLogin={s=>{setSession(s);setView("app");}} onBack={()=>setView("public")}/>;
  return <MainApp session={session} sharedUsers={users} setSharedUsers={setUsers} sharedRequests={requests} setSharedRequests={setRequests} onLogout={()=>{setSession(null);setView("public");}}/>;
}

// ── PUBLIC FORM ───────────────────────────────────────────────
function PublicForm({onSubmitReq,onStaffLogin}){
  const [step,setStep]=useState(0);const [form,setForm]=useState({});const [errs,setErrs]=useState({});
  const [files,setFiles]=useState([]);const [drag,setDrag]=useState(false);
  const [busy,setBusy]=useState(false);const [cool,setCool]=useState("");
  const fileRef=useRef();
  const setF=(k,v)=>{setForm(f=>({...f,[k]:v}));setErrs(e=>({...e,[k]:""}));};
  const validate=idx=>{const ev={};FORM_SECTIONS[idx].fields.forEach(k=>{const fd=FORM_FIELDS[k];if(!fd.required||fd.type==="file")return;const v=(form[k]||"").trim();if(!v){ev[k]=`${fd.label} is required`;return;}if(fd.type==="email"&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))ev[k]="Enter a valid email";});return ev;};
  const next=()=>{const e=validate(step);if(Object.keys(e).length){setErrs(e);return;}setStep(s=>s+1);};
  const back=()=>setStep(s=>s-1);
  const addFiles=fs=>setFiles(p=>[...p,...Array.from(fs).filter(f=>{if(f.size>10*1024*1024){alert(`${f.name} exceeds 10 MB`);return false;}return true;})]);
  const submit=()=>{
    const e=validate(step);if(Object.keys(e).length){setErrs(e);return;}
    if(form._hp)return;const lim=checkRate();if(lim){setCool(lim);return;}
    setBusy(true);
    setTimeout(()=>{
      const dt=form.design_type==="Other"&&form.design_type_other?`Other: ${form.design_type_other}`:form.design_type||"";
      onSubmitReq({id:uid(),request_id:genReqId(),applicant_name:form.applicant_name||"",role_title:form.role||"",department:form.department||"",email:form.email||"",phone:form.phone||"",product:form.product||"",title:form.request_title||"",design_type:dt,description:form.description||"",guideline_link:form.guideline_link||"",priority:form.priority||"Medium",status:"pending",workload:null,deadline:form.deadline||"",attachments:files.map(f=>f.name),created_at:now(),source:"public_form"});
      setBusy(false);setStep(3);
    },800);
  };
  const renderField=key=>{
    const fd=FORM_FIELDS[key];if(!fd)return null;const val=form[key]||"";const err=errs[key];
    if(fd.type==="file")return(<div className="fg" key={key}><label className="fl">{fd.label} <span style={{fontSize:11,color:T.gray400,fontWeight:400,textTransform:"none"}}>(optional, max 10 MB each)</span></label>
      <div className={`fdrop${drag?" drag":""}`} onClick={()=>fileRef.current.click()} onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);addFiles(e.dataTransfer.files);}}>
        <div style={{fontSize:24,marginBottom:6}}>📎</div><div style={{fontSize:13,color:T.gray600,marginBottom:2}}>Drag & drop or <span style={{color:T.primary,fontWeight:700}}>browse</span></div>
        <div style={{fontSize:11,color:T.gray400}}>PNG, JPG, PDF, AI, PSD up to 10 MB</div>
      </div>
      <input ref={fileRef} type="file" multiple style={{display:"none"}} onChange={e=>addFiles(e.target.files)}/>
      {files.length>0&&<div style={{marginTop:8,display:"flex",flexWrap:"wrap"}}>{files.map((f,i)=><span key={i} className="fchip">{f.name}<span className="fchip-x" onClick={()=>setFiles(x=>x.filter((_,j)=>j!==i))}> ×</span></span>)}</div>}
    </div>);
    if(fd.type==="select")return(<div className="fg" key={key}><label className="fl">{fd.label}{fd.required&&<span className="req">*</span>}</label>
      <select className={`fi${err?" err":""}`} value={val} onChange={e=>setF(key,e.target.value)}><option value="">Select…</option>{fd.options.map(o=><option key={o}>{o}</option>)}</select>
      {err&&<div className="fe">{err}</div>}
      {key==="design_type"&&val==="Other"&&<input className="fi" style={{marginTop:8}} value={form.design_type_other||""} onChange={e=>setF("design_type_other",e.target.value)} placeholder="Please describe the design type…"/>}
    </div>);
    if(fd.type==="textarea")return(<div className="fg" key={key}><label className="fl">{fd.label}{fd.required&&<span className="req">*</span>}</label>
      <textarea className={`fi${err?" err":""}`} value={val} onChange={e=>setF(key,e.target.value)} placeholder="Describe your request in detail — include references, examples, or links…"/>{err&&<div className="fe">{err}</div>}</div>);
    return(<div className="fg" key={key}><label className="fl">{fd.label}{fd.required&&<span className="req">*</span>}</label>
      <input className={`fi${err?" err":""}`} type={fd.type} value={val} onChange={e=>setF(key,e.target.value)} placeholder={fd.type==="email"?"you@company.com":fd.type==="url"?"https://…":""}/>
      {err&&<div className="fe">{err}</div>}</div>);
  };
  return(<><style>{css}</style>
    <div className="pub-wrap">
      <div className="pub-hdr"><div className="pub-hdr-logo">GD</div><h1>Design Request</h1><p>Submit a request to the creative team</p></div>
      <div style={{display:"flex",gap:20,width:"100%",maxWidth:980,alignItems:"stretch"}}>
        <div className="pub-card" style={{flex:1}}>
          {step<3&&(<>
            <div className="step-bar">{FORM_SECTIONS.map((sec,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",flex:i<FORM_SECTIONS.length-1?1:"auto"}}>
                <div className={`step${i===step?" active":i<step?" done":""}`}><div className="step-c">{i<step?"✓":i+1}</div><span style={{fontSize:11,whiteSpace:"nowrap"}}>{sec.label}</span></div>
                {i<FORM_SECTIONS.length-1&&<div className={`step-line${i<step?" done":""}`}/>}
              </div>
            ))}</div>
            <div className="pub-sec">{FORM_SECTIONS[step].label}</div>
            <input type="text" name="_hp" value={form._hp||""} onChange={e=>setF("_hp",e.target.value)} style={{position:"absolute",opacity:0,pointerEvents:"none",height:0,width:0}} tabIndex={-1} autoComplete="off"/>
            <div className="g2" style={{gap:"0 20px"}}>{FORM_SECTIONS[step].fields.map(k=>{const wide=["description","guideline_link","attachments"].includes(k);return wide?<div key={k} style={{gridColumn:"1/-1"}}>{renderField(k)}</div>:renderField(k);})}</div>
            {cool&&<div style={{background:T.amber50,border:"1px solid #FDE68A",borderRadius:8,padding:"9px 13px",fontSize:12,color:T.amber700,marginBottom:12,fontWeight:600}}>⏳ {cool}</div>}
            <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:8,paddingTop:14,borderTop:`1px solid ${T.gray100}`}}>
              {step>0&&<button className="btn btn-sm" style={{marginRight:"auto"}} onClick={back}>← Back</button>}
              {step<FORM_SECTIONS.length-1?<button className="btn btn-primary" onClick={next}>Continue →</button>:<button className="btn btn-primary" onClick={submit} disabled={busy}>{busy?"Submitting…":"Submit Request"}</button>}
            </div>
          </>)}
          {step===3&&(<div className="pub-ok">
            <div className="pub-ok-icon">✓</div>
            <div style={{fontSize:20,fontWeight:800,color:T.gray900,marginBottom:8}}>Request Submitted!</div>
            <div style={{fontSize:14,color:T.gray600,marginBottom:24,maxWidth:420,lineHeight:1.7}}>Thank you! Your request has been received and is pending review. Please also confirm via WhatsApp.</div>
            <a href="https://wa.me/6287722111173" target="_blank" rel="noreferrer" style={{textDecoration:"none",marginBottom:24}}>
              <div style={{display:"flex",alignItems:"center",gap:12,background:"#15803D",color:"#fff",borderRadius:12,padding:"12px 22px",fontWeight:700,fontSize:14,cursor:"pointer",boxShadow:"0 4px 14px rgba(21,128,61,.3)"}}>
                <WaIcon size={20}/>Confirm with Feby — Stream Lead
              </div>
            </a>
            <div style={{background:T.secondaryLight,border:`1px solid #BFDBFE`,borderRadius:12,padding:"14px 18px",fontSize:13,color:T.gray700,textAlign:"left",width:"100%",maxWidth:380}}>
              <div style={{fontWeight:700,marginBottom:8,color:T.primary}}>What happens next?</div>
              {["Stream Lead reviews and approves your request","Workload tier is assigned","A designer is assigned to your task","You'll be notified on progress"].map((s,i)=><div key={i} style={{display:"flex",gap:8,marginBottom:4}}><span style={{color:T.primary,fontWeight:700,fontSize:12}}>{i+1}.</span><span style={{fontSize:12}}>{s}</span></div>)}
            </div>
            <button className="btn btn-sm" style={{marginTop:20}} onClick={()=>{setStep(0);setForm({});setFiles([]);setErrs({});}}>Submit another request</button>
          </div>)}
        </div>
        <div style={{width:240,flexShrink:0,display:"flex",flexDirection:"column"}} className="pub-side">
          <div style={{background:"rgba(255,255,255,.12)",backdropFilter:"blur(12px)",borderRadius:18,padding:"24px 20px",border:"1px solid rgba(255,255,255,.2)",boxShadow:"0 8px 32px rgba(6,42,100,.2)",flex:1,display:"flex",flexDirection:"column"}}>
            <div style={{marginBottom:16,display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:40,height:40,borderRadius:10,background:"rgba(255,255,255,.18)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
              </div>
              <div><div style={{fontSize:14,fontWeight:700,color:"#fff"}}>Staff Portal</div><div style={{fontSize:11,color:"rgba(255,255,255,.65)"}}>Team access</div></div>
            </div>
            <div style={{height:1,background:"rgba(255,255,255,.15)",marginBottom:16}}/>
            {[{icon:"👩‍💼",role:"Team Lead",desc:"Review & monitoring"},{icon:"🥸",role:"Stream Lead",desc:"Approve, assign & manage"},{icon:"🤓",role:"Designer",desc:"Execute & deliver"}].map(r=>(
              <div key={r.role} style={{display:"flex",gap:10,padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,.08)"}}>
                <span style={{fontSize:18}}>{r.icon}</span>
                <div><div style={{fontSize:12,fontWeight:700,color:"#fff"}}>{r.role}</div><div style={{fontSize:11,color:"rgba(255,255,255,.55)"}}>{r.desc}</div></div>
              </div>
            ))}
            <button style={{width:"100%",marginTop:18,height:38,fontSize:13,background:"rgba(255,255,255,.95)",color:T.primary,border:"none",fontWeight:700,borderRadius:8,cursor:"pointer"}} onClick={onStaffLogin}>Sign In →</button>
          </div>
        </div>
      </div>
      <div style={{marginTop:20,fontSize:11,color:"rgba(255,255,255,.4)",textAlign:"center"}}>GD Tracker · Design Request System</div>
    </div>
  </>);
}

// ── LOGIN ─────────────────────────────────────────────────────
function LoginScreen({users,onLogin,onBack}){
  const [email,setEmail]=useState("");const [pw,setPw]=useState("");const [err,setErr]=useState("");
  const login=()=>{const u=users.find(x=>x.email.toLowerCase()===email.toLowerCase().trim());if(!u||u.password!==pw){setErr("Invalid email or password.");return;}onLogin({user:u});};
  return(<><style>{css}</style>
    <div className="login-wrap"><div className="login-card">
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:26}}>
        <div style={{width:42,height:42,borderRadius:12,background:T.primary,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:800,color:"#fff"}}>GD</div>
        <div><div style={{fontSize:18,fontWeight:800,color:T.gray900,letterSpacing:"-.3px"}}>Staff Portal</div><div style={{fontSize:12,color:T.gray600}}>GD Tracker — Design Team</div></div>
      </div>
      {err&&<div className="login-err">⚠ {err}</div>}
      <div className="fg"><label className="fl">Email</label><input className="fi" type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&login()} placeholder="you@company.com"/></div>
      <div className="fg"><label className="fl">Password</label><input className="fi" type="password" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&login()}/></div>
      <button className="btn btn-primary" style={{width:"100%",height:42,fontSize:14,marginBottom:10}} onClick={login}>Sign In</button>
      <button className="btn" style={{width:"100%"}} onClick={onBack}>← Back to Request Form</button>
      
    </div></div>
  </>);
}

// ── MAIN APP ──────────────────────────────────────────────────
function MainApp({session,sharedUsers,setSharedUsers,sharedRequests,setSharedRequests,onLogout}){
  const [cu,setCu]=useState(session.user);
  const role=cu.role;
  const [tasks,setTasks]=useState(INIT_TASKS);
  const [comments,setComs]=useState(INIT_COMMENTS);
  const [activity,setActivity]=useState(INIT_ACTIVITY);
  const [notifs,setNotifs]=useState(INIT_NOTIFS);
  const [page,setPage]=useState("dashboard");
  const [modal,setModal]=useState(null);
  const [toast,setToast]=useState(null);
  const [profileTarget,setProfileTarget]=useState(null);
  const [sidebarOpen,setSidebarOpen]=useState(false);
  const sentReminders=useRef(new Set());

  const showToast=(msg,type="success")=>{setToast({msg,type});setTimeout(()=>setToast(null),3200);};
  const pushN=(uid2,title,body,type="info")=>setNotifs(n=>[{id:uid(),user_id:uid2,title,body,type,is_read:false,created_at:now()},...n]);
  const logActivity=(request_id,task_id,action,detail)=>setActivity(a=>[{id:uid(),request_id,task_id,actor_id:cu.id,action,detail,created_at:now()},...a]);
  const myN=notifs.filter(n=>n.user_id===cu.id);
  const unread=myN.filter(n=>!n.is_read).length;
  const markRead=()=>setNotifs(n=>n.map(x=>x.user_id===cu.id?{...x,is_read:true}:x));
  const syncU=sharedUsers.find(u=>u.id===cu.id)||cu;

  // Deadline reminders
  const checkDeadlines=useCallback(()=>{
    const now2=new Date();now2.setHours(0,0,0,0);
    const tmr=new Date(now2);tmr.setDate(tmr.getDate()+1);
    const day2=new Date(tmr);day2.setDate(day2.getDate()+1);
    tasks.forEach(task=>{
      if(["done","canceled","rejected","on_hold"].includes(task.status))return;
      if(!task.designer_id)return;
      const req=sharedRequests.find(r=>r.id===task.request_id);
      if(!req?.deadline)return;
      const dl=new Date(req.deadline);dl.setHours(0,0,0,0);
      // Tomorrow reminder
      if(dl>=tmr&&dl<day2){
        const key=`dl-tmr-${task.id}`;
        if(!sentReminders.current.has(key)){
          sentReminders.current.add(key);
          pushN(task.designer_id,"⏰ Deadline tomorrow",`"${req.title}" is due tomorrow — ${fmtDate(req.deadline)}`,"deadline");
        }
      }
      // Overdue reminder (same day check, fire once)
      if(dl<now2){
        const key=`dl-ov-${task.id}`;
        if(!sentReminders.current.has(key)){
          sentReminders.current.add(key);
          const diff=Math.round((now2-dl)/(1000*60*60*24));
          pushN(task.designer_id,"🔴 Task overdue",`"${req.title}" is ${diff}d overdue — deadline was ${fmtDate(req.deadline)}`,"deadline");
        }
      }
    });
  },[tasks,sharedRequests]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{checkDeadlines();const t=setInterval(checkDeadlines,60000);return()=>clearInterval(t);},[]);

  const go=p=>{if(!allowed(role,p)){showToast("Access denied","error");return;}setPage(p);setProfileTarget(null);setSidebarOpen(false);};
  const safe=allowed(role,page)?page:"dashboard";
  const goDesignerProfile=user=>{if(!allowed(role,"team"))return;setProfileTarget(user);setPage("team");setSidebarOpen(false);};

  const handleNotifClick=(n,allTasks,allRequests)=>{
    setNotifs(ns=>ns.map(x=>x.id===n.id?{...x,is_read:true}:x));
    const matchedTask=allTasks.find(t=>{
      const req=allRequests.find(r=>r.id===t.request_id);
      return req&&(t.designer_id===cu.id||role==="lead"||role==="team_lead")&&(n.body.includes(req.title)||n.body.includes(t.task_id));
    });
    if(matchedTask)setModal({type:"task-detail",data:matchedTask});
  };

  // ── ACTIONS ──────────────────────────────────────────────────
  const approveReq=(id,wl)=>{
    if(!can(role,"approve_request"))return;
    setSharedRequests(r=>r.map(x=>x.id===id?{...x,status:"backlog",workload:wl}:x));
    logActivity(id,null,"approved",`Request approved · ${WORKLOADS.find(w=>w.value===wl)?.label||wl} workload`);
    showToast("Approved → Backlog");setModal(null);
  };
  const rejectReq=(id,reason)=>{
    if(!can(role,"reject_request"))return;
    setSharedRequests(r=>r.map(x=>x.id===id?{...x,status:"rejected",reject_reason:reason}:x));
    logActivity(id,null,"rejected",`Rejected: ${reason}`);
    showToast("Rejected","error");setModal(null);
  };
  const assignDesigners=(rid,dids)=>{
    if(!can(role,"assign_designer"))return;
    const req=sharedRequests.find(x=>x.id===rid);
    const existingTasks=tasks.filter(t=>t.request_id===rid);
    const sfxs=dids.map((_,i)=>"-"+String.fromCharCode(65+existingTasks.length+i));
    const nt=dids.map((did,i)=>{
      const t={id:uid(),task_id:genTaskId(req.request_id,sfxs[i]),request_id:rid,designer_id:did,assigned_by:cu.id,status:"assigned",points_awarded:0,accepted_at:null,completed_at:null,created_at:now(),revision_count:0,files:[]};
      const d=sharedUsers.find(u=>u.id===did);
      pushN(did,"📋 Task assigned",`You've been assigned: ${req.title}`,"task");
      logActivity(rid,t.id,"assigned",`Assigned to ${d?.name||did}`);
      return t;
    });
    setTasks(t=>[...t,...nt]);
    if(["backlog","pending"].includes(req.status))setSharedRequests(r=>r.map(x=>x.id===rid?{...x,status:"assigned"}:x));
    showToast(`Assigned to ${dids.length} person(s)`);setModal(null);
  };
  const updateStatus=(tid,ns)=>{
    // Capture task info BEFORE state update (avoid stale closure)
    const taskSnap=tasks.find(t=>t.id===tid);
    const reqSnap=sharedRequests.find(r=>r.id===taskSnap?.request_id);
    setTasks(prevTasks=>{
      const updated=prevTasks.map(x=>{
        if(x.id!==tid)return x;
        const upd={status:ns};
        if(ns==="on_progress")upd.accepted_at=now();
        if(ns==="done"&&!NO_POINT_STATUSES.includes(x.status)){
          upd.completed_at=now();
          const req=sharedRequests.find(r=>r.id===x.request_id);
          const wl=WORKLOADS.find(w=>w.value===req?.workload)||WORKLOADS[0];
          upd.points_awarded=Math.round((wl.pts[0]+wl.pts[1])/2);
          setSharedUsers(us=>us.map(u=>u.id===x.designer_id?{...u,points:u.points+upd.points_awarded}:u));
        }
        return {...x,...upd};
      });
      if(ns==="canceled"){
        const ct=prevTasks.find(t=>t.id===tid);
        if(ct){
          const rem=updated.filter(t=>t.request_id===ct.request_id&&t.id!==tid&&!["canceled","rejected","done"].includes(t.status));
          if(rem.length===0)setSharedRequests(r=>r.map(req=>req.id===ct.request_id&&!["done","rejected","pending"].includes(req.status)?{...req,status:"backlog"}:req));
        }
      }
      return updated;
    });
    if(taskSnap){
      logActivity(taskSnap.request_id,tid,"status_change",`Status → ${STATUS_LABELS[ns]}`);
      const others=[taskSnap.designer_id,taskSnap.assigned_by].filter(id=>id&&id!==cu.id);
      others.forEach(uid2=>pushN(uid2,`📌 Task updated`,`${reqSnap?.title||"Task"}: status changed to ${STATUS_LABELS[ns]}`,"status"));
    }
  };
  const acceptTask=tid=>{
    updateStatus(tid,"on_progress");
    const t=tasks.find(x=>x.id===tid);
    const req=sharedRequests.find(r=>r.id===t?.request_id);
    if(t?.assigned_by&&t.assigned_by!==cu.id)pushN(t.assigned_by,"✅ Task accepted",`${syncU.name} accepted: ${req?.title||"task"}`,"status");
    showToast("Accepted → In Progress");
  };
  const addCom=(tid,content,type="note",fileNames=[])=>{
    const entry={id:uid(),task_id:tid,author_id:cu.id,content,type,files:fileNames,created_at:now()};
    setComs(c=>[...c,entry]);
    if(type==="file")logActivity(tasks.find(t=>t.id===tid)?.request_id,tid,"file",`File uploaded: ${fileNames.join(", ")}`);
    const task=tasks.find(t=>t.id===tid);
    const recipients=new Set([task?.designer_id,task?.assigned_by].filter(Boolean));
    recipients.delete(cu.id);
    recipients.forEach(uid2=>pushN(uid2,"💬 New comment",`${syncU.name}: ${content.slice(0,60)}${content.length>60?"…":""}`,"comment"));
  };
  const requestRev=(tid,note,fileNames=[])=>{
    addCom(tid,note,"revision",fileNames);
    setTasks(t=>t.map(x=>x.id===tid?{...x,status:"revision",revision_count:(x.revision_count||0)+1}:x));
    const task=tasks.find(t=>t.id===tid);
    const req=sharedRequests.find(r=>r.id===task?.request_id);
    logActivity(task?.request_id,tid,"revision",`Revision #${(task?.revision_count||0)+1}: ${note.slice(0,60)}`);
    pushN(task?.designer_id,"🔄 Revision requested",`Revision for: ${req?.title||"Task"}`,"revision");
    showToast("Revision requested");setModal(null);
  };
  const approveTask=tid=>{
    setTasks(t=>t.map(x=>{
      if(x.id!==tid)return x;
      const req=sharedRequests.find(r=>r.id===x.request_id);
      const wl=WORKLOADS.find(w=>w.value===req?.workload)||WORKLOADS[0];
      const pts=Math.round((wl.pts[0]+wl.pts[1])/2);
      setSharedUsers(us=>us.map(u=>u.id===x.designer_id?{...u,points:u.points+pts}:u));
      setSharedRequests(r=>r.map(rr=>rr.id===req?.id?{...rr,status:"done"}:rr));
      logActivity(req?.id,tid,"approved",`Task approved · +${pts} pts awarded`);
      const d=sharedUsers.find(u=>u.id===x.designer_id);
      pushN(x.designer_id,"🎉 Task approved",`${req?.title||"Task"} completed · +${pts} pts`,"success");
      return {...x,status:"done",completed_at:now(),points_awarded:pts};
    }));
    showToast("Approved! Task closed 🎉");setModal(null);
  };
  const addUser=fd=>{if(!can(role,"add_user"))return;setSharedUsers(us=>[...us,{...fd,id:uid(),points:0,bio:"",avatar_color:T.secondary,avatar_img:""}]);showToast(`${fd.name} added`);setModal(null);};
  const removeUser=id=>{if(!can(role,"remove_user"))return;if(id===cu.id){showToast("Cannot remove yourself","error");return;}setSharedUsers(us=>us.filter(u=>u.id!==id));showToast("User removed","error");};
  const saveProfile=(id,fd)=>{if(id!==cu.id&&!can(role,"edit_any_profile"))return;setSharedUsers(us=>us.map(u=>u.id===id?{...u,...fd}:u));if(id===cu.id)setCu(c=>({...c,...fd}));showToast("Profile saved");setModal(null);};

  const NAV={
    designer:[
      {id:"dashboard",label:"Dashboard",icon:<IcoHome s={18} c="white"/>},
      {id:"my-tasks",label:"My Tasks",icon:<IcoTasks s={18} c="white"/>},
      {id:"board",label:"Kanban",icon:<IcoBoard s={18} c="white"/>},
      {id:"profile",label:"Profile",icon:<IcoUser s={18} c="white"/>},
      {id:"notifications",label:"Notifications",icon:<IcoBell s={18} c="white"/>,badge:unread},
    ],
    lead:[
      {id:"dashboard",label:"Dashboard",icon:<IcoHome s={18} c="white"/>},
      {id:"queue",label:"Incoming",icon:<IcoInbox s={18} c="white"/>,badge:sharedRequests.filter(r=>r.status==="pending").length||null},
      {id:"board",label:"Kanban",icon:<IcoBoard s={18} c="white"/>},
      {id:"team",label:"Team",icon:<IcoTeam s={18} c="white"/>},
      {id:"task-list",label:"Task List",icon:<IcoTasks s={18} c="white"/>},
      {id:"reports",label:"Reports",icon:<IcoChart s={18} c="white"/>},
      {id:"profile",label:"Profile",icon:<IcoUser s={18} c="white"/>},
      {id:"notifications",label:"Notifications",icon:<IcoBell s={18} c="white"/>,badge:unread},
    ],
    team_lead:[
      {id:"dashboard",label:"Dashboard",icon:<IcoHome s={18} c="white"/>},
      {id:"board",label:"Kanban",icon:<IcoBoard s={18} c="white"/>},
      {id:"team",label:"Team",icon:<IcoTeam s={18} c="white"/>},
      {id:"task-list",label:"Task List",icon:<IcoTasks s={18} c="white"/>},
      {id:"reports",label:"Reports",icon:<IcoChart s={18} c="white"/>},
      {id:"profile",label:"Profile",icon:<IcoUser s={18} c="white"/>},
      {id:"notifications",label:"Notifications",icon:<IcoBell s={18} c="white"/>,badge:unread},
    ],
  };
  const PAGE_TITLES={dashboard:"Dashboard",queue:"Incoming Requests",board:"Kanban Board",team:"Team",reports:"Reports","my-tasks":"My Tasks","task-list":"Task List",profile:"My Profile",notifications:"Notifications","edit-profile":"Edit Profile"};
  const allAssignable=sharedUsers.filter(u=>u.role==="designer"||(u.id===cu.id&&role==="lead"));
  const Forbidden=()=>(<div className="forbidden"><div style={{fontSize:40}}>🚫</div><div style={{fontSize:16,fontWeight:700,color:T.gray700}}>Access Denied</div></div>);

  const renderPage=()=>{
    if(!allowed(role,safe))return <Forbidden/>;
    const cp={users:sharedUsers,requests:sharedRequests,tasks,activity,setModal,go,goDesignerProfile};
    switch(safe){
      case "dashboard":    return <Dashboard cu={syncU} {...cp}/>;
      case "queue":        return can(role,"approve_request")?<IncomingRequests requests={sharedRequests.filter(r=>r.status==="pending")} setModal={setModal}/>:<Forbidden/>;
      case "board":        return can(role,"view_all_board")?<KanbanBoard {...cp} cu={syncU} role={role}/>:<Forbidden/>;
      case "team":         return can(role,"view_team")?<TeamPage {...cp} removeUser={removeUser} canEdit={can(role,"add_user")} initialProfile={profileTarget} onClearProfile={()=>setProfileTarget(null)}/>:<Forbidden/>;
      case "reports":      return can(role,"view_reports")?<Reports requests={sharedRequests} tasks={tasks} users={sharedUsers} goDesignerProfile={goDesignerProfile}/>:<Forbidden/>;
      case "my-tasks":     return <MyTasks tasks={tasks.filter(t=>t.designer_id===cu.id)} requests={sharedRequests} setModal={setModal} acceptTask={acceptTask}/>;
      case "task-list":    return can(role,"view_reports")?<AllTaskList tasks={tasks} requests={sharedRequests} users={sharedUsers} setModal={setModal} goDesignerProfile={goDesignerProfile}/>:<Forbidden/>;
      case "profile":      return <ProfilePage cu={syncU} tasks={tasks.filter(t=>t.designer_id===cu.id)} requests={sharedRequests} go={go} setModal={setModal}/>;
      case "edit-profile": return <EditProfilePage cu={syncU} onSave={fd=>saveProfile(syncU.id,fd)} go={go} role={role}/>;
      case "notifications":return <NotifPage notifs={myN} markRead={markRead} setNotifs={setNotifs} onNotifClick={n=>handleNotifClick(n,tasks,sharedRequests)}/>;
      default:             return <Forbidden/>;
    }
  };

  const notifTypeIcon={task:"📋",deadline:"⏰",revision:"🔄",comment:"💬",success:"🎉",status:"📌",info:"🔔"};

  return(<><style>{css}</style>
    <div className="app">
      {sidebarOpen&&<div className="sb-overlay" onClick={()=>setSidebarOpen(false)}/>}
      <div className={`sidebar${sidebarOpen?" open":""}`}>
        <div className="sb-brand">
          <div className="sb-logo">GD</div>
          <div><div className="sb-name">GD Tracker</div><div className="sb-sub">Design Request System</div></div>
        </div>
        <div className="sb-user" onClick={()=>go("edit-profile")}>
          <Avatar name={syncU.name} size={30} color={syncU.avatar_color||T.secondary} img={syncU.avatar_img||undefined}/>
          <div style={{flex:1,minWidth:0}}><div className="sb-uname" style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{syncU.name.split(" ")[0]}</div><div className="sb-urole">{ROLE_LABELS[role]}</div></div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#93C5FD" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </div>
        <div className="sb-section">Navigation</div>
        {(NAV[role]||[]).map(item=>(
          <div key={item.id} className={`nav-item${safe===item.id?" active":""}`} onClick={()=>go(item.id)}>
            <span style={{display:"flex",alignItems:"center",opacity:.85,flexShrink:0}}>{item.icon}</span>
            <span style={{flex:1}}>{item.label}</span>
            {item.badge>0&&<span className="nav-badge">{item.badge}</span>}
          </div>
        ))}
        <div className="sb-footer">
          <button className="sb-logout" onClick={onLogout}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Sign Out
          </button>
        </div>
      </div>

      <div className="main">
        <div className="topbar">
          <button className="topbar-btn hamburger" style={{display:"none"}} onClick={()=>setSidebarOpen(s=>!s)} aria-label="Menu">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <div className="topbar-title">{PAGE_TITLES[safe]||""}</div>
          <div style={{fontSize:11,color:T.gray400,flexShrink:0}}>{new Date().toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"})}</div>
          <div className="topbar-btn" style={{position:"relative",cursor:"pointer"}} onClick={()=>go("notifications")} title="Notifications">
            <IcoBell s={20} c={T.gray600}/>
            {unread>0&&<div style={{position:"absolute",top:2,right:2,minWidth:16,height:16,borderRadius:8,background:"#EF4444",border:"2px solid #fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,color:"#fff",lineHeight:1,padding:"0 3px"}}>{unread>9?"9+":unread}</div>}
          </div>
          <div className="topbar-av" onClick={()=>go("profile")} title="My Profile">
            {syncU.avatar_img?<img src={syncU.avatar_img} alt={syncU.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>:inits(syncU.name)}
          </div>
        </div>
        <div className="content">{renderPage()}</div>
      </div>

      {modal?.type==="approve-request"&&can(role,"approve_request")&&<ApproveModal req={modal.data} onClose={()=>setModal(null)} onApprove={approveReq} onReject={rejectReq}/>}
      {modal?.type==="assign"&&can(role,"assign_designer")&&<AssignModal req={modal.data} assignable={allAssignable} tasks={tasks} cu={cu} users={sharedUsers} onClose={()=>setModal(null)} onAssign={assignDesigners}/>}
      {modal?.type==="task-detail"&&<TaskModal task={modal.data} requests={sharedRequests} users={sharedUsers} comments={comments.filter(c=>c.task_id===modal.data.id)} activity={activity.filter(a=>a.task_id===modal.data.id)} cu={syncU} role={role} onClose={()=>setModal(null)} onStatus={updateStatus} onAccept={acceptTask} onRevision={requestRev} onApprove={approveTask} onComment={addCom} showToast={showToast} goDesignerProfile={goDesignerProfile} onAdditionalAssign={()=>setModal({type:"assign",data:sharedRequests.find(r=>r.id===modal.data.request_id)||modal.data})}/>}
      {modal?.type==="req-detail"&&<ReqDetailModal req={modal.data} tasks={tasks.filter(t=>t.request_id===modal.data.id)} users={sharedUsers} activity={activity.filter(a=>a.request_id===modal.data.id)} onClose={()=>setModal(null)}/>}
      {modal?.type==="add-user"&&can(role,"add_user")&&<AddUserModal onClose={()=>setModal(null)} onAdd={addUser}/>}
      {modal?.type==="edit-user"&&can(role,"edit_any_profile")&&<EditUserModal user={modal.data} onClose={()=>setModal(null)} onSave={fd=>saveProfile(modal.data.id,fd)}/>}

      {toast&&<div className="toast" style={{background:toast.type==="error"?"#FEF2F2":"#fff",color:toast.type==="error"?"#7F1D1D":T.gray900,border:`1px solid ${toast.type==="error"?"#FCA5A5":"#E2E8F0"}`}}>
        <span>{toast.type==="error"?"⚠":"✓"}</span>{toast.msg}
      </div>}
    </div>
  </>);
}

// ── STAT CARD ─────────────────────────────────────────────────
function StatCard({label,val,sub,sparkData,sparkColor,accent,emoji}){
  return(<div className="stat-card" style={{"--accent":accent||T.primary}}>
    <div style={{fontSize:11,color:"#7A8FA6",fontWeight:700,display:"flex",alignItems:"center",gap:5,marginBottom:6,textTransform:"uppercase",letterSpacing:".05em"}}>
      {emoji&&<span style={{fontSize:14}}>{emoji}</span>}{label}
    </div>
    <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between"}}>
      <div>
        <div style={{fontSize:30,fontWeight:900,color:T.gray900,lineHeight:1,letterSpacing:"-.8px"}}>{val}</div>
        {sub&&<div style={{fontSize:11,marginTop:6,color:"#94A3B8",fontWeight:500}}>{sub}</div>}
      </div>
      {sparkData&&<Sparkline data={sparkData} color={sparkColor||accent||T.primary}/>}
    </div>
  </div>);
}

// ── GREETING BANNER ──────────────────────────────────────────
function GreetingBanner({cu,tasks,requests,role}){
  const h=new Date().getHours();
  const greet=h<5?"Still up late,":h<12?"Good morning,":h<17?"Good afternoon,":"Good evening,";
  const dateStr=new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"});
  const myT=tasks.filter(t=>t.designer_id===cu.id&&!["done","canceled","rejected","on_hold"].includes(t.status));
  const now2=new Date();now2.setHours(0,0,0,0);
  const myOverdue=myT.filter(t=>{const req=requests.find(r=>r.id===t.request_id);return req?.deadline&&new Date(req.deadline)<now2;});
  const myDue1=myT.filter(t=>{const req=requests.find(r=>r.id===t.request_id);if(!req?.deadline)return false;const dl=new Date(req.deadline);dl.setHours(0,0,0,0);const tmr=new Date(now2);tmr.setDate(tmr.getDate()+1);return dl<=tmr;});
  const pendingReview=requests.filter(r=>r.status==="pending").length;
  const myDone=tasks.filter(t=>t.designer_id===cu.id&&t.status==="done").length;

  let headline="",detail="",mood="neutral";
  if(role==="lead"){
    if(myOverdue.length>0){headline=`${myOverdue.length} task${myOverdue.length>1?"s":""} overdue — needs your attention.`;detail="Review and follow up with the team.";mood="urgent";}
    else if(pendingReview>0){headline=`${pendingReview} new request${pendingReview>1?"s":""} waiting for your review.`;detail="Approve or assign them to keep things moving.";mood="action";}
    else{headline="All clear! The team is on track.";detail="No urgent actions right now. Good job.";mood="good";}
  } else {
    if(myOverdue.length>0){headline=`You have ${myOverdue.length} overdue task${myOverdue.length>1?"s":""}. Let's get back on track!`;detail="Open each task and update your lead on progress.";mood="urgent";}
    else if(myDue1.length>0){headline=`Deadline${myDue1.length>1?"s":""} approaching — you've got this!`;detail=`${myDue1.length} task${myDue1.length>1?"s":""} due within 24 hours. Stay focused.`;mood="action";}
    else if(myT.length===0&&myDone>0){headline="You're all done — nice work! 🎉";detail="Check back later for new assignments.";mood="good";}
    else if(myT.length>0){headline=`You have ${myT.length} active task${myT.length>1?"s":""}. Keep going!`;detail="Open a task to update progress or leave comments.";mood="neutral";}
    else{headline="No active tasks right now.";detail="Check Incoming for new assignments.";mood="neutral";}
  }
  const moodIcon=mood==="urgent"?"🔴":mood==="action"?"⚡":mood==="good"?"✅":"📋";
  const timeIcon=h<5?"🌙":h<12?"☀️":h<17?"🌤️":"🌙";
  return(
    <div className="greeting-banner" style={{marginBottom:20}}>
      <div className="gb-blob"/>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:16,position:"relative",zIndex:1}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:11,fontWeight:600,color:"rgba(255,255,255,.55)",letterSpacing:".07em",textTransform:"uppercase",marginBottom:5}}>{dateStr}</div>
          <div style={{fontSize:18,fontWeight:800,color:"#fff",letterSpacing:"-.3px",marginBottom:3,lineHeight:1.2}}>{greet} {cu.name.split(" ")[0]} {timeIcon}</div>
          <div style={{fontSize:14,color:"rgba(255,255,255,.9)",fontWeight:600,marginBottom:4,lineHeight:1.4}}>{headline}</div>
          <div style={{fontSize:12,color:"rgba(255,255,255,.6)",lineHeight:1.5}}>{detail}</div>
        </div>
        <div style={{flexShrink:0}}>
          <div style={{width:48,height:48,borderRadius:13,background:"rgba(255,255,255,.12)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,border:"1px solid rgba(255,255,255,.18)",backdropFilter:"blur(4px)"}}>
            {moodIcon}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── DAILY REMINDER CARD ───────────────────────────────────────
function DailyReminderCard({tasks,requests,users,setModal,role,cu}){
  const now2=new Date();now2.setHours(0,0,0,0);
  const tmr=new Date(now2);tmr.setDate(tmr.getDate()+1);
  const in3=new Date(now2);in3.setDate(in3.getDate()+3);
  
  // For lead: show ALL ongoing tasks with deadline issues + tasks needing attention
  // For designer: show only their tasks
  const relevantTasks=(role==="lead"?tasks:tasks.filter(t=>t.designer_id===cu.id))
    .filter(t=>!["done","canceled","rejected","on_hold"].includes(t.status));
  
  const overdue=relevantTasks.filter(t=>{
    const req=requests.find(r=>r.id===t.request_id);
    return req?.deadline&&new Date(req.deadline)<now2;
  });
  const dueToday=relevantTasks.filter(t=>{
    const req=requests.find(r=>r.id===t.request_id);
    if(!req?.deadline)return false;
    const dl=new Date(req.deadline);dl.setHours(0,0,0,0);
    return dl.getTime()===now2.getTime();
  });
  const dueTomorrow=relevantTasks.filter(t=>{
    const req=requests.find(r=>r.id===t.request_id);
    if(!req?.deadline)return false;
    const dl=new Date(req.deadline);dl.setHours(0,0,0,0);
    return dl.getTime()===tmr.getTime();
  });
  const dueIn3=relevantTasks.filter(t=>{
    const req=requests.find(r=>r.id===t.request_id);
    if(!req?.deadline)return false;
    const dl=new Date(req.deadline);dl.setHours(0,0,0,0);
    return dl>tmr&&dl<=in3;
  });
  const onReview=relevantTasks.filter(t=>t.status==="on_review");
  const inRevision=relevantTasks.filter(t=>t.status==="revision");

  const FLOW_ORDER=["assigned","on_progress","on_review","revision","done"];
  const getFlowIdx=s=>FLOW_ORDER.indexOf(s);

  if(!overdue.length&&!dueToday.length&&!dueTomorrow.length&&!dueIn3.length&&!onReview.length&&!inRevision.length)return null;

  const sections=[
    {key:"overdue",items:overdue,bg:"#FEF2F2",border:"#FCA5A5",color:"#991B1B",icon:"🔴",label:"Overdue"},
    {key:"today",items:dueToday,bg:"#FFFBEB",border:"#FCD34D",color:"#92400E",icon:"⏰",label:"Due today"},
    {key:"tomorrow",items:dueTomorrow,bg:"#FFFBEB",border:"#FDE68A",color:"#B45309",icon:"📅",label:"Due tomorrow"},
    {key:"soon",items:dueIn3,bg:"#CFFAFE",border:"#67E8F9",color:"#164E63",icon:"🗓",label:"Due in 3 days"},
    {key:"review",items:onReview,bg:"#FFEDD5",border:"#FDBA74",color:"#7C2D12",icon:"👀",label:"Awaiting review"},
    {key:"revision",items:inRevision,bg:"#FCE7F3",border:"#F9A8D4",color:"#831843",icon:"🔄",label:"In revision"},
  ].filter(s=>s.items.length>0);

  return(
    <div className="reminder-section" style={{marginBottom:20}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
        <div>
          <div style={{fontSize:13,fontWeight:800,color:T.gray900,letterSpacing:"-.2px"}}>📌 Today's Task Pulse</div>
          <div style={{fontSize:11,color:T.gray500,marginTop:2}}>{(()=>{const n=sections.reduce((a,s)=>a+s.items.length,0);return `${n} task${n!==1?"s":""}`;})()} need attention</div>
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end"}}>
          {sections.map(sec=>(
            <span key={sec.key} style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 8px",borderRadius:8,fontSize:10,fontWeight:700,background:sec.bg,color:sec.color,border:`1px solid ${sec.border}`}}>
              {sec.icon} {sec.label} · {sec.items.length}
            </span>
          ))}
        </div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {sections.map(sec=>sec.items.slice(0,role==="lead"?3:5).map(t=>{
          const req=requests.find(r=>r.id===t.request_id);
          const d=users.find(u=>u.id===t.designer_id);
          const flowIdx=getFlowIdx(t.status);
          const ds=deadlineStatus(req?.deadline);
          return(
            <div key={t.id} className="reminder-row" style={{background:sec.bg,borderColor:sec.border,color:sec.color}}
              onClick={()=>setModal({type:"task-detail",data:t})}>
              <div style={{width:32,height:32,borderRadius:8,background:"rgba(255,255,255,.7)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,flexShrink:0,border:`1px solid ${sec.border}`}}>
                {sec.icon}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3,flexWrap:"wrap"}}>
                  <span style={{fontSize:13,fontWeight:700,color:"#1E293B",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:260}}>{req?.title||"—"}</span>
                  {role==="lead"&&d&&<div style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:"#64748B",flexShrink:0}}><Avatar name={d.name} size={14} fontSize={6} color={d.avatar_color||"#1D6FBB"} img={d.avatar_img||undefined}/>{d.name.split(" ")[0]}</div>}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                  {/* Flow strip */}
                  <div className="flow-strip">
                    {FLOW_ORDER.slice(0,5).map((st,i)=>(
                      <div key={st} style={{display:"flex",alignItems:"center"}}>
                        {i>0&&<div className={`flow-edge${i<=flowIdx?" done":""}`}/>}
                        <div className={`flow-node${i<flowIdx?" done":i===flowIdx?" active":""}`} title={STATUS_LABELS[st]}/>
                      </div>
                    ))}
                    <span style={{fontSize:10,marginLeft:6,fontWeight:700,color:sec.color}}>{STATUS_LABELS[t.status]}</span>
                  </div>
                  {ds&&<span style={{fontSize:10,fontWeight:700,color:ds.color}}>⏱ {ds.label}</span>}
                  {!ds&&req?.deadline&&<span style={{fontSize:10,color:"#94A3B8"}}>Due {fmtDate(req.deadline)}</span>}
                </div>
              </div>
              <div style={{flexShrink:0,fontSize:11,fontWeight:700,color:sec.color,opacity:.8}}>Open →</div>
            </div>
          );
        }))}
      </div>
      {sections.some(s=>s.items.length>( role==="lead"?3:5))&&
        <div style={{textAlign:"center",marginTop:10,fontSize:11,color:T.gray400,fontWeight:600}}>
          Scroll My Tasks to see all
        </div>
      }
    </div>
  );
}

// ── QUICK ACTIONS ─────────────────────────────────────────────
function QuickActions({role,go,pending,backlogCount}){
  const actions={
    lead:[
      {icon:"⏳",label:"Review Requests",sub:pending>0?`${pending} waiting`:"All clear",color:"#FEF3C7",page:"queue",accent:"#B45309",urgent:pending>0},
      {icon:"🎯",label:"Assign Tasks",sub:backlogCount>0?`${backlogCount} in backlog`:"Nothing pending",color:"#EDE9FE",page:"board",accent:"#7C3AED",urgent:backlogCount>0},
      {icon:"👥",label:"Team",sub:"Workload & profiles",color:"#DCFCE7",page:"team",accent:"#15803D"},
      {icon:"📊",label:"Reports",sub:"Stats & performance",color:"#DBEAFE",page:"reports",accent:"#0857C3"},
    ],
    designer:[
      {icon:"📋",label:"My Tasks",sub:"All your assignments",color:"#DBEAFE",page:"my-tasks",accent:"#0857C3"},
      {icon:"🗂",label:"Kanban",sub:"See task flow",color:"#EDE9FE",page:"board",accent:"#7C3AED"},
      {icon:"🔔",label:"Notifications",sub:"Updates & reminders",color:"#FEF3C7",page:"notifications",accent:"#B45309"},
      {icon:"👤",label:"Profile",sub:"Your info",color:"#DCFCE7",page:"profile",accent:"#15803D"},
    ],
  };
  const items=actions[role]||[];
  if(!items.length)return null;
  return(
    <div className="quick-strip" style={{marginBottom:20}}>
      {items.map(a=>(
        <button key={a.page} className="quick-btn" onClick={()=>go(a.page)} style={{position:"relative"}}>
          {a.urgent&&<div style={{position:"absolute",top:8,right:8,width:7,height:7,borderRadius:"50%",background:"#EF4444",boxShadow:"0 0 0 2px #fff"}}/>}
          <span className="qb-icon" style={{background:a.color}}>{a.icon}</span>
          <div style={{minWidth:0,flex:1}}>
            <div style={{fontWeight:700,fontSize:12,color:"#1E293B",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.label}</div>
            <div style={{fontSize:10,color:a.urgent?"#B45309":"#94A3B8",marginTop:1,fontWeight:a.urgent?700:400}}>{a.sub}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

// ── DASHBOARD ─────────────────────────────────────────────────
function Dashboard({cu,requests,tasks,users,setModal,go,goDesignerProfile}){
  const designers=users.filter(u=>u.role==="designer");
  const pending=requests.filter(r=>r.status==="pending");
  const activeCnt=tasks.filter(t=>!["done","rejected","canceled","on_hold"].includes(t.status)).length;
  const doneCnt=tasks.filter(t=>t.status==="done").length;
  const overdue=requests.filter(r=>!["done","rejected","canceled"].includes(r.status)&&r.deadline&&new Date(r.deadline)<new Date()).length;

  if(cu.role==="lead"){
  const leadPts=users.filter(u=>u.role==="designer").reduce((a,u)=>a+u.points,0);
  const backlogCount=requests.filter(r=>r.status==="backlog").length;
  return(
    <div>
      <GreetingBanner cu={cu} tasks={tasks} requests={requests} role="lead"/>
      <QuickActions role="lead" go={go} pending={pending.length} backlogCount={backlogCount}/>
      <div className="g4" style={{marginBottom:20}}>
        <StatCard label="Points Awarded" val={leadPts} sub="Team total" sparkData={[10,20,32,45,60,78,leadPts]} accent={T.primary} emoji="⭐"/>
        <StatCard label="Pending Review" val={pending.length} sub={pending.length>0?"Needs attention":"All clear"} sparkData={[4,3,5,2,4,3,pending.length]} accent={T.amber600} emoji="⏳"/>
        <StatCard label="Active Tasks"   val={activeCnt} sub={`${overdue} overdue`} sparkData={[2,4,3,6,5,7,activeCnt]} accent={T.secondary} emoji="⚡"/>
        <StatCard label="Completed"      val={doneCnt} sub="All time" sparkData={[1,2,3,2,4,5,doneCnt]} accent={T.green600} emoji="✅"/>
      </div>
      <DailyReminderCard tasks={tasks} requests={requests} users={users} setModal={setModal} role="lead" cu={cu}/>
      <div className="g2">
        <div className="card lift" style={{border:`1px solid ${T.gray200}`}}>
          <div className="sh"><div className="st">📥 Pending Review</div>{pending.length>0&&<button className="btn btn-xs btn-outline" onClick={()=>go("queue")}>View all</button>}</div>
          {pending.length===0&&<Empty icon="✅" text="All caught up!" sub="No pending requests"/>}
          {pending.slice(0,5).map(r=>(
            <div key={r.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:`1px solid ${T.gray100}`}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:600,color:T.gray800,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.title}</div>
                <div style={{fontSize:11,color:T.gray500,marginTop:2}}>{r.applicant_name} · {r.design_type} · {fmtDate(r.deadline)}</div>
              </div>
              <PriorityBadge priority={r.priority}/>
              <button className="btn btn-xs btn-primary" onClick={()=>setModal({type:"approve-request",data:r})}>Review</button>
            </div>
          ))}
        </div>
        <div className="card lift" style={{border:`1px solid ${T.gray200}`}}>
          <div className="sh"><div className="st">🏆 Designer Leaderboard</div></div>
          {designers.length===0&&<Empty icon="👤" text="No designers yet"/>}
          {[...designers].sort((a,b)=>b.points-a.points).map((d,i)=>{
            const dTasks=tasks.filter(t=>t.designer_id===d.id);
            const active=dTasks.filter(t=>!["done","canceled","rejected"].includes(t.status)).length;
            return(<div key={d.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:`1px solid ${T.gray100}`}}>
              <div style={{width:20,fontSize:13,fontWeight:700,color:i<3?T.primary:T.gray400,textAlign:"center"}}>#{i+1}</div>
              <Avatar name={d.name} size={28} color={d.avatar_color||T.secondary} img={d.avatar_img||undefined}/>
              <div style={{flex:1,minWidth:0}}>
                <DesignerLink user={d} onNavigate={goDesignerProfile} style={{fontSize:13}}/>
                <WorkloadBar active={active} pts={d.points}/>
              </div>
              <div style={{fontSize:14,fontWeight:800,color:T.primary}}>{d.points}<span style={{fontSize:10,color:T.gray400,fontWeight:400}}>pts</span></div>
            </div>);
          })}
        </div>
      </div>
    </div>
  );}

  if(cu.role==="team_lead"){
    const activeCnt2=tasks.filter(t=>!["done","rejected","canceled","on_hold"].includes(t.status)).length;
    return(
      <div>
        <div className="ph"><div><div className="pt">Team Lead Overview</div><div className="pd">Monitor team performance and progress.</div></div></div>
        <div className="g4" style={{marginBottom:20}}>
          <StatCard label="Total Requests" val={requests.length} sub={`${doneCnt} done`} sparkData={[3,5,4,7,6,8,requests.length]} accent={T.primary} emoji="📁"/>
          <StatCard label="Active Tasks"   val={activeCnt2} sub={`${overdue} overdue`} sparkData={[2,4,3,6,5,7,activeCnt2]} accent={T.secondary} emoji="⚡"/>
          <StatCard label="Completed"      val={doneCnt} sub="All time" sparkData={[1,2,3,2,4,5,doneCnt]} accent={T.green600} emoji="✅"/>
          <StatCard label="Designers"      val={designers.length} sub="Active team" accent={T.highlight} emoji="🎨"/>
        </div>
        <div className="g2">
          <div className="card">
            <div className="sh"><div className="st">🏆 Leaderboard</div></div>
            {[...designers].sort((a,b)=>b.points-a.points).map((d,i)=>{
              const active=tasks.filter(t=>t.designer_id===d.id&&!["done","canceled","rejected"].includes(t.status)).length;
              return(<div key={d.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:`1px solid ${T.gray100}`}}>
                <div style={{width:20,fontSize:12,fontWeight:700,color:i<3?T.primary:T.gray400,textAlign:"center"}}>#{i+1}</div>
                <Avatar name={d.name} size={28} color={d.avatar_color||T.secondary} img={d.avatar_img||undefined}/>
                <div style={{flex:1,minWidth:0}}>
                  <DesignerLink user={d} onNavigate={goDesignerProfile} style={{fontSize:13}}/>
                  <WorkloadBar active={active} pts={d.points}/>
                </div>
                <div style={{fontSize:14,fontWeight:800,color:T.primary}}>{d.points}<span style={{fontSize:10,color:T.gray400,fontWeight:400}}>pts</span></div>
              </div>);
            })}
          </div>
          <div className="card">
            <div className="sh"><div className="st">📊 Status Overview</div></div>
            {KANBAN_COLS.filter(sk=>requests.filter(r=>r.status===sk).length>0).map(sk=>{
              const cnt=requests.filter(r=>r.status===sk).length;
              const sc=STATUS_COLOR[sk];
              return(<div key={sk} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`1px solid ${T.gray100}`}}>
                <span style={{width:8,height:8,borderRadius:"50%",background:sc?.dot||T.gray400,flexShrink:0}}/>
                <span style={{flex:1,fontSize:13,color:T.gray700}}>{STATUS_LABELS[sk]}</span>
                <span style={{fontWeight:700,fontSize:13,color:T.gray900}}>{cnt}</span>
                <div style={{width:60}}><div className="pb-t"><div className="pb-f" style={{width:`${(cnt/requests.length)*100}%`,background:sc?.dot||T.gray400}}/></div></div>
              </div>);
            })}
          </div>
        </div>
      </div>
    );
  }

  // Designer dashboard
  const myT=tasks.filter(t=>t.designer_id===cu.id);
  const myActive=myT.filter(t=>!["done","assigned","on_hold","canceled"].includes(t.status));
  const pendingAccept=myT.filter(t=>t.status==="assigned");
  const myDone=myT.filter(t=>t.status==="done");
  const urgentTasks=myT.filter(t=>!["done","canceled","rejected","on_hold"].includes(t.status)&&t.request_id).filter(t=>{
    const req=requests.find(r=>r.id===t.request_id);
    const ds=deadlineStatus(req?.deadline);
    return ds&&ds.color==="#DC2626";
  });
  return(
    <div>
      <GreetingBanner cu={cu} tasks={myT} requests={requests} role="designer"/>
      <QuickActions role="designer" go={go} pending={0} backlogCount={0}/>
      <div className="g4" style={{marginBottom:20}}>
        <StatCard label="To Accept" val={pendingAccept.length} sub="New assignments" sparkData={[1,2,1,3,2,2,pendingAccept.length]} accent={T.amber600} emoji="📬"/>
        <StatCard label="In Progress" val={myActive.length} sub="Active work" sparkData={[1,2,1,3,2,3,myActive.length]} accent={T.secondary} emoji="⚡"/>
        <StatCard label="Completed" val={myDone.length} sub="All time" sparkData={[0,1,2,1,3,2,myDone.length]} accent={T.green600} emoji="✅"/>
        <StatCard label="Total Requests" val={requests.length} sub={`${requests.filter(r=>r.status==="done").length} done`} sparkData={[1,2,3,4,5,6,requests.length]} accent={T.primary} emoji="📁"/>
      </div>
      <DailyReminderCard tasks={myT} requests={requests} users={users} setModal={setModal} role="designer" cu={cu}/>
      {pendingAccept.length>0&&<div className="card" style={{marginBottom:16,border:`1.5px solid #FCD34D`,background:"#FFFBEB"}}>
        <div className="sh"><div className="st" style={{color:T.amber700}}>📬 Waiting for your response</div></div>
        {pendingAccept.map(t=>{const req=requests.find(r=>r.id===t.request_id);return(
          <div key={t.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:`1px solid rgba(0,0,0,.04)`}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:600,color:T.gray900,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{req?.title}</div>
              <div style={{display:"flex",gap:8,marginTop:4,flexWrap:"wrap"}}>
                <PriorityBadge priority={req?.priority}/>
                <DeadlineBadge deadline={req?.deadline} status={t.status}/>
              </div>
            </div>
            <button className="btn btn-sm btn-primary" onClick={()=>setModal({type:"task-detail",data:t})}>Accept</button>
          </div>
        );})}
      </div>}
      <div className="card lift" style={{border:`1px solid ${T.gray200}`}}>
        <div className="sh"><div className="st">Active Tasks</div><button className="btn btn-xs btn-outline" onClick={()=>go("my-tasks")}>All tasks</button></div>
        {myT.filter(t=>!["done","canceled","on_hold","assigned"].includes(t.status)).length===0&&<Empty icon="🎉" text="You're all clear!" sub="No active tasks right now — accept new assignments above"/>}
        {myT.filter(t=>!["done","canceled","on_hold","assigned"].includes(t.status)).map(t=>{const req=requests.find(r=>r.id===t.request_id);return(
          <div key={t.id} className="lift" style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:`1px solid ${T.gray100}`,cursor:"pointer",borderRadius:8,margin:"0 -4px",paddingLeft:4,paddingRight:4}} onClick={()=>setModal({type:"task-detail",data:t})}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:600,color:T.gray900,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{req?.title}</div>
              <div style={{display:"flex",gap:8,marginTop:4,flexWrap:"wrap"}}>
                <StatusBadge status={t.status}/>
                <DeadlineBadge deadline={req?.deadline} status={t.status}/>
              </div>
            </div>
            <button className="btn btn-xs btn-outline" onClick={e=>{e.stopPropagation();setModal({type:"task-detail",data:t});}}>Open</button>
          </div>
        );})}
      </div>
    </div>
  );
}

// ── INCOMING REQUESTS ─────────────────────────────────────────
function IncomingRequests({requests,setModal}){
  const [search,setSearch]=useState("");const [sort,setSort]=useState("newest");
  const filtered=requests.filter(r=>!search.trim()||r.title.toLowerCase().includes(search.toLowerCase())||r.applicant_name.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b)=>{
      if(sort==="newest")return new Date(b.created_at)-new Date(a.created_at);
      if(sort==="priority"){const o={High:0,Medium:1,Low:2};return(o[a.priority]??9)-(o[b.priority]??9);}
      if(sort==="deadline")return new Date(a.deadline||0)-new Date(b.deadline||0);
      return 0;
    });
  return(
    <div>
      <div className="ph">
        <div><div className="pt">Incoming Requests</div><div className="pd">{requests.length} pending submissions</div></div>
        <div className="ph-actions">
          <div className="search-box"><IcoSearch s={14} c={T.gray400}/><input className="fi" style={{paddingLeft:34}} placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
          <select className="fi" style={{width:130}} value={sort} onChange={e=>setSort(e.target.value)}>
            <option value="newest">Newest</option><option value="priority">Priority</option><option value="deadline">Deadline</option>
          </select>
        </div>
      </div>
      {filtered.length===0&&<div className="card"><Empty icon="🎉" text="All caught up!" sub="No pending requests"/></div>}
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {filtered.map(r=>{
          const ds=deadlineStatus(r.deadline);
          return(
            <div key={r.id} className="card">
              <div style={{display:"flex",alignItems:"flex-start",gap:14}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,flexWrap:"wrap"}}>
                    <span style={{fontFamily:"monospace",fontSize:10,color:T.gray400}}>{r.request_id}</span>
                    <PriorityBadge priority={r.priority}/>
                    {ds&&<DeadlineBadge deadline={r.deadline} status={r.status}/>}
                    {r.source==="public_form"&&<span className="tag">📋 Public Form</span>}
                  </div>
                  <div style={{fontWeight:700,fontSize:15,color:T.gray900,marginBottom:6}}>{r.title}</div>
                  <div className="ir" style={{marginBottom:0}}>
                    <span className="ii">From: <b>{r.applicant_name}</b></span>
                    <span className="ii">Div: <b>{r.department}</b></span>
                    <span className="ii">Type: <b>{r.design_type}</b></span>
                    <span className="ii">Deadline: <b>{fmtDate(r.deadline)}</b></span>
                  </div>
                  {r.description&&<div style={{marginTop:10,fontSize:12,color:T.gray700,lineHeight:1.5,background:T.gray50,borderRadius:8,padding:"8px 12px",border:`1px solid ${T.gray100}`}}>{r.description.slice(0,160)}{r.description.length>160?"…":""}</div>}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6,flexShrink:0}}>
                  <button className="btn btn-sm btn-primary" onClick={()=>setModal({type:"approve-request",data:r})}>Review</button>
                  <button className="btn btn-sm btn-outline" onClick={()=>setModal({type:"req-detail",data:r})}>Details</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── KANBAN BOARD ──────────────────────────────────────────────
function KanbanBoard({requests,tasks,users,setModal,cu,role,goDesignerProfile}){
  const [search,setSearch]=useState("");const [filterDesigner,setFilterDesigner]=useState(role==="designer"?cu.id:"all");
  const designers=users.filter(u=>u.role==="designer");
  const backlogReqs=requests.filter(r=>r.status==="backlog");
  const DOT_COL={backlog:"#06B6D4",assigned:"#8B5CF6",on_progress:"#EAB308",on_review:"#F97316",revision:"#EC4899",on_hold:"#8B5CF6",canceled:"#94A3B8",done:"#22C55E"};
  const filteredTasks=tasks.filter(t=>{
    if(filterDesigner!=="all"&&t.designer_id!==filterDesigner)return false;
    if(search.trim()){const req=requests.find(r=>r.id===t.request_id);return(req?.title||"").toLowerCase().includes(search.toLowerCase())||t.task_id.toLowerCase().includes(search.toLowerCase());}
    return true;
  });
  return(
    <div>
      <div className="ph">
        <div><div className="pt">Kanban Board</div><div className="pd">{tasks.length} total tasks across all columns</div></div>
        <div className="ph-actions">
          <div className="search-box"><IcoSearch s={14} c={T.gray400}/><input className="fi" style={{paddingLeft:34,width:180}} placeholder="Search tasks…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
          {role!=="designer"&&<select className="fi" style={{width:140}} value={filterDesigner} onChange={e=>setFilterDesigner(e.target.value)}>
            <option value="all">All designers</option>
            {designers.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
          </select>}
        </div>
      </div>
      {backlogReqs.length>0&&role!=="designer"&&<div className="card" style={{marginBottom:16}}>
        <div className="sh"><div className="st"><span style={{width:8,height:8,borderRadius:"50%",background:"#06B6D4",display:"inline-block"}}/> Backlog — Awaiting Assignment</div><span className="tag">{backlogReqs.length} requests</span></div>
        {backlogReqs.map(r=>(
          <div key={r.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:`1px solid ${T.gray100}`}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:600,color:T.gray800,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.title}</div>
              <div style={{fontSize:11,color:T.gray500,marginTop:2,display:"flex",gap:8,flexWrap:"wrap"}}>
                <span>{r.request_id}</span><span>·</span><span>{r.design_type}</span><span>·</span><span style={{fontWeight:600,color:T.gray700}}>{r.workload} workload</span>
                {deadlineStatus(r.deadline)&&<DeadlineBadge deadline={r.deadline} status={r.status}/>}
              </div>
            </div>
            <PriorityBadge priority={r.priority}/>
            {role==="lead"&&<button className="btn btn-sm btn-primary" onClick={()=>setModal({type:"assign",data:r})}>Assign</button>}
          </div>
        ))}
      </div>}
      <div className="kanban">
        {KANBAN_COLS.map(col=>{
          const ct=filteredTasks.filter(t=>t.status===col);
          return(
            <div key={col} className="kcol">
              <div className="kch"><span className="kcd" style={{background:DOT_COL[col]||T.gray400}}/>{STATUS_LABELS[col]}<span className="kcc">{ct.length}</span></div>
              {ct.map(t=>{
                const req=requests.find(r=>r.id===t.request_id);
                const d=users.find(u=>u.id===t.designer_id);
                const ds=deadlineStatus(req?.deadline);
                return(
                  <div key={t.id} className="tc" onClick={()=>setModal({type:"task-detail",data:t})}>
                    <div className="tc-id">{t.task_id}</div>
                    <div className="tc-title">{req?.title}</div>
                    {ds&&<div style={{fontSize:10,color:ds.color,fontWeight:600,marginBottom:4}}>⏱ {ds.label}</div>}
                    <div className="tc-foot">
                      {req&&<PriorityBadge priority={req.priority}/>}
                      {t.revision_count>0&&<span className="tag" style={{fontSize:10,background:"#FEF2F2",color:"#991B1B",borderColor:"#FCA5A5"}}>R×{t.revision_count}</span>}
                      {d&&<span style={{fontSize:10,color:T.primary,marginLeft:"auto",fontWeight:600}}>{d.name.split(" ")[0]}</span>}
                    </div>
                  </div>
                );
              })}
              {ct.length===0&&<div style={{fontSize:11,color:T.gray400,textAlign:"center",padding:"16px 0",fontStyle:"italic"}}>Empty</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── MY TASKS ──────────────────────────────────────────────────
function MyTasks({tasks,requests,setModal,acceptTask}){
  const [filter,setFilter]=useState("active");const [search,setSearch]=useState("");const [sort,setSort]=useState("deadline");
  const groups={active:["assigned","on_progress","on_review","revision"],all:[...KANBAN_COLS],done:["done"]};
  const filtered=tasks.filter(t=>{
    const req=requests.find(r=>r.id===t.request_id);
    const inGroup=filter==="active"?["assigned","on_progress","on_review","revision","on_hold"].includes(t.status):filter==="done"?t.status==="done":true;
    if(!inGroup)return false;
    if(search.trim())return(req?.title||"").toLowerCase().includes(search.toLowerCase())||t.task_id.toLowerCase().includes(search.toLowerCase());
    return true;
  }).sort((a,b)=>{
    const ra=requests.find(r=>r.id===a.request_id);const rb=requests.find(r=>r.id===b.request_id);
    if(sort==="deadline")return new Date(ra?.deadline||0)-new Date(rb?.deadline||0);
    if(sort==="priority"){const o={High:0,Medium:1,Low:2};return(o[ra?.priority]??9)-(o[rb?.priority]??9);}
    if(sort==="newest")return new Date(b.created_at)-new Date(a.created_at);
    return 0;
  });
  return(
    <div>
      <div className="ph"><div className="pt">My Tasks</div></div>
      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
        <div className="tabs" style={{marginBottom:0,flex:"none"}}>
          <div className={`tab${filter==="active"?" active":""}`} onClick={()=>setFilter("active")}>Active</div>
          <div className={`tab${filter==="all"?" active":""}`} onClick={()=>setFilter("all")}>All</div>
          <div className={`tab${filter==="done"?" active":""}`} onClick={()=>setFilter("done")}>Done</div>
        </div>
        <div className="search-box" style={{flex:1,minWidth:160}}><IcoSearch s={14} c={T.gray400}/><input className="fi" style={{paddingLeft:34,height:34,width:"100%"}} placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
        <select className="fi" style={{width:130,height:34}} value={sort} onChange={e=>setSort(e.target.value)}>
          <option value="deadline">By deadline</option><option value="priority">By priority</option><option value="newest">Newest first</option>
        </select>
      </div>
      {filtered.length===0&&<div className="card"><Empty icon={search?"🔍":"✨"} text={search?"No matching tasks":"No tasks here"}/></div>}
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {filtered.map(t=>{const req=requests.find(r=>r.id===t.request_id);return(
          <div key={t.id} className="card card-hover" style={{cursor:"pointer"}} onClick={()=>setModal({type:"task-detail",data:t})}>
            <div style={{display:"flex",alignItems:"flex-start",gap:14}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontFamily:"monospace",fontSize:10,color:T.gray400,marginBottom:3}}>{t.task_id}</div>
                <div style={{fontWeight:700,fontSize:14,color:T.gray900,marginBottom:6,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{req?.title}</div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:6}}>
                  <StatusBadge status={t.status}/>
                  <PriorityBadge priority={req?.priority}/>
                  <DeadlineBadge deadline={req?.deadline} status={t.status}/>
                  {t.revision_count>0&&<span className="tag" style={{background:"#FEF2F2",color:"#991B1B",borderColor:"#FCA5A5",fontSize:10}}>🔄 {t.revision_count} revision{t.revision_count>1?"s":""}</span>}
                </div>
                <div style={{fontSize:11,color:T.gray500}}>
                  {req?.design_type} · {req?.workload||"—"} workload · Due {fmtDate(req?.deadline)}
                  {req?.applicant_name&&<span> · From {req.applicant_name}</span>}
                </div>
              </div>
              <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                {t.status==="assigned"&&<button className="btn btn-sm btn-primary" onClick={e=>{e.stopPropagation();acceptTask(t.id);}}>Accept</button>}
                <button className="btn btn-sm btn-outline" onClick={e=>{e.stopPropagation();setModal({type:"task-detail",data:t});}}>Open</button>
              </div>
            </div>
          </div>
        );})}
      </div>
    </div>
  );
}

// ── ALL TASK LIST ─────────────────────────────────────────────
function AllTaskList({tasks,requests,users,setModal,goDesignerProfile}){
  const [search,setSearch]=useState("");const [filterStatus,setFilterStatus]=useState("all");
  const [filterDesigner,setFilterDesigner]=useState("all");const [sort,setSort]=useState("deadline");
  const designers=users.filter(u=>u.role==="designer");
  const filtered=tasks.filter(t=>{
    if(filterStatus!=="all"&&t.status!==filterStatus)return false;
    if(filterDesigner!=="all"&&t.designer_id!==filterDesigner)return false;
    if(search.trim()){const req=requests.find(r=>r.id===t.request_id);return(req?.title||"").toLowerCase().includes(search.toLowerCase())||t.task_id.toLowerCase().includes(search.toLowerCase());}
    return true;
  }).sort((a,b)=>{
    const ra=requests.find(r=>r.id===a.request_id);const rb=requests.find(r=>r.id===b.request_id);
    if(sort==="deadline")return new Date(ra?.deadline||0)-new Date(rb?.deadline||0);
    if(sort==="newest")return new Date(b.created_at)-new Date(a.created_at);
    if(sort==="priority"){const o={High:0,Medium:1,Low:2};return(o[ra?.priority]??9)-(o[rb?.priority]??9);}
    return 0;
  });
  return(
    <div>
      <div className="ph"><div><div className="pt">Task List</div><div className="pd">{tasks.length} total tasks</div></div></div>
      <div className="filter-bar">
        <div className="search-box" style={{flex:1,minWidth:180}}><IcoSearch s={14} c={T.gray400}/><input className="fi" style={{paddingLeft:34,height:34,width:"100%"}} placeholder="Search tasks or title…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
        <select className="fi" style={{width:140,height:34}} value={filterDesigner} onChange={e=>setFilterDesigner(e.target.value)}>
          <option value="all">All designers</option>{designers.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select className="fi" style={{width:140,height:34}} value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
          <option value="all">All statuses</option>{KANBAN_COLS.map(sk=><option key={sk} value={sk}>{STATUS_LABELS[sk]}</option>)}
        </select>
        <select className="fi" style={{width:130,height:34}} value={sort} onChange={e=>setSort(e.target.value)}>
          <option value="deadline">📅 Deadline</option><option value="newest">↓ Newest</option><option value="priority">🔴 Priority</option>
        </select>
      </div>
      <div className="tw">
        <table className="tbl">
          <thead><tr><th>Task ID</th><th>Title</th><th>Designer</th><th>Type</th><th>Priority</th><th>Deadline</th><th>Status</th></tr></thead>
          <tbody>
            {filtered.map(t=>{
              const req=requests.find(r=>r.id===t.request_id);
              const d=users.find(u=>u.id===t.designer_id);
              const ds=deadlineStatus(req?.deadline);
              return(
                <tr key={t.id} onClick={()=>setModal({type:"task-detail",data:t})}>
                  <td style={{fontFamily:"monospace",fontSize:11,color:T.gray500}}>{t.task_id}</td>
                  <td>
                    <div style={{fontWeight:600,color:T.gray900,fontSize:13}}>{req?.title||"—"}</div>
                    {t.revision_count>0&&<span style={{fontSize:10,color:"#991B1B",fontWeight:600}}>🔄 {t.revision_count} revision{t.revision_count>1?"s":""}</span>}
                  </td>
                  <td>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <Avatar name={d?.name||"?"} size={24} fontSize={10} color={d?.avatar_color||T.secondary} img={d?.avatar_img||undefined}/>
                      <DesignerLink user={d} onNavigate={goDesignerProfile} style={{fontSize:13}}/>
                    </div>
                  </td>
                  <td style={{fontSize:12,color:T.gray600}}>{req?.design_type||"—"}</td>
                  <td>{req?.priority&&<PriorityBadge priority={req.priority}/>}</td>
                  <td>
                    <div style={{fontSize:12,color:T.gray600}}>{fmtDate(req?.deadline)}</div>
                    {ds&&<div style={{fontSize:10,color:ds.color,fontWeight:600}}>{ds.label}</div>}
                  </td>
                  <td><StatusBadge status={t.status}/></td>
                </tr>
              );
            })}
            {filtered.length===0&&<tr><td colSpan={7}><Empty icon="🔍" text="No tasks found"/></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── TEAM PAGE ─────────────────────────────────────────────────
function TeamPage({users,tasks,requests,setModal,removeUser,canEdit=false,goDesignerProfile,initialProfile,onClearProfile}){
  const [tab,setTab]=useState("designers");const [selected,setSelected]=useState(initialProfile||null);
  const [filterRole,setFilterRole]=useState("all");const [search,setSearch]=useState("");
  const designers=users.filter(u=>u.role==="designer");
  const openProfile=u=>setSelected(users.find(x=>x.id===u.id)||u);

  if(selected){
    const d=selected;
    const dt=tasks.filter(t=>t.designer_id===d.id);
    const active=dt.filter(t=>!["done","canceled","rejected"].includes(t.status));
    const done=dt.filter(t=>t.status==="done");
    const revisions=dt.reduce((a,t)=>a+(t.revision_count||0),0);
    return(
      <div>
        <div className="ph">
          <div style={{display:"flex",alignItems:"center",gap:10}}><button className="btn btn-sm" onClick={()=>setSelected(null)}>← Back</button><div className="pt">Designer Profile</div></div>
          {canEdit&&<div className="ph-actions"><button className="btn btn-sm btn-outline" onClick={()=>setModal({type:"edit-user",data:d})}>✎ Edit</button><button className="btn btn-sm btn-ghost-red" onClick={()=>{removeUser(d.id);setSelected(null);}}>Remove</button></div>}
        </div>
        <div className="card" style={{marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",gap:18,marginBottom:18}}>
            <Avatar name={d.name} size={64} fontSize={22} color={d.avatar_color||T.secondary} img={d.avatar_img||undefined}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:20,fontWeight:800,color:T.gray900,letterSpacing:"-.3px"}}>{d.name}</div>
              <div style={{fontSize:13,color:T.gray600,marginTop:3}}>{ROLE_LABELS[d.role]} · {d.department}</div>
              <div style={{fontSize:12,color:T.gray500,marginTop:2}}>{d.email}{d.phone&&" · "+d.phone}</div>
              {d.bio&&<div style={{fontSize:13,color:T.gray700,marginTop:8,lineHeight:1.6}}>{d.bio}</div>}
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:32,fontWeight:800,color:T.primary,letterSpacing:"-.5px"}}>{d.points}</div>
              <div style={{fontSize:11,color:T.gray500}}>total points</div>
            </div>
          </div>
          <div className="g4">
            {[{l:"Total Tasks",v:dt.length,e:"📋"},{l:"Active",v:active.length,e:"⚡"},{l:"Completed",v:done.length,e:"✅"},{l:"Revisions",v:revisions,e:"🔄"}].map(x=>(
              <div key={x.l} style={{background:T.gray50,borderRadius:10,padding:"12px 14px",border:`1px solid ${T.gray100}`}}>
                <div style={{fontSize:11,color:T.gray500,fontWeight:600,marginBottom:4}}>{x.e} {x.l}</div>
                <div style={{fontSize:22,fontWeight:800,color:T.gray900}}>{x.v}</div>
              </div>
            ))}
          </div>
          {active.length>0&&<div style={{marginTop:14}}><WorkloadBar active={active.length} capacity={10} pts={d.points}/></div>}
        </div>
        <div className="g2">
          <div className="card">
            <div className="sh"><div className="st">Active Tasks ({active.length})</div></div>
            {active.length===0&&<Empty icon="✅" text="No active tasks"/>}
            {active.map(t=>{const req=requests.find(r=>r.id===t.request_id);return(
              <div key={t.id} style={{padding:"10px 0",borderBottom:`1px solid ${T.gray100}`,cursor:"pointer"}} onClick={()=>setModal({type:"task-detail",data:t})}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                  <div style={{flex:1,fontSize:13,fontWeight:600,color:T.primary,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{req?.title||"—"}</div>
                  <StatusBadge status={t.status}/>
                </div>
                <div style={{display:"flex",gap:8,fontSize:11,color:T.gray500,flexWrap:"wrap"}}>
                  <span style={{fontFamily:"monospace"}}>{t.task_id}</span>
                  {req&&<><span>·</span><span>{req.design_type}</span><span>·</span><span>Due {fmtDate(req.deadline)}</span></>}
                  {t.revision_count>0&&<span style={{color:"#991B1B",fontWeight:600}}>· R×{t.revision_count}</span>}
                  <DeadlineBadge deadline={req?.deadline} status={t.status}/>
                </div>
              </div>
            );})}
          </div>
          <div className="card">
            <div className="sh"><div className="st">Completed ({done.length})</div></div>
            {done.length===0&&<Empty icon="📝" text="No completed tasks yet"/>}
            {done.map(t=>{const req=requests.find(r=>r.id===t.request_id);return(
              <div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 0",borderBottom:`1px solid ${T.gray100}`,cursor:"pointer"}} onClick={()=>setModal({type:"task-detail",data:t})}>
                <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:500,color:T.gray700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{req?.title||"—"}</div><div style={{fontSize:10,color:T.gray400,marginTop:2,fontFamily:"monospace"}}>{t.task_id}</div></div>
                <StatusBadge status={t.status}/>
                {t.points_awarded>0&&<span style={{fontSize:12,color:T.primary,fontWeight:700,flexShrink:0}}>+{t.points_awarded}pt</span>}
              </div>
            );})}
          </div>
        </div>
      </div>
    );
  }

  const maxPts=Math.max(1,...designers.map(d=>d.points));
  const allFiltered=users.filter(u=>(filterRole==="all"||u.role===filterRole)&&(!search.trim()||u.name.toLowerCase().includes(search.toLowerCase())));
  return(
    <div>
      <div className="ph">
        <div><div className="pt">Team</div><div className="pd">{users.length} members · {designers.length} designers</div></div>
        {canEdit&&<button className="btn btn-primary" onClick={()=>setModal({type:"add-user"})}>+ Add Member</button>}
      </div>
      <div className="g4" style={{marginBottom:20}}>
        {[{l:"Members",v:users.length,e:"👥"},{l:"Designers",v:designers.length,e:"🎨"},{l:"Active Tasks",v:tasks.filter(t=>!["done","canceled","rejected"].includes(t.status)).length,e:"⚡"},{l:"Total Points",v:users.reduce((a,u)=>a+u.points,0),e:"⭐"}].map(x=>(
          <div key={x.l} style={{background:"#fff",border:`1px solid ${T.gray200}`,borderRadius:12,padding:"14px 16px"}}>
            <div style={{fontSize:11,color:T.gray500,fontWeight:600,marginBottom:4}}>{x.e} {x.l}</div>
            <div style={{fontSize:24,fontWeight:800,color:T.gray900}}>{x.v}</div>
          </div>
        ))}
      </div>
      <div className="tabs">
        <div className={`tab${tab==="designers"?" active":""}`} onClick={()=>setTab("designers")}>Designers</div>
        <div className={`tab${tab==="all"?" active":""}`} onClick={()=>setTab("all")}>All Members</div>
      </div>
      {tab==="designers"&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(250px,1fr))",gap:14}}>
          {designers.length===0&&<div className="card" style={{gridColumn:"1/-1"}}><Empty icon="👤" text="No designers yet"/></div>}
          {[...designers].sort((a,b)=>b.points-a.points).map((d,i)=>{
            const dt=tasks.filter(t=>t.designer_id===d.id);
            const active=dt.filter(t=>!["done","canceled","rejected"].includes(t.status)).length;
            const done=dt.filter(t=>t.status==="done").length;
            return(
              <div key={d.id} className="card card-hover" style={{cursor:"pointer",position:"relative",borderTop:`3px solid ${i===0?"#CA8A04":i===1?"#94A3B8":i===2?"#92400E":T.gray200}`}} onClick={()=>openProfile(d)}>
                {i<3&&<div style={{position:"absolute",top:12,right:12,width:22,height:22,borderRadius:"50%",background:i===0?"#FEF9C3":i===1?"#F1F5F9":"#FFF7ED",border:`1px solid ${i===0?"#FCD34D":i===1?"#CBD5E1":"#FDBA74"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:i===0?"#B45309":i===1?"#64748B":"#C2410C"}}>#{i+1}</div>}
                <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
                  <Avatar name={d.name} size={44} fontSize={16} color={d.avatar_color||T.secondary} img={d.avatar_img||undefined}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:700,color:T.gray900,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.name}</div>
                    <div style={{fontSize:11,color:T.gray500,marginTop:1}}>{d.department}</div>
                  </div>
                </div>
                <WorkloadBar active={active} pts={d.points}/>
                <div style={{display:"flex",gap:8,marginTop:10}}>
                  <div style={{flex:1,background:T.secondaryLight,borderRadius:7,padding:"6px 8px",textAlign:"center"}}><div style={{fontSize:16,fontWeight:800,color:T.secondary}}>{active}</div><div style={{fontSize:10,color:T.gray500}}>Active</div></div>
                  <div style={{flex:1,background:T.green50,borderRadius:7,padding:"6px 8px",textAlign:"center"}}><div style={{fontSize:16,fontWeight:800,color:T.green700}}>{done}</div><div style={{fontSize:10,color:T.gray500}}>Done</div></div>
                  <div style={{flex:1,background:T.primaryLight,borderRadius:7,padding:"6px 8px",textAlign:"center"}}><div style={{fontSize:16,fontWeight:800,color:T.primary}}>{d.points}</div><div style={{fontSize:10,color:T.gray500}}>Pts</div></div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {tab==="all"&&(
        <div>
          <div className="filter-bar">
            <div className="search-box" style={{flex:1}}><IcoSearch s={14} c={T.gray400}/><input className="fi" style={{paddingLeft:34,height:34,width:"100%"}} placeholder="Search name…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
            <select className="fi" style={{width:140,height:34}} value={filterRole} onChange={e=>setFilterRole(e.target.value)}>
              <option value="all">All roles</option>{ALL_ROLES.map(r=><option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </div>
          <div className="tw">
            <table className="tbl">
              <thead><tr><th>Member</th><th>Role</th><th>Department</th><th>Points</th><th>Workload</th><th>Actions</th></tr></thead>
              <tbody>
                {allFiltered.map(u=>{
                  const uTasks=tasks.filter(t=>t.designer_id===u.id);
                  const active=uTasks.filter(t=>!["done","canceled","rejected"].includes(t.status)).length;
                  return(
                    <tr key={u.id}>
                      <td>
                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                          <Avatar name={u.name} size={30} color={u.avatar_color||T.secondary} img={u.avatar_img||undefined}/>
                          <div>
                            <div style={{fontSize:13,fontWeight:600,color:u.role==="designer"?T.primary:T.gray800,cursor:u.role==="designer"?"pointer":"default"}} onClick={()=>u.role==="designer"&&openProfile(u)}>{u.name}</div>
                            <div style={{fontSize:11,color:T.gray500}}>{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td><span className="badge" style={{background:T.primaryLight,color:T.primaryText,borderColor:"#93C5FD"}}>{ROLE_LABELS[u.role]}</span></td>
                      <td style={{fontSize:12,color:T.gray600}}>{u.department}</td>
                      <td><span style={{fontWeight:700,color:T.primary,fontSize:13}}>{u.points}</span></td>
                      <td style={{fontSize:12,color:T.gray600}}>{u.role==="designer"?`${active} active`:"—"}</td>
                      <td>
                        {canEdit?<div style={{display:"flex",gap:6}}>
                          <button className="btn btn-xs btn-outline" onClick={()=>setModal({type:"edit-user",data:u})}>Edit</button>
                          <button className="btn btn-xs btn-ghost-red" onClick={()=>removeUser(u.id)}>Remove</button>
                        </div>:<span style={{fontSize:12,color:T.gray400}}>—</span>}
                      </td>
                    </tr>
                  );
                })}
                {allFiltered.length===0&&<tr><td colSpan={6}><Empty icon="👤" text="No members found"/></td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── REPORTS ───────────────────────────────────────────────────
function Reports({requests,tasks,users,goDesignerProfile}){
  const designers=users.filter(u=>u.role==="designer");
  const totalPts=designers.reduce((a,d)=>a+d.points,0);
  const maxPts=Math.max(1,...designers.map(d=>d.points));
  const overdue=requests.filter(r=>!["done","rejected","canceled"].includes(r.status)&&r.deadline&&new Date(r.deadline)<new Date()).length;
  return(
    <div>
      <div className="ph"><div className="pt">Reports & Analytics</div></div>
      <div className="g4" style={{marginBottom:20}}>
        <StatCard label="Total Requests" val={requests.length} sub={`${overdue} overdue`} sparkData={[3,5,4,7,6,8,requests.length]} accent={T.primary} emoji="📁"/>
        <StatCard label="From Public Form" val={requests.filter(r=>r.source==="public_form").length} sparkData={[0,1,1,2,2,3,requests.filter(r=>r.source==="public_form").length]} accent={T.secondary} emoji="📋"/>
        <StatCard label="Completed Tasks" val={tasks.filter(t=>t.status==="done").length} sparkData={[1,2,3,2,4,5,tasks.filter(t=>t.status==="done").length]} accent={T.green600} emoji="✅"/>
        <StatCard label="Total Points" val={totalPts} sub="Across all designers" sparkData={[20,35,40,55,70,85,totalPts]} accent={T.amber600} emoji="⭐"/>
      </div>
      <div className="g2">
        <div className="card">
          <div className="sh"><div className="st">Designer Performance</div></div>
          {[...designers].sort((a,b)=>b.points-a.points).map((d,i)=>{
            const dn=tasks.filter(t=>t.designer_id===d.id&&t.status==="done").length;
            const an=tasks.filter(t=>t.designer_id===d.id&&!["done","canceled","rejected"].includes(t.status)).length;
            const rev=tasks.filter(t=>t.designer_id===d.id).reduce((a,t)=>a+(t.revision_count||0),0);
            return(<div key={d.id} style={{padding:"12px 0",borderBottom:`1px solid ${T.gray100}`}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                <span style={{fontSize:11,fontWeight:700,color:i<3?T.primary:T.gray400,width:18,textAlign:"center"}}>#{i+1}</span>
                <Avatar name={d.name} size={26} color={d.avatar_color||T.secondary} img={d.avatar_img||undefined}/>
                <DesignerLink user={d} onNavigate={goDesignerProfile} style={{flex:1,fontSize:13}}/>
                <span style={{fontSize:14,fontWeight:800,color:T.primary,letterSpacing:"-.3px"}}>{d.points}<span style={{fontSize:9,color:T.gray400,fontWeight:400}}>pts</span></span>
              </div>
              <div style={{paddingLeft:28,display:"flex",gap:12,fontSize:11,color:T.gray500,marginBottom:6}}>
                <span style={{color:T.green600,fontWeight:600}}>✓ {dn} done</span>
                <span>◷ {an} active</span>
                {rev>0&&<span style={{color:"#991B1B",fontWeight:600}}>🔄 {rev} revisions</span>}
              </div>
              <div style={{paddingLeft:28}}><div className="pb-t"><div className="pb-f" style={{width:`${(d.points/maxPts)*100}%`}}/></div></div>
            </div>);
          })}
        </div>
        <div>
          <div className="card" style={{marginBottom:14}}>
            <div className="sh"><div className="st">Request Status Breakdown</div></div>
            {Object.keys(STATUS_LABELS).filter(sk=>requests.filter(r=>r.status===sk).length>0).map(sk=>{
              const cnt=requests.filter(r=>r.status===sk).length;
              const sc=STATUS_COLOR[sk];
              return(<div key={sk} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:`1px solid ${T.gray100}`}}>
                <span style={{width:7,height:7,borderRadius:"50%",background:sc?.dot||T.gray400,flexShrink:0}}/>
                <span style={{flex:1,fontSize:13,color:T.gray700}}>{STATUS_LABELS[sk]}</span>
                <span style={{fontWeight:700,fontSize:13}}>{cnt}</span>
                <div style={{width:70}}><div className="pb-t"><div className="pb-f" style={{width:`${(cnt/requests.length)*100}%`,background:sc?.dot||T.gray400}}/></div></div>
              </div>);
            })}
          </div>
          <div className="card">
            <div className="sh"><div className="st">Revision Rate</div></div>
            {tasks.filter(t=>(t.revision_count||0)>0).sort((a,b)=>(b.revision_count||0)-(a.revision_count||0)).slice(0,5).map(t=>{
              const req=requests.find(r=>r.id===t.request_id);
              const d=users.find(u=>u.id===t.designer_id);
              return(<div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:`1px solid ${T.gray100}`}}>
                <div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:600,color:T.gray800,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{req?.title||"—"}</div><div style={{fontSize:11,color:T.gray500}}>{d?.name}</div></div>
                <span className="badge" style={{background:"#FEF2F2",color:"#991B1B",borderColor:"#FCA5A5"}}>🔄 ×{t.revision_count}</span>
              </div>);
            })}
            {tasks.filter(t=>t.revision_count>0).length===0&&<Empty icon="✅" text="No revisions yet"/>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── PROFILE PAGES ─────────────────────────────────────────────
function ProfilePage({cu,tasks,requests,go,setModal}){
  const done=tasks.filter(t=>t.status==="done").length;
  const active=tasks.filter(t=>!["done","canceled","rejected"].includes(t.status)).length;
  const revisions=tasks.reduce((a,t)=>a+(t.revision_count||0),0);
  return(
    <div>
      <div className="ph"><div className="pt">My Profile</div><button className="btn btn-primary btn-sm" onClick={()=>go("edit-profile")}>✎ Edit Profile</button></div>
      <div className="g2">
        <div className="card">
          <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:18}}>
            <Avatar name={cu.name} size={60} fontSize={20} color={cu.avatar_color||T.secondary} img={cu.avatar_img||undefined}/>
            <div>
              <div style={{fontSize:18,fontWeight:800,color:T.gray900,letterSpacing:"-.3px"}}>{cu.name}</div>
              <div style={{fontSize:13,color:T.gray600,marginTop:3}}>{ROLE_LABELS[cu.role]} · {cu.department}</div>
              <div style={{fontSize:12,color:T.gray500,marginTop:2}}>{cu.email}{cu.phone&&" · "+cu.phone}</div>
            </div>
          </div>
          {cu.bio&&<div style={{fontSize:13,color:T.gray700,background:T.gray50,borderRadius:9,padding:"10px 13px",marginBottom:14,lineHeight:1.6,border:`1px solid ${T.gray100}`}}>{cu.bio}</div>}
          {cu.role==="designer"&&<div className="g2" style={{marginTop:4}}>
            {[{l:"Completed",v:done,e:"✅"},{l:"In Progress",v:active,e:"⚡"},{l:"Revisions",v:revisions,e:"🔄"},{l:"Total Tasks",v:done+active+revisions,e:"📋"}].map(x=>(
              <div key={x.l} style={{background:T.gray50,borderRadius:9,padding:"11px 13px",border:`1px solid ${T.gray100}`}}>
                <div style={{fontSize:11,color:T.gray500,fontWeight:600}}>{x.e} {x.l}</div>
                <div style={{fontSize:22,fontWeight:800,color:T.gray900,marginTop:4}}>{x.v}</div>
              </div>
            ))}
          </div>}
        </div>
        <div className="card">
          <div className="sh"><div className="st">Recent Task History</div></div>
          {tasks.length===0&&<Empty icon="📝" text="No tasks yet"/>}
          {tasks.slice(0,8).map(t=>{const req=requests.find(r=>r.id===t.request_id);return(
            <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`1px solid ${T.gray100}`,cursor:"pointer"}} onClick={()=>setModal({type:"task-detail",data:t})}>
              <div style={{flex:1,minWidth:0,fontSize:13,fontWeight:500,color:T.gray800,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{req?.title||"—"}</div>
              <StatusBadge status={t.status}/>
              {t.points_awarded>0&&<span style={{fontSize:11,color:T.primary,fontWeight:700,flexShrink:0}}>+{t.points_awarded}pt</span>}
            </div>
          );})}
        </div>
      </div>
    </div>
  );
}
function EditProfilePage({cu,onSave,go,role}){
  const [form,setForm]=useState({name:cu.name||"",email:cu.email||"",phone:cu.phone||"",department:cu.department||"Design",bio:cu.bio||"",avatar_color:cu.avatar_color||T.secondary,avatar_img:cu.avatar_img||"",password:"",confirm_password:""});
  const [saved,setSaved]=useState(false);const imgRef=useRef();
  const setF=(k,v)=>setForm(f=>({...f,[k]:v}));
  const COLORS=["#0857C3","#1D6FBB","#0E7490","#7C3AED","#DB2777","#059669","#D97706","#DC2626","#0891B2","#65A30D"];
  const handleImg=e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>5*1024*1024){alert("Max 5 MB");return;}const reader=new FileReader();reader.onload=ev=>setF("avatar_img",ev.target.result);reader.readAsDataURL(file);};
  const save=()=>{if(!form.name||!form.email)return alert("Name and email required");if(form.password&&form.password!==form.confirm_password)return alert("Passwords do not match");const p={name:form.name,email:form.email,phone:form.phone,department:form.department,bio:form.bio,avatar_color:form.avatar_color,avatar_img:form.avatar_img};if(form.password)p.password=form.password;onSave(p);setSaved(true);setTimeout(()=>setSaved(false),2000);};
  return(
    <div style={{maxWidth:640}}>
      <div className="ph"><div className="pt">Edit Profile</div><button className="btn btn-sm" onClick={()=>go("profile")}>← Back</button></div>
      <div className="card" style={{marginBottom:14}}>
        <div className="section-title">Profile Picture</div>
        <div style={{display:"flex",alignItems:"center",gap:20}}>
          <div style={{position:"relative",flexShrink:0}}>
            <Avatar name={form.name||"?"} size={72} fontSize={24} color={form.avatar_color} img={form.avatar_img||undefined}/>
            <div onClick={()=>imgRef.current.click()} style={{position:"absolute",bottom:0,right:0,width:26,height:26,borderRadius:"50%",background:T.primary,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",border:"2px solid #fff",fontSize:12}}>📷</div>
          </div>
          <input ref={imgRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleImg}/>
          <div style={{flex:1}}>
            <button className="btn btn-sm btn-outline" style={{marginBottom:10}} onClick={()=>imgRef.current.click()}>📁 Upload Photo</button>
            {form.avatar_img&&<button className="btn btn-sm btn-ghost-red" style={{marginLeft:8}} onClick={()=>setF("avatar_img","")}>✕ Remove</button>}
            {!form.avatar_img&&<div><div style={{fontSize:11,color:T.gray500,marginBottom:6}}>Or choose a color</div><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{COLORS.map(c=><div key={c} onClick={()=>setF("avatar_color",c)} style={{width:24,height:24,borderRadius:"50%",background:c,cursor:"pointer",border:form.avatar_color===c?"3px solid #0F172A":"2px solid transparent",transition:"all .15s"}}/>)}</div></div>}
          </div>
        </div>
      </div>
      <div className="card" style={{marginBottom:14}}>
        <div className="section-title">Personal Information</div>
        <div className="g2">
          <div className="fg"><label className="fl">Full Name *</label><input className="fi" value={form.name} onChange={e=>setF("name",e.target.value)}/></div>
          <div className="fg"><label className="fl">Email *</label><input className="fi" type="email" value={form.email} onChange={e=>setF("email",e.target.value)}/></div>
          <div className="fg"><label className="fl">Phone</label><input className="fi" value={form.phone} onChange={e=>setF("phone",e.target.value)}/></div>
          <div className="fg"><label className="fl">Department</label><select className="fi" value={form.department} onChange={e=>setF("department",e.target.value)}>{DEPARTMENTS.map(d=><option key={d}>{d}</option>)}</select></div>
        </div>
        <div className="fg"><label className="fl">Bio</label><textarea className="fi" value={form.bio} onChange={e=>setF("bio",e.target.value)} placeholder="Short description about yourself…"/></div>
      </div>
      <div className="card" style={{marginBottom:20}}>
        <div className="section-title">Change Password</div>
        <div className="g2">
          <div className="fg"><label className="fl">New Password</label><input className="fi" type="password" value={form.password} onChange={e=>setF("password",e.target.value)} placeholder="Leave blank to keep current"/></div>
          <div className="fg"><label className="fl">Confirm</label><input className="fi" type="password" value={form.confirm_password} onChange={e=>setF("confirm_password",e.target.value)}/></div>
        </div>
      </div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
        <button className="btn" onClick={()=>go("profile")}>Cancel</button>
        <button className="btn btn-primary" onClick={save} style={{minWidth:120}}>{saved?"✓ Saved!":"Save Changes"}</button>
      </div>
    </div>
  );
}

// ── NOTIFICATIONS ─────────────────────────────────────────────
function NotifPage({notifs,markRead,setNotifs,onNotifClick}){
  const typeIcon={task:"📋",deadline:"⏰",revision:"🔄",comment:"💬",success:"🎉",status:"📌",info:"🔔"};
  const typeBg={task:T.secondaryLight,deadline:"#FFFBEB",revision:"#FEF2F2",comment:T.green50,success:T.green50,status:T.primaryLight,info:T.gray50};
  return(
    <div>
      <div className="ph">
        <div><div className="pt">Notifications</div><div className="pd">{notifs.filter(n=>!n.is_read).length} unread</div></div>
        <button className="btn btn-sm" onClick={markRead}>Mark all read</button>
      </div>
      <div className="card" style={{padding:0,overflow:"hidden"}}>
        {notifs.length===0&&<Empty icon="🔔" text="All caught up!" sub="No notifications yet"/>}
        {notifs.map(n=>(
          <div key={n.id} className={`ni${n.is_read?"":" unread"}`} onClick={()=>onNotifClick?onNotifClick(n):setNotifs(ns=>ns.map(x=>x.id===n.id?{...x,is_read:true}:x))}>
            <div className="ni-icon" style={{background:typeBg[n.type]||T.gray50}}>{typeIcon[n.type]||"🔔"}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:600,fontSize:13,color:T.gray900,marginBottom:2}}>{n.title}</div>
              <div style={{fontSize:12,color:T.gray600,lineHeight:1.4}}>{n.body}</div>
              <div style={{fontSize:10,color:T.gray400,marginTop:4}}>{fmtTime(n.created_at)}</div>
            </div>
            {!n.is_read&&<div style={{width:7,height:7,borderRadius:"50%",background:T.primary,flexShrink:0,marginTop:4}}/>}
            <div style={{fontSize:11,color:T.primary,fontWeight:600,flexShrink:0}}>View →</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── APPROVE MODAL ─────────────────────────────────────────────
function ApproveModal({req,onClose,onApprove,onReject}){
  const [wl,setWl]=useState("medium");const [reason,setReason]=useState("");const [view,setView]=useState("approve");
  const ds=deadlineStatus(req.deadline);
  return(
    <div className="mo" onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div className="modal">
        <div className="modal-hdr">
          <div className="mi">🔍</div>
          <div style={{flex:1}}><div className="mt">Review Request</div><div className="ms">{req.request_id}</div></div>
          <button className="mc" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="card-sm" style={{background:T.gray50,marginBottom:16}}>
            <div style={{fontWeight:700,fontSize:14,color:T.gray900,marginBottom:8}}>{req.title}</div>
            <div className="ir" style={{marginBottom:req.description?8:0}}>
              <span className="ii">From: <b>{req.applicant_name}</b></span>
              <span className="ii">Type: <b>{req.design_type}</b></span>
              <span className="ii">Deadline: <b>{fmtDate(req.deadline)}</b></span>
            </div>
            {ds&&<div style={{marginBottom:8}}><DeadlineBadge deadline={req.deadline} status={req.status}/></div>}
            {req.description&&<div style={{fontSize:12,color:T.gray700,lineHeight:1.5,background:"#fff",borderRadius:8,padding:"8px 11px"}}>{req.description}</div>}
            {req.guideline_link&&<div style={{marginTop:8,fontSize:12}}><a href={req.guideline_link} target="_blank" rel="noreferrer" style={{color:T.secondary}}>🔗 View guidelines</a></div>}
          </div>
          <div className="tabs">
            <div className={`tab${view==="approve"?" active":""}`} onClick={()=>setView("approve")}>✓ Approve</div>
            <div className={`tab${view==="reject"?" active":""}`} onClick={()=>setView("reject")}>✕ Reject</div>
          </div>
          {view==="approve"&&<>
            <div style={{fontWeight:600,fontSize:12,color:T.gray600,marginBottom:10,textTransform:"uppercase",letterSpacing:".06em"}}>Set Workload Tier</div>
            {WORKLOADS.map(w=><div key={w.value} className={`rc${wl===w.value?" sel":""}`} onClick={()=>setWl(w.value)}>
              <input type="radio" name="wl" checked={wl===w.value} readOnly style={{accentColor:T.primary}}/>
              <div><div className="rc-l">{w.label}</div><div className="rc-s">{w.pts[0]}–{w.pts[1]} points awarded on completion</div></div>
            </div>)}
          </>}
          {view==="reject"&&<>
            <div className="fg"><label className="fl">Rejection reason <span className="req">*</span></label><textarea className="fi" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Explain why this request cannot be processed…"/></div>
          </>}
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancel</button>
          {view==="approve"?<button className="btn btn-success" onClick={()=>onApprove(req.id,wl)}>Approve → Backlog</button>:<button className="btn btn-ghost-red" onClick={()=>{if(!reason)return alert("Reason required");onReject(req.id,reason)}}>Reject Request</button>}
        </div>
      </div>
    </div>
  );
}

// ── ASSIGN MODAL ──────────────────────────────────────────────
function AssignModal({req,assignable,tasks,cu,users,onClose,onAssign}){
  const existingAssignees=tasks.filter(t=>t.request_id===req.id&&!["canceled"].includes(t.status)).map(t=>t.designer_id);
  const [sel,setSel]=useState([]);
  const toggle=id=>setSel(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);
  return(
    <div className="mo" onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div className="modal">
        <div className="modal-hdr">
          <div className="mi">👤</div>
          <div style={{flex:1}}><div className="mt">Assign Task</div><div className="ms">{req.request_id} · {req.workload||"TBD"} workload</div></div>
          <button className="mc" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{fontWeight:600,fontSize:14,color:T.gray900,marginBottom:4}}>{req.title}</div>
          <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
            <PriorityBadge priority={req.priority}/><DeadlineBadge deadline={req.deadline} status={req.status}/>
          </div>
          {existingAssignees.length>0&&<div style={{fontSize:12,color:T.gray600,marginBottom:12,background:T.primaryLight,borderRadius:8,padding:"7px 12px"}}>Already assigned: {existingAssignees.length} person(s). New assignments will create additional task copies.</div>}
          {sel.length>1&&<div style={{background:T.amber50,border:"1px solid #FCD34D",borderRadius:9,padding:"9px 13px",fontSize:12,color:T.amber700,marginBottom:12,fontWeight:600}}>⚠ Each person will receive an independent copy of this task.</div>}
          <div style={{display:"flex",flexDirection:"column",gap:8,maxHeight:320,overflowY:"auto"}}>
            {assignable.map(d=>{
              const active=tasks.filter(t=>t.designer_id===d.id&&!["done","canceled","rejected"].includes(t.status)).length;
              const isSel=sel.includes(d.id);
              const alreadyAssigned=existingAssignees.includes(d.id);
              const warnLoad=active>=8;
              return(
                <div key={d.id} style={{display:"flex",alignItems:"center",gap:12,cursor:alreadyAssigned?"not-allowed":"pointer",padding:"12px 13px",borderRadius:10,border:`1.5px solid ${isSel?T.secondary:alreadyAssigned?"#E2E8F0":warnLoad?"#FCD34D":T.gray200}`,background:isSel?T.secondaryLight:alreadyAssigned?T.gray50:warnLoad?T.amber50:"#fff",opacity:alreadyAssigned?.55:1,transition:"all .15s"}} onClick={()=>!alreadyAssigned&&toggle(d.id)}>
                  <input type="checkbox" checked={isSel} readOnly disabled={alreadyAssigned} style={{accentColor:T.primary,width:15,height:15}}/>
                  <Avatar name={d.name} size={30} color={d.avatar_color||T.secondary} img={d.avatar_img||undefined}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,color:T.gray900,display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                      {d.name}
                      {alreadyAssigned&&<span className="badge" style={{background:T.gray100,color:T.gray600,borderColor:T.gray200,fontSize:9}}>Already assigned</span>}
                      {warnLoad&&!alreadyAssigned&&<span className="badge" style={{background:T.amber100,color:T.amber700,borderColor:"#FCD34D",fontSize:9}}>⚠ Heavy load</span>}
                    </div>
                    <WorkloadBar active={active} pts={d.points}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={sel.length===0} onClick={()=>onAssign(req.id,sel)}>Assign {sel.length>0?`${sel.length} person(s)`:""}</button>
        </div>
      </div>
    </div>
  );
}

// ── TASK MODAL ────────────────────────────────────────────────
function TaskModal({task,requests,users,comments,activity,cu,role,onClose,onStatus,onAccept,onRevision,onApprove,onComment,showToast,goDesignerProfile,onAdditionalAssign}){
  const req=requests.find(r=>r.id===task.request_id);
  const designer=users.find(u=>u.id===task.designer_id);
  const [tab,setTab]=useState("activity");
  const [ct,setCt]=useState("");const [rn,setRn]=useState("");const [showRev,setShowRev]=useState(false);
  const [aiLoad,setAiLoad]=useState(false);const [aiTips,setAiTips]=useState("");
  const [fileNames,setFileNames]=useState([]);
  const fileRef=useRef();
  const isOwner=cu.id===task.designer_id;const isLead=role==="lead";
  const FLOW={assigned:"on_progress",on_progress:"on_review",revision:"on_progress"};
  const nextSt=FLOW[task.status];
  const canReopen=task.status==="done"&&isLead;
  const extraStatuses=["on_hold","canceled"].filter(()=>!["done","canceled","rejected","on_hold"].includes(task.status));
  const ds=deadlineStatus(req?.deadline);
  const waUrl=designer?.phone?`https://wa.me/${designer.phone.replace(/[^0-9]/g,"")}?text=${encodeURIComponent(`Hi ${designer.name},\n\nTask reminder: "${req?.title}" (${task.task_id})\nStatus: ${STATUS_LABELS[task.status]}\nDeadline: ${fmtDate(req?.deadline)}\n\nPlease check GD Tracker for details.`)}`:null;

  const getAI=async()=>{
    setAiLoad(true);setAiTips("");
    const prompt=`Design task: "${req?.title||""}" (${req?.design_type||""})\nDescription: ${req?.description||""}\nWorkload: ${req?.workload||""}, Status: ${STATUS_LABELS[task.status]}\nRevisions: ${task.revision_count||0}\n\nGive 3 concise, actionable design tips.`;
    try{const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:400,messages:[{role:"user",content:prompt}]})});const data=await res.json();setAiTips(data.content?.[0]?.text||"No tips available.");}
    catch{setAiTips("Could not load tips. Check connection.");}
    setAiLoad(false);
  };

  const handleFileUpload=e=>{
    const names=Array.from(e.target.files).map(f=>f.name);
    setFileNames(names);
  };
  const sendComment=()=>{if(!ct.trim()&&fileNames.length===0)return;const t=fileNames.length>0?"file":"note";onComment(task.id,ct||`Uploaded ${fileNames.length} file(s): ${fileNames.join(", ")}`,t,fileNames);setCt("");setFileNames([]);};

  const allActivity=[
    ...comments.map(c=>({...c,kind:"comment"})),
    ...activity.map(a=>({...a,kind:"activity"})),
  ].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));

  const typeLabel={system:"System",note:"Comment",revision:"Revision",file:"File Upload"};
  const typeStyle={system:{bg:"#EFF6FF",color:T.primaryText,dot:"system"},note:{bg:"#F0FDF4",color:T.green700,dot:"note"},revision:{bg:"#FEF2F2",color:"#991B1B",dot:"revision"},file:{bg:"#FFFBEB",color:T.amber700,dot:"file"}};

  return(
    <div className="mo" onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div className="modal" style={{maxWidth:760}}>
        {/* Header */}
        <div className="modal-hdr" style={{paddingRight:48}}>
          <div className="mi">🎨</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontFamily:"monospace",fontSize:10,color:T.gray400,marginBottom:2}}>{task.task_id}</div>
            <div className="mt" style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",paddingRight:8}}>{req?.title}</div>
          </div>
          {waUrl&&isLead&&<a href={waUrl} target="_blank" rel="noreferrer" className="btn btn-wa btn-sm" style={{textDecoration:"none",flexShrink:0}}><WaIcon size={13}/> WA {designer?.name?.split(" ")[0]}</a>}
          <button className="mc" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {/* Status + badges */}
          <div style={{display:"flex",gap:7,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
            <StatusBadge status={task.status}/>
            <PriorityBadge priority={req?.priority}/>
            {ds&&<DeadlineBadge deadline={req?.deadline} status={task.status}/>}
            {req?.design_type&&<span className="tag">{req.design_type}</span>}
            {req?.workload&&<span className="tag">{req.workload} workload</span>}
            {task.revision_count>0&&<span className="tag" style={{background:"#FEF2F2",color:"#991B1B",borderColor:"#FCA5A5"}}>🔄 {task.revision_count} revision{task.revision_count>1?"s":""}</span>}
          </div>

          {/* Info row */}
          <div className="ir">
            <span className="ii"><IcoUser s={12} c={T.gray400}/> Designer: <b style={{color:T.gray900,fontWeight:600}}>{designer?.name||"—"}</b></span>
            <span className="ii">Applicant: <b>{req?.applicant_name}</b></span>
            <span className="ii">Dept: <b>{req?.department}</b></span>
            <span className="ii">Deadline: <b>{fmtDate(req?.deadline)}</b></span>
            {req?.points_awarded>0&&<span className="ii">Points: <b style={{color:T.primary}}>+{task.points_awarded} pts</b></span>}
          </div>

          {req?.description&&<div style={{fontSize:13,background:T.gray50,border:`1px solid ${T.gray100}`,borderRadius:9,padding:"10px 13px",marginBottom:14,color:T.gray700,lineHeight:1.6}}>{req.description}</div>}
          {req?.guideline_link&&<div style={{marginBottom:14,fontSize:12}}><a href={req.guideline_link} target="_blank" rel="noreferrer" style={{color:T.secondary}}>🔗 Brand Guidelines</a></div>}

          {/* AI Tips */}
          {(role==="designer"||isLead)&&<div style={{marginBottom:16}}>
            <button className="btn btn-outline btn-sm" onClick={getAI} disabled={aiLoad}>{aiLoad?"Generating…":"✦ AI Design Tips"}</button>
            {aiLoad&&<div className="ai-bub"><div style={{display:"flex",gap:4,alignItems:"center",padding:"4px 0"}}><div className="dot-anim"/><div className="dot-anim"/><div className="dot-anim"/></div></div>}
            {aiTips&&!aiLoad&&<div className="ai-bub">{aiTips}</div>}
          </div>}

          {/* Action buttons */}
          <div style={{display:"flex",gap:7,marginBottom:16,flexWrap:"wrap"}}>
            {(isOwner||isLead)&&task.status==="assigned"&&<button className="btn btn-primary btn-sm" onClick={()=>{onAccept(task.id);onClose();}}>✓ Accept Task</button>}
            {(isOwner||isLead)&&nextSt&&task.status!=="assigned"&&!["done","on_hold","canceled"].includes(task.status)&&
              <button className="btn btn-primary btn-sm" onClick={()=>{onStatus(task.id,nextSt);showToast(`→ ${STATUS_LABELS[nextSt]}`);onClose();}}>Move to {STATUS_LABELS[nextSt]}</button>}
            {isLead&&task.status==="on_review"&&<>
              <button className="btn btn-success btn-sm" onClick={()=>onApprove(task.id)}>✓ Approve & Close</button>
              <button className="btn btn-sm btn-orange" onClick={()=>setShowRev(!showRev)}>🔄 Request Revision</button>
            </>}
            {isLead&&<button className="btn btn-outline btn-sm" onClick={()=>{onClose();onAdditionalAssign();}}>+ Assign More</button>}
            {canReopen&&<>
              <button className="btn btn-amber btn-sm" onClick={()=>{onStatus(task.id,"revision");showToast("→ Revision");onClose();}}>↩ Back to Revision</button>
              <button className="btn btn-orange btn-sm" onClick={()=>{onStatus(task.id,"on_review");showToast("→ On Review");onClose();}}>↩ Back to Review</button>
            </>}
            {isLead&&extraStatuses.map(st=>(
              <button key={st} className={`btn btn-sm ${st==="canceled"?"btn-ghost-red":"btn-purple"}`}
                onClick={()=>{onStatus(task.id,st);showToast(`→ ${STATUS_LABELS[st]}`);onClose();}}>
                {st==="on_hold"?"⏸ On Hold":"✕ Cancel"}
              </button>
            ))}
          </div>

          {/* Revision form */}
          {showRev&&<div style={{marginBottom:16,background:"#FEF2F2",border:"1px solid #FCA5A5",borderRadius:10,padding:"14px"}}>
            <div style={{fontSize:12,fontWeight:700,color:"#991B1B",marginBottom:8}}>🔄 Revision Request #{(task.revision_count||0)+1}</div>
            <textarea className="fi" style={{marginBottom:8,background:"#fff"}} value={rn} onChange={e=>setRn(e.target.value)} placeholder="Describe what needs to be changed…"/>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <button className="btn btn-ghost-red btn-sm" onClick={()=>{if(!rn.trim())return;onRevision(task.id,rn,[]);setShowRev(false);setRn("");}}>Send Revision</button>
              <button className="btn btn-sm" onClick={()=>{setShowRev(false);setRn("");setRevFiles([]);}}>Cancel</button>
            </div>
          </div>}

          {/* Tabs: Activity + Files */}
          <div className="divider"/>
          <div className="tabs" style={{marginBottom:14}}>
            <div className={`tab${tab==="activity"?" active":""}`} onClick={()=>setTab("activity")}>💬 Activity & Comments</div>
            <div className={`tab${tab==="files"?" active":""}`} onClick={()=>setTab("files")}>📎 File Versions</div>
          </div>

          {tab==="activity"&&<>
            <div style={{maxHeight:220,overflowY:"auto",marginBottom:14}}>
              {allActivity.length===0&&<div style={{fontSize:12,color:T.gray500,padding:"10px 0"}}>No activity yet.</div>}
              {allActivity.map((item,i)=>{
                if(item.kind==="activity"){
                  const actor=users.find(u=>u.id===item.actor_id);
                  return(<div key={item.id||i} className="activity-item">
                    <div className="activity-dot system"/>
                    <div style={{flex:1}}>
                      <span style={{fontSize:12,color:T.gray700}}><b style={{color:T.gray900}}>{actor?.name||"System"}</b> {item.detail}</span>
                      <div style={{fontSize:10,color:T.gray400,marginTop:3}}>{fmtTime(item.created_at)}</div>
                    </div>
                  </div>);
                }
                const auth=users.find(u=>u.id===item.author_id);
                const ts=typeStyle[item.type]||typeStyle.note;
                return(<div key={item.id||i} className={`cb ${item.type==="revision"?"cb-rev":item.type==="file"?"cb-file":item.type==="system"?"cb-system":""}`}>
                  <div className="cb-auth">
                    <Avatar name={auth?.name||"?"} size={18} fontSize={8} color={auth?.avatar_color||T.secondary} img={auth?.avatar_img||undefined}/>
                    <span style={{color:T.gray900,fontWeight:700}}>{auth?.name||"System"}</span>
                    <span className="badge" style={{fontSize:9,background:ts.bg,color:ts.color,borderColor:ts.bg}}>{typeLabel[item.type]||item.type}</span>
                  </div>
                  <div className="cb-text">{item.content}</div>
                  {item.files?.length>0&&<div style={{marginTop:6,display:"flex",gap:6,flexWrap:"wrap"}}>{item.files.map((f,j)=><span key={j} className="fchip"><IcoFile s={10} c={T.secondary}/> {f}</span>)}</div>}
                  <div className="cb-time">{fmtTime(item.created_at)}</div>
                </div>);
              })}
            </div>
            <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
              <div style={{flex:1}}>
                <input className="fi" value={ct} onChange={e=>setCt(e.target.value)} placeholder="Add a comment…" onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&ct.trim()){sendComment();}}} style={{height:36}}/>
                {fileNames.length>0&&<div style={{marginTop:4,display:"flex",gap:4,flexWrap:"wrap"}}>{fileNames.map((f,i)=><span key={i} className="fchip"><IcoFile s={10} c={T.secondary}/> {f}<span className="fchip-x" onClick={()=>setFileNames(x=>x.filter((_,j)=>j!==i))}> ×</span></span>)}</div>}
              </div>
              <input ref={fileRef} type="file" multiple style={{display:"none"}} onChange={handleFileUpload}/>
              <button className="btn btn-sm" onClick={()=>fileRef.current.click()} title="Attach file"><IcoFile s={14} c={T.gray600}/></button>
              <button className="btn btn-primary btn-sm" onClick={sendComment} disabled={!ct.trim()&&fileNames.length===0}>Send</button>
            </div>
          </>}

          {tab==="files"&&<>
            <div style={{marginBottom:14}}>
              {comments.filter(c=>c.type==="file").length===0&&<Empty icon="📎" text="No files uploaded yet" sub="Use the comment area to upload files"/>}
              {comments.filter(c=>c.type==="file").sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).map((c,i)=>{
                const auth=users.find(u=>u.id===c.author_id);
                return(<div key={c.id} style={{display:"flex",alignItems:"flex-start",gap:12,padding:"10px 0",borderBottom:`1px solid ${T.gray100}`}}>
                  <div style={{width:32,height:32,borderRadius:8,background:T.amber50,border:`1px solid #FCD34D`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:16}}>📎</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:600,color:T.gray900}}>Version {comments.filter(c2=>c2.type==="file").length-i}</div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:4}}>{(c.files||[]).map((f,j)=><span key={j} className="fchip"><IcoFile s={10} c={T.secondary}/> {f}</span>)}</div>
                    {c.content&&c.content!==`Uploaded ${(c.files||[]).length} file(s): ${(c.files||[]).join(", ")}`&&<div style={{fontSize:12,color:T.gray600,marginTop:4}}>{c.content}</div>}
                    <div style={{fontSize:10,color:T.gray400,marginTop:4}}>Uploaded by {auth?.name} · {fmtTime(c.created_at)}</div>
                  </div>
                </div>);
              })}
            </div>
          </>}
        </div>
      </div>
    </div>
  );
}

// ── REQ DETAIL MODAL ──────────────────────────────────────────
function ReqDetailModal({req,tasks,users,activity,onClose}){
  const [tab,setTab]=useState("overview");
  return(
    <div className="mo" onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div className="modal">
        <div className="modal-hdr">
          <div className="mi">📋</div>
          <div style={{flex:1}}><div className="mt">{req.title}</div><div className="ms">{req.request_id}</div></div>
          <button className="mc" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
            <StatusBadge status={req.status}/><PriorityBadge priority={req.priority}/>
            <DeadlineBadge deadline={req.deadline} status={req.status}/>
          </div>
          <div className="tabs">
            <div className={`tab${tab==="overview"?" active":""}`} onClick={()=>setTab("overview")}>Overview</div>
            <div className={`tab${tab==="tasks"?" active":""}`} onClick={()=>setTab("tasks")}>Tasks</div>
            <div className={`tab${tab==="history"?" active":""}`} onClick={()=>setTab("history")}>History</div>
          </div>
          {tab==="overview"&&<>
            <div className="ir">
              <span className="ii">From: <b>{req.applicant_name}</b></span>
              <span className="ii">Role: <b>{req.role_title||"—"}</b></span>
              <span className="ii">Dept: <b>{req.department}</b></span>
              <span className="ii">Email: <b>{req.email}</b></span>
              <span className="ii">Deadline: <b>{fmtDate(req.deadline)}</b></span>
              <span className="ii">Workload: <b>{req.workload||"—"}</b></span>
            </div>
            {req.description&&<div style={{fontSize:13,background:T.gray50,borderRadius:9,padding:"10px 13px",marginBottom:12,color:T.gray700,lineHeight:1.6}}>{req.description}</div>}
            {req.guideline_link&&<div style={{fontSize:12,marginBottom:10}}><a href={req.guideline_link} target="_blank" rel="noreferrer" style={{color:T.secondary}}>🔗 {req.guideline_link}</a></div>}
            {req.attachments?.length>0&&<div style={{fontSize:12,color:T.gray600,marginBottom:12}}><span className="tag"><IcoFile s={11} c={T.gray500}/> {req.attachments.join(", ")}</span></div>}
            {req.reject_reason&&<div style={{background:T.red50,border:"1px solid #FCA5A5",borderRadius:9,padding:"10px 13px",fontSize:13,color:T.red700,fontWeight:600}}>✕ Rejected: {req.reject_reason}</div>}
          </>}
          {tab==="tasks"&&<>
            {tasks.length===0&&<Empty icon="👤" text="No tasks assigned yet"/>}
            {tasks.map(t=>{const d=users.find(u=>u.id===t.designer_id);return(
              <div key={t.id} style={{display:"flex",gap:10,alignItems:"center",padding:"9px 0",borderBottom:`1px solid ${T.gray100}`}}>
                <span style={{fontFamily:"monospace",fontSize:10,color:T.gray400,flex:1}}>{t.task_id}</span>
                <Avatar name={d?.name||"?"} size={22} fontSize={9} color={d?.avatar_color||T.secondary} img={d?.avatar_img||undefined}/>
                <span style={{fontSize:12,color:T.gray700}}>{d?.name}</span>
                <StatusBadge status={t.status}/>
                {t.revision_count>0&&<span style={{fontSize:10,color:"#991B1B",fontWeight:600}}>R×{t.revision_count}</span>}
              </div>
            );})}
          </>}
          {tab==="history"&&<>
            {activity.length===0&&<Empty icon="📜" text="No history yet"/>}
            {activity.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).map(a=>{
              const actor=users.find(u=>u.id===a.actor_id);
              return(<div key={a.id} className="activity-item">
                <div className="activity-dot system"/>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,color:T.gray700}}><b style={{color:T.gray900}}>{actor?.name||"System"}</b> — {a.detail}</div>
                  <div style={{fontSize:10,color:T.gray400,marginTop:3}}>{fmtTime(a.created_at)}</div>
                </div>
              </div>);
            })}
          </>}
        </div>
      </div>
    </div>
  );
}

// ── USER MODALS ───────────────────────────────────────────────
function AddUserModal({onClose,onAdd}){
  const [fm,setFm]=useState({name:"",email:"",password:"pass",role:"designer",department:"Design",phone:""});
  const setF=(k,v)=>setFm(x=>({...x,[k]:v}));
  return(
    <div className="mo" onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div className="modal" style={{maxWidth:480}}>
        <div className="modal-hdr"><div className="mi">👤</div><div><div className="mt">Add Team Member</div></div><button className="mc" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div className="g2">
            <div className="fg"><label className="fl">Full Name *</label><input className="fi" value={fm.name} onChange={e=>setF("name",e.target.value)}/></div>
            <div className="fg"><label className="fl">Email *</label><input className="fi" type="email" value={fm.email} onChange={e=>setF("email",e.target.value)}/></div>
            <div className="fg"><label className="fl">Role</label><select className="fi" value={fm.role} onChange={e=>setF("role",e.target.value)}>{ALL_ROLES.map(r=><option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></div>
            <div className="fg"><label className="fl">Department</label><select className="fi" value={fm.department} onChange={e=>setF("department",e.target.value)}>{DEPARTMENTS.map(d=><option key={d}>{d}</option>)}</select></div>
            <div className="fg"><label className="fl">Phone</label><input className="fi" value={fm.phone} onChange={e=>setF("phone",e.target.value)}/></div>
            <div className="fg"><label className="fl">Password *</label><input className="fi" type="password" value={fm.password} onChange={e=>setF("password",e.target.value)}/></div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={()=>{if(!fm.name||!fm.email)return alert("Name and email required");onAdd(fm);}}>Create Member</button>
        </div>
      </div>
    </div>
  );
}
function EditUserModal({user,onClose,onSave}){
  const [fm,setFm]=useState({name:user.name,email:user.email,role:user.role,department:user.department,phone:user.phone||"",bio:user.bio||"",avatar_color:user.avatar_color||T.secondary,avatar_img:user.avatar_img||""});
  const setF=(k,v)=>setFm(x=>({...x,[k]:v}));
  const COLORS=["#0857C3","#1D6FBB","#0E7490","#7C3AED","#DB2777","#059669","#D97706","#DC2626","#0891B2","#65A30D"];
  const imgRef=useRef();
  const handleImg=e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>5*1024*1024){alert("Max 5 MB");return;}const reader=new FileReader();reader.onload=ev=>setF("avatar_img",ev.target.result);reader.readAsDataURL(file);};
  return(
    <div className="mo" onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div className="modal" style={{maxWidth:520}}>
        <div className="modal-hdr">
          <div style={{position:"relative",flexShrink:0}}>
            <Avatar name={fm.name} size={38} color={fm.avatar_color} img={fm.avatar_img||undefined}/>
            <div onClick={()=>imgRef.current.click()} style={{position:"absolute",bottom:-2,right:-2,width:16,height:16,borderRadius:"50%",background:T.primary,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",border:"2px solid #fff",fontSize:9}}>📷</div>
          </div>
          <div><div className="mt">Edit Member</div><div className="ms">{user.email}</div></div>
          <button className="mc" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <input ref={imgRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleImg}/>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,padding:"9px 12px",background:T.gray50,borderRadius:8}}>
            <button className="btn btn-sm btn-outline" onClick={()=>imgRef.current.click()}>Upload Photo</button>
            {fm.avatar_img&&<button className="btn btn-sm btn-ghost-red" onClick={()=>setF("avatar_img","")}>✕ Remove</button>}
            {!fm.avatar_img&&<div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{COLORS.map(c=><div key={c} onClick={()=>setF("avatar_color",c)} style={{width:20,height:20,borderRadius:"50%",background:c,cursor:"pointer",border:fm.avatar_color===c?"3px solid #0F172A":"2px solid transparent"}}/>)}</div>}
          </div>
          <div className="g2">
            <div className="fg"><label className="fl">Full Name *</label><input className="fi" value={fm.name} onChange={e=>setF("name",e.target.value)}/></div>
            <div className="fg"><label className="fl">Email *</label><input className="fi" value={fm.email} onChange={e=>setF("email",e.target.value)}/></div>
            <div className="fg"><label className="fl">Role</label><select className="fi" value={fm.role} onChange={e=>setF("role",e.target.value)}>{ALL_ROLES.map(r=><option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></div>
            <div className="fg"><label className="fl">Department</label><select className="fi" value={fm.department} onChange={e=>setF("department",e.target.value)}>{DEPARTMENTS.map(d=><option key={d}>{d}</option>)}</select></div>
            <div className="fg"><label className="fl">Phone</label><input className="fi" value={fm.phone} onChange={e=>setF("phone",e.target.value)}/></div>
          </div>
          <div className="fg"><label className="fl">Bio</label><textarea className="fi" value={fm.bio} onChange={e=>setF("bio",e.target.value)} style={{minHeight:60}}/></div>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={()=>{if(!fm.name||!fm.email)return alert("Required");onSave(fm);}}>Save Changes</button>
        </div>
      </div>
    </div>
  );
}
