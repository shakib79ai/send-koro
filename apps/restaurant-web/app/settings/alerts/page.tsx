'use client';
import { useEffect, useState } from 'react';
import { Switch } from '@/components/ui';

export default function Alerts() {
  const [sound, setSound] = useState(false);
  const [perm, setPerm] = useState<string>('default');
  useEffect(() => {
    try { setSound(localStorage.getItem('sk.sound') === 'on'); } catch { /* ignore */ }
    if (typeof Notification !== 'undefined') setPerm(Notification.permission);
  }, []);
  const toggleSound = (v: boolean) => { setSound(v); try { localStorage.setItem('sk.sound', v ? 'on' : 'off'); } catch { /* ignore */ } };
  return (
    <div style={{ maxWidth: 760 }}>
      <div className="page-head"><div><h1>Alerts</h1><p className="small muted" style={{ margin: '4px 0 0' }}>How this device tells you about new orders.</p></div></div>
      <div className="card pad stack">
        <div className="row between"><div><b>Order sound on this device</b><div className="small muted">Rings every few seconds until someone accepts.</div></div><Switch on={sound} onChange={toggleSound} label="Order sound" /></div>
        <div className="row between"><div><b>Notifications</b><div className="small muted">{perm === 'granted' ? 'On for this device.' : perm === 'denied' ? 'Blocked — allow notifications in your browser settings.' : 'Get a notification even when this tab is in the background.'}</div></div>
          {perm !== 'granted' && perm !== 'denied' && <button className="btn sm" onClick={async () => setPerm(await Notification.requestPermission())}>Allow</button>}</div>
        <div className="note small">Tip: install this app on your tablet (Share → Add to Home Screen, or the install icon in Chrome’s address bar) and keep it open on the Live orders screen. Order printers can be added later.</div>
      </div>
    </div>
  );
}
