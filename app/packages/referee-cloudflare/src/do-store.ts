import type { CreateRoomRequest } from '@wwd/protocol';
import type { RoomStore } from '@wwd/referee-service';
import { ROOM_URLS, type InitRequest } from './room-object.js';

/** Rooms kept by one Durable Object each, addressed by join code. */
export class DurableRoomStore implements RoomStore {
  constructor(private readonly rooms: DurableObjectNamespace) {}

  async create(code: string, request: CreateRoomRequest): Promise<'created' | 'collision'> {
    const body: InitRequest = { code, request };
    const res = await this.stub(code).fetch(ROOM_URLS.init, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 201) return 'created';
    if (res.status === 409) return 'collision';
    throw new Error(`room creation failed with status ${res.status}`);
  }

  /** Forwards a WebSocket upgrade request to the room's object. */
  connect(code: string, upgrade: Request): Promise<Response> {
    return this.stub(code).fetch(new Request(ROOM_URLS.socket, upgrade));
  }

  private stub(code: string): DurableObjectStub {
    return this.rooms.get(this.rooms.idFromName(code));
  }
}
