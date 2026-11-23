import { afterEach, describe, expect, it } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
import { createServer, type AddressInfo } from 'node:net';
import { WebSocketTransport, type CloseInfo } from '../src/index.js';

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function until(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** A local server that records what each connection sends and exposes its sockets. */
async function server(): Promise<{
  url: string;
  sockets: WebSocket[];
  received: string[];
}> {
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await new Promise<void>((resolve) => wss.once('listening', () => resolve()));
  cleanups.push(
    () =>
      new Promise<void>((resolve) => {
        for (const client of wss.clients) client.terminate();
        wss.close(() => resolve());
      }),
  );
  const sockets: WebSocket[] = [];
  const received: string[] = [];
  wss.on('connection', (socket) => {
    sockets.push(socket);
    socket.on('message', (data, isBinary) => {
      if (!isBinary) received.push(data.toString());
    });
  });
  const { port } = wss.address() as AddressInfo;
  return { url: `ws://127.0.0.1:${port}`, sockets, received };
}

/** A TCP listener that drops every connection, so a WebSocket handshake to it always fails. */
async function refusing(): Promise<string> {
  const tcp = createServer((socket) => socket.destroy());
  await new Promise<void>((resolve) => tcp.listen(0, '127.0.0.1', () => resolve()));
  cleanups.push(() => new Promise<void>((resolve) => tcp.close(() => resolve())));
  const { port } = tcp.address() as AddressInfo;
  return `ws://127.0.0.1:${port}`;
}

function connect(url: string): WebSocketTransport {
  // `ws` implements every member the transport uses, but not the full DOM `WebSocket` type.
  const WebSocketImpl = WebSocket as unknown as typeof globalThis.WebSocket;
  const transport = new WebSocketTransport(url, { WebSocketImpl });
  cleanups.push(() => transport.close());
  return transport;
}

describe('WebSocketTransport', () => {
  it('queues sends made before the socket opens and flushes them in order', async () => {
    const srv = await server();
    const transport = connect(srv.url);
    expect(transport.open).toBe(true);
    transport.send('one');
    transport.send('two');
    await until(() => srv.received.length === 2);
    transport.send('three');
    await until(() => srv.received.length === 3);
    expect(srv.received).toEqual(['one', 'two', 'three']);
  });

  it('signals open once the socket opens, and at once to later listeners', async () => {
    const srv = await server();
    const transport = connect(srv.url);
    const opens: string[] = [];
    transport.onOpen((): void => void opens.push('early'));
    expect(opens).toEqual([]);
    await until(() => opens.length === 1);
    transport.onOpen((): void => void opens.push('late'));
    expect(opens).toEqual(['early', 'late']);
  });

  it('never signals open for a connection that fails', async () => {
    const url = await refusing();
    const transport = connect(url);
    let opened = 0;
    transport.onOpen(() => opened++);
    await until(() => !transport.open);
    transport.onOpen(() => opened++);
    expect(opened).toBe(0);
  });

  it('delivers server messages in order', async () => {
    const srv = await server();
    const transport = connect(srv.url);
    const got: string[] = [];
    transport.onMessage((text) => got.push(text));
    await until(() => srv.sockets.length === 1);
    for (const text of ['a', 'b', 'c']) srv.sockets[0]?.send(text);
    await until(() => got.length === 3);
    expect(got).toEqual(['a', 'b', 'c']);
  });

  it('passes the close code and reason through to close listeners', async () => {
    const srv = await server();
    const transport = connect(srv.url);
    const infos: Array<CloseInfo | undefined> = [];
    transport.onClose((info) => infos.push(info));
    await until(() => srv.sockets.length === 1);
    srv.sockets[0]?.close(4001, 'superseded');
    await until(() => infos.length === 1);
    expect(infos).toEqual([{ code: 4001, reason: 'superseded' }]);
    expect(transport.open).toBe(false);
  });

  it('reports a failed connection as an abnormal close', async () => {
    const url = await refusing();
    const transport = connect(url);
    const infos: Array<CloseInfo | undefined> = [];
    transport.onClose((info) => infos.push(info));
    transport.send('lost');
    await until(() => infos.length === 1);
    expect(infos[0]?.code).toBe(1006);
    expect(transport.open).toBe(false);
  });

  it('never throws and delivers nothing after close', async () => {
    const srv = await server();
    const transport = connect(srv.url);
    const got: string[] = [];
    const infos: Array<CloseInfo | undefined> = [];
    transport.onMessage((text) => got.push(text));
    transport.onClose((info) => infos.push(info));
    await until(() => srv.sockets.length === 1);
    transport.close();
    transport.close();
    expect(transport.open).toBe(false);
    expect(() => transport.send('late')).not.toThrow();
    srv.sockets[0]?.send('ignored');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(got).toEqual([]);
    expect(srv.received).toEqual([]);
    expect(infos).toEqual([{ code: 1000, reason: '' }]);
  });

  it('closes a socket that is still connecting without throwing', async () => {
    const srv = await server();
    const transport = connect(srv.url);
    transport.send('never');
    expect(() => transport.close()).not.toThrow();
    expect(() => transport.send('after')).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(srv.received).toEqual([]);
  });

  it('stops notifying unsubscribed listeners', async () => {
    const srv = await server();
    const transport = connect(srv.url);
    const got: string[] = [];
    let closed = 0;
    const offMessage = transport.onMessage((text) => got.push(text));
    const offClose = transport.onClose(() => closed++);
    await until(() => srv.sockets.length === 1);
    srv.sockets[0]?.send('one');
    await until(() => got.length === 1);
    offMessage();
    offClose();
    srv.sockets[0]?.send('two');
    srv.sockets[0]?.close(1000, '');
    await until(() => !transport.open);
    expect(got).toEqual(['one']);
    expect(closed).toBe(0);
  });
});
