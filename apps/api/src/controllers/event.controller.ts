import { logger } from '@/utils/logger';
import { getClientIp, parseIp } from '@/utils/parseIp';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { generateDeviceId } from '@openpanel/common';
import { getSalts } from '@openpanel/db';
import { eventsQueue } from '@openpanel/queue';
import { redis } from '@openpanel/redis';
import type { PostEventPayload } from '@openpanel/sdk';

export async function postEvent(
  request: FastifyRequest<{
    Body: PostEventPayload;
  }>,
  reply: FastifyReply
) {
  if (process.env.TEST_SELF_HOSTING) {
    try {
      logger.info('Sending event to op.coderax.se');
      // Test batching on a different service
      await fetch('https://op.coderax.se/api/event', {
        headers: {
          ['X-Forwarded-For']: request.headers['X-Forwarded-For'] as string,
          ['x-real-ip']: request.headers['x-real-ip'] as string,
          origin: request.headers.origin!,
          'user-agent': request.headers['user-agent']!,
          'Content-Type': 'application/json',
          'openpanel-client-id': request.headers[
            'openpanel-client-id'
          ] as string,
          'openpanel-client-secret': request.headers[
            'openpanel-client-secret'
          ] as string,
          'mixan-client-id': request.headers['mixan-client-id'] as string,
          'mixan-client-secret': request.headers[
            'mixan-client-secret'
          ] as string,
        },
        method: 'POST',
        body: JSON.stringify(request.body),
      })
        .then((res) => res.json())
        .catch((res) => res);
    } catch (e) {
      logger.error(e);
    }
  }
  const ip = getClientIp(request)!;
  const ua = request.headers['user-agent']!;
  const projectId = request.client?.projectId;

  if (!projectId) {
    reply.status(400).send('missing origin');
    return;
  }

  const [salts, geo] = await Promise.all([getSalts(), parseIp(ip)]);
  const currentDeviceId = generateDeviceId({
    salt: salts.current,
    origin: projectId,
    ip,
    ua,
  });
  const previousDeviceId = generateDeviceId({
    salt: salts.previous,
    origin: projectId,
    ip,
    ua,
  });

  // this will ensure that we don't have multiple events creating sessions
  const locked = await redis.set(
    `request:priority:${currentDeviceId}-${previousDeviceId}`,
    'locked',
    'EX',
    10,
    'NX'
  );

  eventsQueue.add('event', {
    type: 'incomingEvent',
    payload: {
      projectId: request.projectId,
      headers: {
        ua,
      },
      event: {
        ...request.body,
        // Dont rely on the client for the timestamp
        timestamp: new Date().toISOString(),
      },
      geo,
      currentDeviceId,
      previousDeviceId,
      priority: locked === 'OK',
    },
  });

  reply.status(202).send('ok');
}
