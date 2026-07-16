import * as signalR from '@microsoft/signalr';
import { API_BASE_URL } from './api';

let connection: signalR.HubConnection | null = null;

export function getHubConnection(): signalR.HubConnection {
  if (!connection) {
    connection = new signalR.HubConnectionBuilder()
      .withUrl(`${API_BASE_URL}/hub/simplanner`, {
        accessTokenFactory: () => {
          if (typeof window !== 'undefined') {
            return localStorage.getItem('token') ?? '';
          }
          return '';
        },
      })
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .configureLogging(signalR.LogLevel.Warning)
      .build();
  }
  return connection;
}

export async function startConnection(): Promise<void> {
  const hub = getHubConnection();
  if (
    hub.state === signalR.HubConnectionState.Disconnected
  ) {
    try {
      await hub.start();
    } catch (err) {
      console.warn('[SignalR] Failed to connect:', err);
    }
  }
}

export async function stopConnection(): Promise<void> {
  if (connection && connection.state !== signalR.HubConnectionState.Disconnected) {
    await connection.stop();
  }
}
