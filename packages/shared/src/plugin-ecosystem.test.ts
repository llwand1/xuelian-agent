import { expect, it } from 'vitest';
import { parsePluginManifest, parsePluginRepositories } from './plugin-ecosystem.js';
import { localAgentManifest, TINYFISH_PLUGIN } from './plugin-presets.js';
const manifest = {schemaVersion:1,id:'reader',name:'Reader',version:'1.0.0',description:'Remote reader',transport:'streamable-http',endpoint:'https://mcp.example.com/mcp',tools:['read','read']};
it('parses credential-free remote declarations and deduplicates explicit tools',()=>{
  expect(parsePluginManifest(manifest).tools).toEqual(['read']);
});
it.each(['http://mcp.example.com/mcp','https://user:secret@mcp.example.com/mcp','https://127.0.0.1/mcp','https://mcp.example.com/mcp?token=secret','https://mcp.example.com/mcp#fragment'])('rejects unsafe endpoint %s',endpoint=>{
  expect(()=>parsePluginManifest({...manifest,endpoint})).toThrow();
});
it.each([{command:'node'},{headers:{Authorization:'secret'}},{trusted:true},{schemaVersion:2},{id:'../escape'},{tools:[]},{tools:Array(33).fill('read')}])('rejects unsupported or executable declarations %j',patch=>{
  expect(()=>parsePluginManifest({...manifest,...patch})).toThrow();
});
it('normalizes only explicit repository identities; no wildcards, traversal or malformed scopes',()=>{
  expect(parsePluginRepositories(['Owner/Repo','owner/repo'])).toEqual(['owner/repo']);
  for(const bad of [['*/*'],['owner/repo/other'],['owner/..'],['https://github.com/a/b'],Array(51).fill('a/b')]) expect(()=>parsePluginRepositories(bad)).toThrow();
});
it('v2 requires publisher, semver, authentication, network and a permission for every tool',()=>{
  expect(parsePluginManifest(TINYFISH_PLUGIN)).toEqual(TINYFISH_PLUGIN);
  expect(TINYFISH_PLUGIN.auth).toBe('x-api-key');
  for (const patch of [{publisher:undefined},{permissions:{}},{permissions:{search:'admin'}},{version:'1'},{auth:'oauth'},{network:'lan'},{tools:['search','search']}]) {
    expect(()=>parsePluginManifest({...TINYFISH_PLUGIN,...patch})).toThrow();
  }
});
it('v2 loopback is explicit, authenticated, agent-only and never allows LAN or rebinding hostnames',()=>{
  const local = localAgentManifest('http://127.0.0.1:4011/mcp');
  expect(parsePluginManifest(local)).toEqual(local);
  expect(localAgentManifest('http://[::1]:4011/mcp').network).toBe('loopback');
  for (const endpoint of ['http://localhost:4011/mcp','http://192.168.1.2:4011/mcp','http://0.0.0.0:4011/mcp','http://127.0.0.2:4011/mcp','http://127.0.0.1:80/mcp','https://127.0.0.1:4011/mcp','http://127.0.0.1:4011/mcp?key=secret']) expect(()=>localAgentManifest(endpoint)).toThrow();
  for (const patch of [{auth:'none'},{kind:'service'},{network:'public'},{schemaVersion:1}]) expect(()=>parsePluginManifest({...local,...patch})).toThrow();
});

