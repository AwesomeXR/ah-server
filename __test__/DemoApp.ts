import {
  createApp,
  BaseController,
  IContext,
  BaseService,
  IMiddleware,
  router,
  lifeCycle,
} from '../src';

class InspectService extends BaseService {
  @lifeCycle('setup')
  protected setup() {
    this.logger.info('InspectService init');
  }

  @lifeCycle('listen')
  protected listen() {
    this.logger.info('InspectService listen');
  }

  @lifeCycle('run')
  protected run() {
    this.logger.info('InspectService run');
  }

  @lifeCycle('close')
  protected close() {
    this.logger.info('InspectService close');
  }

  echo(text: string) {
    return text;
  }
}

class EchoController extends BaseController {
  @router({
    path: '/echo',
    method: ['GET', 'POST'],
    query: {
      schema: {
        type: 'object',
        properties: { text: { type: 'string' } },
      },
    },
  })
  async echo(_ctx: IContext, q: { text?: string }) {
    const output = (this.service as any).inspect.echo(q.text);
    await new Promise(resolve => setTimeout(resolve, 500));
    return { output };
  }
}

class HomeController extends BaseController {
  @router({ path: '/', method: ['GET'] })
  async index(ctx: IContext) {
    ctx.body = '<h1>Hi</h1>';
  }

  @router({
    path: '/file',
    method: ['POST'],
    query: {
      schema: {
        type: 'object',
        properties: {
          a: { type: 'string' },
          file: {
            type: 'object',
            properties: { path: { type: 'string' } },
            required: ['path'],
          },
        },
        required: ['a'],
      },
    },
  })
  async uploadFile(_ctx: IContext, q: { a: string; file: { path: string } }) {
    return q;
  }

  @router({
    path: '/queryTap',
    method: ['GET'],
    query: {
      tap: 'tryParseIntProperty',
      schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          pageNum: { type: 'integer' },
        },
        required: ['title', 'pageNum'],
      },
    },
  })
  async queryTap(_ctx: IContext, q: { pageNum: number; title: string }) {
    return q;
  }
}

const testMiddlewareA: IMiddleware = async (ctx, next) => {
  ctx.response.set({ 'x-a': 'a' });
  return next();
};

const testMiddlewareB: IMiddleware = async (ctx, next) => {
  ctx.response.set({ 'x-b': 'b' });
  return next();
};

export const createTestApp = (config: any) => {
  return createApp({
    config,
    service: { inspect: InspectService },
    controllers: [HomeController, EchoController],
    middlewares: [testMiddlewareA, testMiddlewareB],
  });
};
