import { useEffect, useRef } from 'react';

export function useNotifications(status, outages) {
  const permissionRef = useRef(Notification.permission);
  const prevStateRef = useRef(null);
  const prevOutageCountRef = useRef(null);
  const prevCurrentOutageRef = useRef(null);
  const prevThermalRef = useRef(null);

  // Request permission once on mount
  useEffect(() => {
    if (Notification.permission === 'default') {
      Notification.requestPermission().then((p) => {
        permissionRef.current = p;
      });
    }
  }, []);

  function notify(title, body, icon) {
    if (permissionRef.current !== 'granted') return;
    try {
      new Notification(title, { body, icon: '/favicon.ico', tag: title });
    } catch { /* ignore */ }
  }

  // Watch for state changes
  useEffect(() => {
    if (!status) return;
    const state = status?.header?.state;
    const thermal = status?.alerts?.alert_thermal_throttle;

    if (prevStateRef.current !== null && prevStateRef.current !== state) {
      if (state === 'CONNECTED') {
        notify('Starlink Online', 'Connection restored', null);
      } else if (prevStateRef.current === 'CONNECTED') {
        notify('Starlink Offline', `State changed to ${state}`, null);
      }
    }
    prevStateRef.current = state;

    if (prevThermalRef.current === false && thermal === true) {
      notify('Thermal Throttle', 'Starlink dish is thermal throttling', null);
    }
    prevThermalRef.current = thermal ?? null;
  }, [status]);

  // Watch for new outages
  useEffect(() => {
    if (!outages) return;
    const count = outages.outages?.length ?? 0;
    const current = outages.current;

    if (prevOutageCountRef.current !== null && count > prevOutageCountRef.current) {
      notify('Outage Detected', 'A new connectivity outage was recorded', null);
    }
    prevOutageCountRef.current = count;

    if (prevCurrentOutageRef.current === true && current === false) {
      notify('Outage Resolved', 'Connectivity has been restored', null);
    }
    prevCurrentOutageRef.current = current;
  }, [outages]);
}
