// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Provider } from '@sb/shared';
const api = vi.hoisted(()=>({list:vi.fn(),roles:vi.fn(),models:vi.fn(),remove:vi.fn()}));
vi.mock('../../lib/api',()=>({api:{providers:api},ApiError:class extends Error {}}));
vi.mock('./PlatformChannelCard',()=>({PlatformChannelCard:()=> <div>channel mounted</div>}));
import { ModelSettings } from './ModelSettings';
let rows: Provider[];
beforeEach(()=>{
  vi.clearAllMocks(); rows=[
    {id:'openai-default',name:'默认通道',baseUrl:'https://example.com',ownerId:null,type:'openai',enabled:true,editable:true,deletable:false},
    {id:'local',name:'本机自建',baseUrl:'https://example.com',ownerId:null,type:'openai',enabled:true,editable:true,deletable:true},
  ];
  api.list.mockImplementation(async()=>rows); api.roles.mockResolvedValue({roles:[],bindings:[]}); api.models.mockResolvedValue({models:[]});
  api.remove.mockImplementation(async(id:string)=>{rows=rows.filter(r=>r.id!==id); return {ok:true};});
});
afterEach(cleanup);
it('can delete a NULL-owned local provider using server permissions, with explicit confirmation',async()=>{
  render(<ModelSettings/>); const button=await screen.findByRole('button',{name:'删除服务商 本机自建'});
  expect((button as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(button); expect(api.remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'取消'})); expect(api.remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'删除服务商 本机自建'})); fireEvent.click(screen.getByRole('button',{name:'确认删除'}));
  await waitFor(()=>expect(api.remove).toHaveBeenCalledWith('local'));
  await waitFor(()=>expect(screen.queryByText('本机自建')).toBeNull());
  expect(screen.getByRole('status').textContent).toContain('已删除服务商');
  expect(screen.getByText('系统通道 · 不可删除')).toBeTruthy();
});
it('does not offer a dead delete button for a hosted platform provider',async()=>{
  rows=[{...rows[0]!,editable:false,deletable:false}];
  render(<ModelSettings/>); await screen.findByText('默认通道');
  expect(screen.queryByRole('button',{name:/删除/})).toBeNull();
  expect(screen.getByText('平台管理 · 不可删除')).toBeTruthy();
});
it('shows a backend failure without hiding the row and prevents duplicate in-flight deletion',async()=>{
  let reject!: (e:Error)=>void; api.remove.mockReturnValue(new Promise((_r,j)=>{reject=j;}));
  render(<ModelSettings/>); fireEvent.click(await screen.findByRole('button',{name:'删除服务商 本机自建'}));
  fireEvent.click(screen.getByRole('button',{name:'确认删除'}));
  const pending=screen.getByRole('button',{name:'删除中…'}); expect((pending as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(pending); expect(api.remove).toHaveBeenCalledTimes(1);
  reject(new Error('暂时无法删除，请重试'));
  expect((await screen.findByRole('alert')).textContent).toContain('暂时无法删除'); expect(screen.getByText('本机自建')).toBeTruthy();
});
it('provider management does not mount the role table, default channel or fetch models implicitly', async () => {
  render(<ModelSettings page="providers" />);
  await screen.findByRole('button', { name: '删除服务商 本机自建' });
  expect(screen.queryByRole('table')).toBeNull();
  expect(screen.queryByText('channel mounted')).toBeNull();
  expect(api.models).not.toHaveBeenCalled();
});
it('role bindings are a separate page and load provider model candidates only there', async () => {
  render(<ModelSettings page="roles" />);
  await waitFor(() => expect(api.models).toHaveBeenCalledWith('local'));
  expect(screen.getByRole('table')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /删除服务商/ })).toBeNull();
  expect(screen.queryByRole('button', { name: '添加' })).toBeNull();
  expect(screen.queryByText('channel mounted')).toBeNull();
});
it('the default channel page does not load or render provider management and role bindings', () => {
  render(<ModelSettings page="channel" />);
  expect(screen.getByText('channel mounted')).toBeTruthy();
  expect(api.list).not.toHaveBeenCalled();
  expect(api.roles).not.toHaveBeenCalled();
  expect(api.models).not.toHaveBeenCalled();
  expect(screen.queryByRole('table')).toBeNull();
});
