import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { importPKCS8, SignJWT } from 'jose';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service.js';

const credentialsSchema = z.object({
  project_id: z.string().min(1),
  client_email: z.string().email(),
  private_key: z.string().min(1),
});
@Injectable()
export class ChatPushService {
  private cached?: { token: string; expiresAt: number };
  constructor(private readonly prisma: PrismaService) {}
  get configured() {
    return Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  }
  private async authorization() {
    const credentials = credentialsSchema.parse(
      JSON.parse(
        await readFile(process.env.GOOGLE_APPLICATION_CREDENTIALS!, 'utf8'),
      ),
    );
    if (this.cached && this.cached.expiresAt > Date.now() + 60000)
      return { ...credentials, accessToken: this.cached.token };
    const key = await importPKCS8(credentials.private_key, 'RS256');
    const assertion = await new SignJWT({
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(credentials.client_email)
      .setAudience('https://oauth2.googleapis.com/token')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(key);
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    if (!response.ok) throw new Error('Không xác thực được dịch vụ thông báo');
    const body = z
      .object({ access_token: z.string(), expires_in: z.number() })
      .parse(await response.json());
    this.cached = {
      token: body.access_token,
      expiresAt: Date.now() + body.expires_in * 1000,
    };
    return { ...credentials, accessToken: body.access_token };
  }
  async send(threadId: string) {
    if (!this.configured) return;
    const thread = await this.prisma.chatThread.findUnique({
      where: { id: threadId },
      include: { messages: { orderBy: { sequence: 'desc' }, take: 1 } },
    });
    if (
      !thread ||
      thread.muted ||
      thread.archived ||
      thread.lastReadSequence >= thread.lastSequence
    )
      return;
    const devices = await this.prisma.chatDevice.findMany({
      where: { userId: thread.userId },
    });
    if (!devices.length) return;
    const auth = await this.authorization();
    for (const device of devices) {
      // Re-check binding immediately before delivery so sign-out/account switches detach tokens.
      if (
        !(await this.prisma.chatDevice.findFirst({
          where: { id: device.id, userId: thread.userId, token: device.token },
        }))
      )
        continue;
      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(auth.project_id)}/messages:send`,
        {
          method: 'POST',
          signal: AbortSignal.timeout(15000),
          headers: {
            Authorization: `Bearer ${auth.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token: device.token,
              notification: {
                title: thread.title,
                body:
                  thread.messages[0]?.content.slice(0, 180) ??
                  'Bạn có tin nhắn mới',
              },
              data: {
                threadId,
                userId: thread.userId,
                messageId: thread.messages[0]?.id ?? '',
              },
              android: {
                priority: 'HIGH',
                ttl: '300s',
                collapse_key: threadId,
                notification: {
                  channel_id: 'friends',
                  tag: threadId,
                  click_action: 'com.englishdrive.OPEN_CHAT',
                },
              },
            },
          }),
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: { details?: Array<{ errorCode?: string }> };
        };
        if (body.error?.details?.some((d) => d.errorCode === 'UNREGISTERED')) {
          await this.prisma.chatDevice.deleteMany({
            where: { id: device.id, token: device.token },
          });
        } else throw new Error(`Không gửi được thông báo (${response.status})`);
      }
    }
  }
}
