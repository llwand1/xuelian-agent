import { useEffect, useState } from 'react';
import type { CampfireOpener } from '@sb/shared';
import { hasHost, postToHost } from './float-view';
import './companion-invitation.css';
export const HOST_INVITE = 'sb-float:invite:';
export const HOST_CHALLENGE = 'sb-float:challenge:';
export const HOST_SNOOZE = 'sb-float:snooze:';
export const HOST_MAIL_OPEN = 'sb-float:mail-open';
export const HOST_MAIL_CLOSE = 'sb-float:mail-close';
export function CompanionInvitation({ opener, onChallenge, onSnooze, visible = false, snoozeMinutes = 2, onClose }: { opener: CampfireOpener; onChallenge: () => void; onSnooze: () => void; visible?: boolean; snoozeMinutes?: number; onClose?: () => void }) {
  const [reduced,setReduced]=useState(()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false);
  useEffect(()=>{
    const media=window.matchMedia?.('(prefers-reduced-motion: reduce)'), change=()=>setReduced(media?.matches??false);
    media?.addEventListener('change',change);return()=>media?.removeEventListener('change',change);
  },[]);
  useEffect(()=>{
    if(visible && hasHost())postToHost(HOST_INVITE+JSON.stringify({id:opener.id,topic:opener.question.topic,reducedMotion:reduced,manual:true,snoozeMinutes}));
  },[visible,opener.id,opener.question.topic,reduced,snoozeMinutes]);
  useEffect(()=>{if(visible)return()=>{if(hasHost())postToHost(HOST_INVITE+'off:'+opener.id);};},[visible,opener.id]);
  if(!visible || hasHost())return null;
  const caption=`${opener.question.topic}的小题出好了，快来挑战一下吧！`;
  return <aside className="sb-companion-invitation" aria-label="吉祥物练习邀请">
    <button className="sb-mail-close" aria-label="收起学习来信" onClick={onClose}>×</button><small>✦ 学习来信</small>
    <p aria-live="polite">{reduced?caption:<><span className="sb-invite-readable">{caption}</span><span aria-hidden="true">{Array.from(caption).map((char,index)=><span key={index} className={'sb-invite-char sb-invite-phase-'+Math.min(index,15)}>{char}</span>)}</span></>}</p>
    <div><button onClick={onChallenge}>挑战一下</button><button onClick={onSnooze}>稍后提醒 · {snoozeMinutes} 分钟</button></div>
  </aside>;
}
