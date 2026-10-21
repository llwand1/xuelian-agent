import { useEffect } from 'react';
import { hasHost, postToHost } from './float-view';
import { HOST_INVITE } from './CompanionInvitation';
export function EmptyStudyMail({ preparing, onClose }: { preparing: boolean; onClose: () => void }) {
  const caption = preparing ? '正在安静备题，准备好后吉祥物会用动作告诉你。' : '暂时没有新的学习来信。提醒时间可在番茄钟旁设置。';
  useEffect(() => {
    if (hasHost()) postToHost(HOST_INVITE + JSON.stringify({ id: 'mail-empty', topic: caption, kind: 'empty', manual: true, reducedMotion: true }));
  }, [caption]);
  useEffect(() => () => { if (hasHost()) postToHost(HOST_INVITE + 'off:mail-empty'); }, []);
  if (hasHost()) return null;
  return <aside className="sb-companion-invitation" aria-label="学习来信"><small>✦ 学习来信</small><p>{caption}</p><button onClick={onClose}>收起学习来信</button></aside>;
}
