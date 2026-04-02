import { useCallback, useEffect, useRef } from 'react';

export function useNotifications(status, outages) {
  const notificationsAvailable = typeof window !== 'undefined' && 'Notification' in window;
  const permissionRef = useRef(notificationsAvailable ? Notification.permission : 'denied');
  const prevStateRef = useRef(null);
  const prevOutageCountRef = useRef(null);
  const prevCurrentOutageRef = useRef(null);
  const prevThermalRef = useRef(null);

  // Request permission once on mount
  useEffect(() => {
    if (!notificationsAvailable) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().then((p) => {
        permissionRef.current = p;
      });
    }
  }, [notificationsAvailable]);

  const notify = useCallback((title, body) => {
    if (!notificationsAvailable || permissionRef.current !== 'granted') return;
    try {
      new Notification(title, { body, icon: '/favicon.ico', tag: title });
    } catch { /* ignore */ }
  }, [notificationsAvailable]);

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
  }, [notify, status]);

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
  }, [notify, outages]);
}
