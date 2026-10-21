// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const api=vi.hoisted(()=>({localSupport:vi.fn(),import:vi.fn()}));
vi.mock('./plugin-api',()=>({pluginApi:api}));
import { LocalAgentConnect } from './LocalAgentConnect';
beforeEach(()=>{vi.clearAllMocks();api.localSupport.mockResolvedValue({supported:true});api.import.mockResolvedValue({});});
afterEach(cleanup);
it('requires desktop support, an explicit local endpoint and acknowledgement, then imports disabled',async()=>{
  const changed=vi.fn().mockResolvedValue(undefined);render(<LocalAgentConnect installed={false} onChange={changed}/>);
  await screen.findByLabelText('本机 MCP 地址');
  const button=screen.getByRole('button',{name:'添加 Agent 连接（默认停用）'});
  expect((button as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.change(screen.getByLabelText('本机 MCP 地址'),{target:{value:'http://192.168.1.1:4011/mcp'}});fireEvent.click(button);
  expect((await screen.findByRole('alert')).textContent).toContain('127.0.0.1');expect(api.import).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('本机 MCP 地址'),{target:{value:'http://127.0.0.1:4011/mcp'}});fireEvent.click(button);
  await waitFor(()=>expect(api.import).toHaveBeenCalledWith(expect.objectContaining({schemaVersion:2,kind:'agent',network:'loopback',auth:'bearer'})));
  await waitFor(()=>expect(changed).toHaveBeenCalledOnce());
});
it('does not provide an active local network form on the hosted website',async()=>{
  api.localSupport.mockRejectedValue(new Error('not desktop'));render(<LocalAgentConnect installed={false} onChange={async()=>{}}/>);
  await screen.findByText(/本地网络连接仅在桌面安装版提供/);
  expect(screen.queryByLabelText('本机 MCP 地址')).toBeNull();expect(api.import).not.toHaveBeenCalled();
});
