import type { SVGProps } from "react";

export type IconName =
  | "calendar" | "challenge" | "trophy" | "settings" | "back" | "left" | "right"
  | "play" | "reset" | "speaker" | "mute" | "stop" | "flip" | "check" | "user";

export function Icon({name, size=24, ...props}: SVGProps<SVGSVGElement> & {name: IconName;size?:number}) {
  const base = {width:size,height:size,viewBox:"0 0 24 24",stroke:"currentColor",
    strokeWidth:1.8,strokeLinecap:"round" as const,strokeLinejoin:"round" as const,
    fill:"none", "aria-hidden":true as const,...props};
  switch(name){
    case "calendar": return <svg {...base}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/><path d="m9 16 2 2 4-5"/></svg>;
    case "challenge": return <svg {...base}><path d="M4 10v4m3-7v10m10-10v10m3-7v4M7 12h10"/><rect x="1" y="9" width="3" height="6" rx="1"/><rect x="20" y="9" width="3" height="6" rx="1"/></svg>;
    case "trophy": return <svg {...base}><path d="M7 4h10v7a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4v3a4 4 0 0 0 4 4m9-7h3v3a4 4 0 0 1-4 4M12 16v4m-4 0h8"/></svg>;
    case "settings": return <svg {...base}><path d="m10.2 3-.5 1.9-2 .8-1.7-.9-2 2 1 1.7-.8 2-1.9.5v2.8l1.9.5.8 2-1 1.7 2 2 1.7-.9 2 .8.5 1.9h2.8l.5-1.9 2-.8 1.7.9 2-2-1-1.7.8-2 1.9-.5V11l-1.9-.5-.8-2 1-1.7-2-2-1.7.9-2-.8L13 3h-2.8Z"/><circle cx="11.6" cy="12.4" r="3.3"/></svg>;
    case "back": return <svg {...base}><path d="m15 5-7 7 7 7"/></svg>;
    case "left": return <svg {...base}><path d="m15 6-6 6 6 6"/></svg>;
    case "right": return <svg {...base}><path d="m9 6 6 6-6 6"/></svg>;
    case "play": return <svg {...base}><path d="m8 5 11 7-11 7V5Z"/></svg>;
    case "reset": return <svg {...base}><path d="M3 10a9 9 0 1 1 2.7 7M3 4v6h6"/></svg>;
    case "speaker": return <svg {...base}><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 9a5 5 0 0 1 0 6m3-9a9 9 0 0 1 0 12"/></svg>;
    case "mute": return <svg {...base}><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6m0-6-5 6"/></svg>;
    case "stop": return <svg {...base}><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>;
    case "flip": return <svg {...base}><path d="m8 5 2-2h4l2 2h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3Z"/><path d="M7 11a5 5 0 0 1 8-2m0-3v3h-3M17 13a5 5 0 0 1-8 2m0 3v-3h3"/></svg>;
    case "check": return <svg {...base}><path d="m4 12 5 5L20 6"/></svg>;
    case "user": return <svg {...base}><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></svg>;
  }
}
