import { Injectable } from "@nestjs/common";
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway } from "@nestjs/websockets";
import type { IncomingMessage } from "node:http";
import type { WebSocket } from "ws";
import { TokenService } from "../auth/token.service";
import { RedisService } from "../common/redis/redis.service";
import { VAULT_CHANGED_CHANNEL_PREFIX } from "./vault.service";

/**
 * A lightweight "something changed, re-sync" push over a raw WebSocket
 * (see infra choice in the plan: Redis pub/sub for multi-instance fan-out).
 * This is a nudge only — it carries no vault data, encrypted or otherwise.
 * The client's periodic chrome.alarms pull (sync-engine.ts) is the
 * reliability fallback if this connection drops, which MV3 service workers
 * do frequently on eviction.
 */
@WebSocketGateway({ path: "/vault/subscribe" })
@Injectable()
export class VaultGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly subscribers = new Map<WebSocket, RedisService>();

  constructor(
    private readonly tokens: TokenService,
    private readonly redis: RedisService,
  ) {}

  async handleConnection(client: WebSocket, request: IncomingMessage): Promise<void> {
    const url = new URL(request.url ?? "", "http://internal");
    const token = url.searchParams.get("token");
    if (!token) {
      client.close(4001, "Missing token");
      return;
    }

    let userId: string;
    try {
      userId = this.tokens.verifyAccessToken(token).sub;
    } catch {
      client.close(4001, "Invalid or expired token");
      return;
    }

    const subscriber = this.redis.duplicate() as unknown as RedisService;
    const channel = `${VAULT_CHANGED_CHANNEL_PREFIX}${userId}`;
    await subscriber.subscribe(channel);
    subscriber.on("message", () => {
      if (client.readyState === client.OPEN) {
        client.send(JSON.stringify({ type: "vault-changed" }));
      }
    });
    this.subscribers.set(client, subscriber);
  }

  handleDisconnect(client: WebSocket): void {
    const subscriber = this.subscribers.get(client);
    if (subscriber) {
      subscriber.disconnect();
      this.subscribers.delete(client);
    }
  }
}
