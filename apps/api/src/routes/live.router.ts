import * as controller from '@/controllers/live.controller';
import fastifyWS from '@fastify/websocket';
import type { FastifyPluginCallback } from 'fastify';

const liveRouter: FastifyPluginCallback = (fastify, opts, done) => {
  fastify.route({
    method: 'GET',
    url: '/events/test/:projectId',
    handler: controller.test,
  });

  fastify.register(fastifyWS);

  fastify.register((fastify, _, done) => {
    fastify.get(
      '/visitors/:projectId',
      { websocket: true },
      controller.wsVisitors
    );
    fastify.get('/events', { websocket: true }, controller.wsEvents);
    fastify.get(
      '/events/:projectId',
      { websocket: true },
      controller.wsProjectEvents
    );
    done();
  });

  done();
};

export default liveRouter;
