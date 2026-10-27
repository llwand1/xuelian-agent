// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
vi.mock('./ModelSettings', () => ({ ModelSettings: ({ page }: { page: string }) => <div>{page} mounted</div> }));
vi.mock('./SearchKeysCard', () => ({ SearchKeysCard: () => <div>search mounted</div> }));
vi.mock('./ExamModeCard', () => ({ ExamModeCard: () => <div>exam mounted</div> }));
vi.mock('./QuizMixCard', () => ({ QuizMixCard: () => <div>mix mounted</div> }));
vi.mock('./QuizImageCard', () => ({ QuizImageCard: () => <div>images mounted</div> }));
vi.mock('./QuizRealFirstCard', () => ({ QuizRealFirstCard: () => <div>real mounted</div> }));
vi.mock('./AnswerStyleCard', () => ({ AnswerStyleCard: () => <div>answer mounted</div> }));
vi.mock('./ToolsCard', () => ({ ToolsCard: () => <div>tools mounted</div> }));
vi.mock('../plugins/PluginsCard', () => ({ PluginsCard: () => <div>plugins mounted</div> }));
vi.mock('./SpeechCard', () => ({ SpeechCard: () => <div>speech mounted</div> }));
vi.mock('./AiHealthCard', () => ({ AiHealthCard: () => <div>health mounted</div> }));
vi.mock('./WaitDrillCard', () => ({ WaitDrillCard: () => <div>wait mounted</div> }));
vi.mock('./ReadingSizeCard', () => ({ ReadingSizeCard: () => <div>reading mounted</div> }));
vi.mock('./AgentTermsCard', () => ({ AgentTermsCard: () => <div>agents mounted</div> }));
vi.mock('./ExternalAgentCard', () => ({ ExternalAgentCard: () => <div>external-agent mounted</div> }));
import { SettingsView } from './SettingsView';
beforeEach(() => sessionStorage.clear());
afterEach(cleanup);
const desktop = () => within(screen.getByRole('navigation', { name: '设置分区' }).querySelector<HTMLElement>('.settings-groups')!);
const click = (name: string) => fireEvent.click(desktop().getByRole('button', { name }));
it('has seven groups and seventeen independent leaf pages, mounting exactly one at a time', () => {
  render(<SettingsView />);
  expect(desktop().getAllByRole('button', { expanded: false })).toHaveLength(6);
  expect(desktop().getAllByRole('button', { expanded: true })).toHaveLength(1);
  const groups = [
    ['模型与服务商', [['供应商管理', 'providers'], ['角色模型绑定', 'roles'], ['默认通道与额度', 'channel'], ['外置 Agent 对话', 'external-agent']]],
    ['学习与出题', [['考试范围', 'exam'], ['题型配比', 'mix'], ['真题优先', 'real'], ['图片题', 'images']]],
    ['联网搜索', [['搜索服务与密钥', 'search']]],
    ['阅读与交互', [['回答风格', 'answer'], ['词条朗读', 'speech'], ['阅读字号', 'reading'], ['等待练习', 'wait']]],
    ['插件中心', [['插件管理与接入', 'plugins']]],
    ['外部 Agent 授权', [['学习接口授权', 'agents']]],
    ['工具与诊断', [['工具权限与记录', 'tools'], ['AI 健康', 'health']]],
  ] as const;
  let count = 0;
  for (const [group, pages] of groups) {
    click(group);
    for (const [page, marker] of pages) {
      screen.getByRole('region').scrollTop = 900;
      click(page);
      const panel = screen.getByRole('region', { name: page });
      expect(panel.scrollTop).toBe(0);
      expect(within(panel).getByText(marker + ' mounted')).toBeTruthy();
      expect(screen.getAllByText(/ mounted$/)).toHaveLength(1);
      expect(desktop().getByRole('button', { name: page }).getAttribute('aria-current')).toBe('page');
      count++;
    }
  }
  expect(count).toBe(17);
});
it('remembers each group leaf and restores the last page after leaving settings', () => {
  const { unmount } = render(<SettingsView />);
  click('角色模型绑定'); click('学习与出题'); click('题型配比'); click('模型与服务商');
  expect(screen.getByRole('region', { name: '角色模型绑定' })).toBeTruthy();
  click('模型与服务商');
  expect(screen.getByRole('region', { name: '角色模型绑定' })).toBeTruthy();
  unmount(); render(<SettingsView />);
  expect(screen.getByRole('region', { name: '角色模型绑定' })).toBeTruthy();
});
it('mobile category selection and child navigation also replace the page, not scroll to anchors', () => {
  render(<SettingsView />);
  fireEvent.change(screen.getByRole('combobox', { name: '设置分类' }), { target: { value: 'experience' } });
  const mobile = within(screen.getByRole('navigation').querySelector<HTMLElement>('.settings-mobile-nav')!);
  fireEvent.click(mobile.getByRole('button', { name: '阅读字号' }));
  expect(screen.getByRole('region', { name: '阅读字号' })).toBeTruthy();
  expect(screen.queryByText('answer mounted')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '管理插件' }));
  expect(screen.getByRole('region', { name: '插件管理与接入' })).toBeTruthy();
});
it('ignores obsolete or malformed saved page ids', () => {
  sessionStorage.setItem('sb:settings-page', 'models');
  render(<SettingsView />);
  expect(screen.getByRole('region', { name: '供应商管理' })).toBeTruthy();
});
