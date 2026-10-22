import React, { useState, useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { api } from './api.js';
import { folderOptions } from './resource-tree.js';

export function Icon({ name: shape = 'wave', size = 18 }) {
  const paths = { more: 'M5 12h.01M12 12h.01M19 12h.01', folderPlus: 'M3 6h7l2 2h9v12H3Zm9 5v6m-3-3h6', database: 'M20 6c0 2-16 2-16 0s16-2 16 0Zm0 0v12c0 2-16 2-16 0V6m0 6c0 2 16 2 16 0', chevron: 'm9 5 7 7-7 7', wave: 'M3 8c3-4 6 4 9 0s6 4 9 0M3 15c3-4 6 4 9 0s6 4 9 0', plus: 'M12 5v14M5 12h14', terminal: 'm5 6 5 6-5 6m8 0h6', close: 'm6 6 12 12M18 6 6 18', host: 'M4 4h16v12H4zM8 20h8m-4-4v4', chat: 'M21 11a9 9 0 0 1-9 9H4l-2 2v-10a9 9 0 1 1 19-1Z', folder: 'M3 6h7l2 2h9v12H3Z', search: 'M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5-2 6 6', arrow: 'M5 12h14m-6-6 6 6-6 6', refresh: 'M20 7a9 9 0 1 0 1 8M20 3v5h-5' };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[shape] || paths.wave}/></svg>;
}
export function useDialogFocus() {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement, dialog = ref.current;
    const controls = () => [...dialog.querySelectorAll('button:not(:disabled),input,select')];
    const input = dialog.querySelector('input'); (input || controls()[0])?.focus();
    const trap = event => {
      if (event.key !== 'Tab') return;
      const items = controls(), first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    dialog.addEventListener('keydown', trap);
    return () => { dialog.removeEventListener('keydown', trap); if (previous?.isConnected) previous.focus(); };
  }, []);
  return ref;
}
export function ResourceForm({ workspaceId, resource, navigation = [], parentId = '', onClose, onSaved }) {
  const dialog = useDialogFocus(), editing = Boolean(resource), local = resource?.kind === 'local';
  const old = resource?.ssh || resource?.settings || {};
  const [form, setForm] = useState({ name: resource?.name || '', host: old.host || '', port: String(old.port || 22), username: old.username || 'root', shell: old.shell || '', authMethod: old.authMethod || 'key', privateKeyPath: '', privateKey: '', password: '', passphrase: '', parentId });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const title = editing ? local ? '编辑本机终端' : '编辑 SSH 终端' : '添加 SSH 主机';
  const changedAuth = editing && form.authMethod !== (old.authMethod || 'key');
  function field(key, label, type = 'text', required = true) { return <label>{label}<input autoComplete={['password','passphrase'].includes(key) ? 'new-password' : 'off'} aria-label={label} required={required} type={type} min={type === 'number' ? 1 : undefined} max={type === 'number' ? 65535 : undefined} maxLength={key === 'name' ? 120 : undefined} value={form[key]} onChange={event => setForm({ ...form, [key]: event.target.value })}/></label>; }
  async function keyFile(event) {
    const file = event.target.files?.[0];
    if (!file) { setForm(value => ({ ...value, privateKey: '' })); return; }
    if (file.size > 1024 * 1024) { setError('私钥文件最大 1 MB'); setForm(value => ({ ...value, privateKey: '' })); event.target.value = ''; return; }
    try { const privateKey = await file.text(); setForm(value => ({ ...value, privateKey })); setError(''); }
    catch { setForm(value => ({ ...value, privateKey: '' })); setError('无法读取私钥文件'); }
  }
  async function submit(event) {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    try {
      const payload = { name: form.name };
      if (local) { if (form.shell || old.shell) payload.settings = { shell: form.shell }; }
      else {
        payload.ssh = { host: form.host, port: Number(form.port), username: form.username, ...(form.shell || old.shell ? { shell: form.shell } : {}), authMethod: form.authMethod };
        if (form.authMethod === 'password') { if (form.password) payload.ssh.password = form.password; }
        else {
          if (form.privateKey) payload.ssh.privateKey = form.privateKey;
          else if (!editing) payload.ssh.identityFile = form.privateKeyPath;
          if (form.passphrase) payload.ssh.passphrase = form.passphrase;
        }
      }
      if (!editing) { payload.kind = 'ssh'; payload.parentId = form.parentId; }
      const saved = await api(`/workspaces/${workspaceId}/resource-items` + (editing ? '/' + resource.id : ''), editing ? 'PATCH' : 'POST', payload);
      onSaved(saved, form.parentId); onClose();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <div className="lake-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section ref={dialog} className="lake-modal" role="dialog" aria-modal="true" aria-label={title} onKeyDown={event => { if (event.key === 'Escape' && !busy) onClose(); }}>
      <header><div><small>LAKE RESOURCES</small><h2>{title}</h2></div><button className="lake-icon" aria-label="关闭" onClick={onClose} disabled={busy}><Icon name="close"/></button></header>
      <form onSubmit={submit}><fieldset disabled={busy} className="lake-fields">{field('name', '终端名称')}
        {!local && <>{field('host', '主机地址')}<div className="lake-form-row">{field('port', '端口', 'number')}{field('username', '登录用户')}</div><fieldset><legend>登录方式</legend><div className="lake-segment">{[['key', 'SSH 密钥'], ['password', '密码']].map(([value, text]) => <button type="button" key={value} aria-pressed={form.authMethod === value} onClick={() => setForm({ ...form, authMethod: value })}>{text}</button>)}</div></fieldset>{form.authMethod === 'key' ? <>{!editing && field('privateKeyPath', '本机私钥路径', 'text', !form.privateKey)}<label>{editing ? '替换私钥文件' : '或选择私钥文件'}<input type="file" aria-label="选择私钥文件" required={changedAuth && !form.privateKey} onChange={keyFile}/></label>{field('passphrase', editing ? '私钥口令（留空保持原值）' : '私钥口令（可选）', 'password', false)}{editing && !changedAuth && <p className="lake-muted">未选择新私钥时，继续使用已保存的密钥。</p>}</> : field('password', editing && !changedAuth ? '登录密码（留空保持原值）' : '登录密码', 'password', !editing || changedAuth)}</>}
        <label>Shell<select aria-label="Shell" value={form.shell} onChange={event => setForm({ ...form, shell: event.target.value })}><option value="">默认</option>{['sh','bash','zsh','fish'].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        {!editing && <label>所属目录<select aria-label="所属目录" value={form.parentId} onChange={event => setForm({ ...form, parentId: event.target.value })}>{folderOptions(navigation).map(folder => <option key={folder.id} value={folder.id}>{folder.label}</option>)}</select></label>}
        </fieldset>{error && <p className="lake-error" role="alert">{error}</p>}<footer><button type="button" className="lake-button" onClick={onClose} disabled={busy}>取消</button><button className="lake-button lake-primary" disabled={busy}>{busy ? '保存中…' : editing ? '保存修改' : '添加主机'}</button></footer>
      </form>
    </section>
  </div>;
}
export function HostTrust({ trust, sessionId, onDone }) {
  const dialog = useDialogFocus(), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const prompt = trust.prompt;
  async function decide(accept) {
    setBusy(true);
    try { await api('/trust', 'POST', { dshSessionId: sessionId, projectId: trust.projectId, id: prompt.id, fingerprint: prompt.fingerprint, accept }); onDone(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <div className="lake-modal-backdrop"><section ref={dialog} className="lake-modal" role="dialog" aria-modal="true" aria-label="核对 SSH 服务器指纹">
    <header><div><small>SSH HOST KEY</small><h2>{prompt.changed ? '服务器指纹已变化' : '首次连接此主机'}</h2></div></header>
    <p>请通过可信渠道核对 {prompt.host}:{prompt.port} 的服务器指纹。</p><code className="lake-fingerprint">{prompt.algorithm}<br/>{prompt.fingerprint}</code>
    {prompt.changed && <p className="lake-error">原指纹：{prompt.previousFingerprints?.join(', ')}。确认变更原因后再信任。</p>}
    {error && <p className="lake-error" role="alert">{error}</p>}<div className="lake-dialog-actions"><button className="lake-button" disabled={busy} onClick={() => void decide(false)}>拒绝连接</button><button className="lake-button lake-primary" disabled={busy} onClick={() => void decide(true)}>信任并连接</button></div>
  </section></div>;
}
export function ResourceTerminal({ resource, sessionId, onClose }) {
  const el = useRef(null), [error, setError] = useState(''), [connected, setConnected] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); let terminalId, projectId, timer, writing = Promise.resolve(), output = '';
    const term = new Terminal({ fontSize: 13, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', cursorBlink: true, convertEol: true, theme: { background: '#151719', foreground: '#d8dee9', cursor: '#9bd4c3' } });
    const fit = new FitAddon(); term.loadAddon(fit); term.open(el.current);
    const observer = new ResizeObserver(() => { try { fit.fit(); } catch {} }); observer.observe(el.current);
    const send = (operation, data = {}) => api(`/terminals/${terminalId}/${operation}`, 'POST', { dshSessionId: sessionId, projectId, ...data }, controller.signal);
    term.onData(data => { if (terminalId) writing = writing.then(() => send('input', { data })).catch(e => { if (!controller.signal.aborted) setError(e.message); }); });
    term.onResize(({ cols, rows }) => { if (terminalId) void send('resize', { cols, rows }).catch(() => {}); });
    async function poll() {
      try {
        const history = await api(`/terminals/${terminalId}/history?` + new URLSearchParams({ dshSessionId: sessionId, projectId }), 'GET', undefined, controller.signal);
        if (history.output.startsWith(output)) term.write(history.output.slice(output.length)); else { term.reset(); term.write(history.output); }
        output = history.output;
      } catch (e) { if (!controller.signal.aborted) setError(e.message); }
      if (!controller.signal.aborted) timer = setTimeout(poll, 150);
    }
    api('/terminals/open', 'POST', { dshSessionId: sessionId, resourceId: resource.id }, controller.signal).then(result => {
      terminalId = result.terminal.id; projectId = result.projectId;
      if (controller.signal.aborted) { void api(`/terminals/${terminalId}/disconnect`, 'POST', { dshSessionId: sessionId, projectId }).catch(() => {}); return; }
      setConnected(true); fit.fit(); term.focus(); void send('resize', { cols: term.cols, rows: term.rows }).catch(() => {}); void poll();
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => { controller.abort(); clearTimeout(timer); observer.disconnect(); term.dispose(); if (terminalId) void api(`/terminals/${terminalId}/disconnect`, 'POST', { dshSessionId: sessionId, projectId }).catch(() => {}); };
  }, [resource.id, sessionId]);
  return <section className="lake-terminal" aria-label="Lake 资源终端"><header><div><Icon name="terminal"/><strong>{resource.name}</strong><span className={connected ? 'lake-online' : ''}>{error ? '连接异常' : connected ? '已连接' : '连接中'}</span></div><button className="lake-icon" aria-label="关闭资源终端" onClick={onClose}><Icon name="close"/></button></header>{error && <p role="alert" className="lake-error">{error}</p>}<div ref={el} className="lake-terminal-screen"/></section>;
}
