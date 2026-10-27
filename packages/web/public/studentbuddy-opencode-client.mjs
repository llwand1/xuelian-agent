/** Native OpenCode 1.x session/SSE adapter; no model keys are read or copied. */
export class OpenCodeClient {
  constructor({ baseUrl, username = 'studentbuddy', password, signal, agent = 'studentbuddy' }) {
    const url = new URL(baseUrl);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.search || url.hash) throw new Error('OpenCode backend must use explicit loopback HTTP');
    this.baseUrl = url.href.replace(/\/$/, ''); this.headers = { Authorization: 'Basic ' + Buffer.from(username + ':' + password).toString('base64'), 'Content-Type': 'application/json' };
    this.signal = signal; this.agent = agent; this.sessionId = ''; this.completed = false; this.streamController = new AbortController();
    this.onAbort = () => { this.streamController.abort(); this.abortPromise = this.abortNative(); };
    signal.addEventListener('abort', this.onAbort, { once: true });
    if (signal.aborted) this.onAbort();
  }
  async request(route, body, method = body === undefined ? 'GET' : 'POST', signal = this.signal) {
    const response = await fetch(this.baseUrl + route, { method, headers: this.headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal, redirect: 'error' });
    if (!response.ok) { await response.body?.cancel(); throw new Error(`OpenCode backend HTTP ${response.status}`); }
    let text = '', size = 0; const decoder = new TextDecoder();
    for await (const chunk of response.body) {
      size += chunk.length; if (size > 4 * 1024 * 1024) throw new Error('OpenCode response too large'); text += decoder.decode(chunk, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  }
  async initialize() {
    const health = await this.request('/global/health');
    if (!health.healthy) throw new Error('OpenCode backend is not healthy');
    const agents = await this.request('/agent');
    const agent = agents.find(value => value.name === this.agent);
    const wildcard = agent?.permission?.filter(rule => rule.permission === '*' && rule.pattern === '*').at(-1);
    if (!agent || wildcard?.action !== 'deny') throw new Error('OpenCode text-only agent is missing or tool permissions are not denied');
    const ids = await this.request('/experimental/tool/ids');
    if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string')) throw new Error('OpenCode tool catalog is invalid');
    this.tools = Object.fromEntries(ids.map(id => [id, false]));
  }
  async models() {
    const catalog = await this.request('/config/providers');
    return (catalog.providers || []).flatMap(provider => Object.keys(provider.models || {}).map(id => `${provider.id}/${id}`));
  }
  model(value) {
    if (value === 'default') return undefined;
    const separator = value.indexOf('/');
    if (separator < 1 || separator === value.length - 1 || /[\r\n\0]/.test(value)) throw new Error('OpenCode model must be provider/model, or default');
    return { providerID: value.slice(0, separator), modelID: value.slice(separator + 1) };
  }
  async readEvents(onEvent) {
    const signal = AbortSignal.any([this.signal, this.streamController.signal]);
    const response = await fetch(this.baseUrl + '/event', { headers: this.headers, signal, redirect: 'error' });
    if (!response.ok || !response.body) throw new Error('OpenCode event stream unavailable');
    // Resolve readiness only after subscription has actually been opened.
    this.streamReady?.();
    let buffer = ''; const decoder = new TextDecoder();
    for await (const bytes of response.body) {
      buffer += decoder.decode(bytes, { stream: true }).replace(/\r/g, '');
      if (buffer.length > 1024 * 1024) throw new Error('OpenCode event frame too large');
      let end;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const raw = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        const data = raw.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
        if (data) onEvent(JSON.parse(data));
      }
    }
  }
  async chat(messages, model, _cwd, onDelta) {
    const selected = this.model(model);
    const session = await this.request('/session', { title: 'StudentBuddy · external text conversation', agent: this.agent,
      permission: [{ permission: '*', pattern: '*', action: 'deny' }] });
    if (typeof session.id !== 'string' || !/^ses[\w-]+$/.test(session.id)) throw new Error('OpenCode returned an invalid session');
    this.sessionId = session.id;
    const roles = new Map(), parts = new Map(); let output = '';
    const append = text => {
      if (!text) return;
      if (output.length + text.length > 500000) throw new Error('OpenCode answer exceeds size limit');
      output += text; onDelta(text);
    };
    const onEvent = event => {
      const p = event.properties || event.data || {};
      const sid = p.sessionID || p.info?.sessionID || p.part?.sessionID;
      if (sid !== this.sessionId) return;
      if (event.type === 'session.status' && p.status?.type === 'retry') {
        const quota = /free usage exceeded|quota|insufficient.credit/i.test(p.status.message || '');
        throw new Error(quota ? 'OpenCode provider quota exhausted; request stopped before automatic retry. Select an available model in OpenCode.' : 'OpenCode provider requested a retry; request stopped without replay. Check provider availability in OpenCode.');
      }
      if (event.type === 'session.error') throw new Error('OpenCode session failed; check the selected provider in OpenCode.');
      if (event.type === 'message.updated' && p.info) roles.set(p.info.id, p.info.role);
      if (event.type === 'message.part.updated' && p.part) {
        const part = p.part;
        if (part.type !== 'text' || roles.get(part.messageID) !== 'assistant') return;
        const prior = parts.get(part.id)?.text || '';
        parts.set(part.id, { text: part.text || '', type: 'text' });
        if (typeof part.text === 'string' && part.text.startsWith(prior)) append(part.text.slice(prior.length));
      }
      if (event.type === 'message.part.delta' && p.field === 'text' && roles.get(p.messageID) === 'assistant') {
        const part = parts.get(p.partID);
        if (!part || part.type !== 'text' || typeof p.delta !== 'string') return;
        part.text += p.delta; append(p.delta);
      }
    };
    let streamFailure;
    let rejectEvents;
    const failed = new Promise((_resolve, reject) => { rejectEvents = reject; });
    const ready = new Promise(resolve => { this.streamReady = resolve; });
    const events = this.readEvents(onEvent).catch(error => { streamFailure = error; this.streamReady?.(); rejectEvents(error); });
    try {
      const response = await Promise.race([failed, (async () => {
        await ready; this.signal.throwIfAborted();
        if (streamFailure) throw streamFailure;
        return this.request(`/session/${this.sessionId}/message`, {
        ...(selected ? { model: selected } : {}), agent: this.agent, tools: this.tools,
        system: messages.filter(message => message.role === 'system').map(message => message.content).join('\n\n'),
        parts: [{ type: 'text', text: JSON.stringify({ conversation: messages.filter(message => message.role !== 'system') }) }],
        });
      })()]);
      if (response.info?.error) {
        const code = response.info.error.data?.statusCode;
        throw new Error(`OpenCode ${response.info.error.name || 'generation error'}${code ? ' HTTP ' + code : ''}; check the selected provider in OpenCode (no model fallback was used)`);
      }
      if (response.parts?.some(part => part.type === 'tool')) throw new Error('OpenCode returned a tool action in a text-only session');
      const final = (response.parts || []).filter(part => part.type === 'text').map(part => part.text || '').join('');
      if (!final.trim() || !['stop', 'end_turn', undefined].includes(response.info?.finish)) throw new Error('OpenCode did not complete a text answer');
      if (!final.startsWith(output)) throw new Error('OpenCode stream and final answer disagree');
      append(final.slice(output.length)); this.completed = true; return output;
    } finally {
      this.streamController.abort();
      if (!this.completed) this.abortPromise ||= this.abortNative();
      await events;
    }
  }
  async abortNative() {
    if (!this.sessionId || this.completed) return;
    try { await this.request(`/session/${this.sessionId}/abort`, {}, 'POST', AbortSignal.timeout(3000)); }
    catch { /* An unavailable server is reported by the original request, never retried. */ }
  }
  async stop() {
    this.signal.removeEventListener('abort', this.onAbort); this.streamController.abort();
    if (!this.completed) await (this.abortPromise || this.abortNative());
    if (this.sessionId) {
      // Archive our generated session, never delete or resume a user's OpenCode conversations.
      try { await this.request(`/session/${this.sessionId}`, { time: { archived: Date.now() } }, 'PATCH', AbortSignal.timeout(3000)); } catch { /* Best-effort archive is not a generation result. */ }
    }
  }
}
