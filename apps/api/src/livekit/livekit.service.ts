import { Injectable, Logger } from '@nestjs/common';
import { DataPacket_Kind, RoomServiceClient } from 'livekit-server-sdk';

@Injectable()
export class LivekitService {
  private log = new Logger('Livekit');
  private _client?: RoomServiceClient;

  private get client() {
    if (!this._client) {
      const host = (process.env.LIVEKIT_URL ?? '').replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
      this._client = new RoomServiceClient(host, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
    }
    return this._client;
  }

  /** Server-originated message to everyone in a room. Never throws. */
  async broadcast(room: string, topic: string, payload: unknown) {
    try {
      await this.client.sendData(
        room,
        new TextEncoder().encode(JSON.stringify(payload)),
        DataPacket_Kind.RELIABLE,
        { topic },
      );
    } catch (e) {
      this.log.warn(`broadcast failed: ${(e as Error).message}`);
    }
  }

  async removeParticipant(room: string, identity: string) {
    try { await this.client.removeParticipant(room, identity); }
    catch (e) { this.log.warn(`removeParticipant failed: ${(e as Error).message}`); }
  }

  async deleteRoom(room: string) {
    try { await this.client.deleteRoom(room); }
    catch (e) { this.log.warn(`deleteRoom failed: ${(e as Error).message}`); }
  }

  /** Viewers per room (participants minus the host). Returns an empty map if LiveKit is unreachable. */
  async viewerCounts(roomNames: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (roomNames.length === 0) return out;
    try {
      const rooms = await this.client.listRooms(roomNames);
      for (const r of rooms) out.set(r.name, Math.max(0, Number(r.numParticipants) - 1));
    } catch (e) {
      this.log.warn(`viewerCounts failed: ${(e as Error).message}`);
    }
    return out;
  }
}
