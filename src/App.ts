import { CronJob } from 'cron';
import * as Koa from 'koa';
import * as Router from 'koa-router';
import * as koaBody from 'koa-body';
import * as urllib from 'urllib';
import { Logger } from 'ah-logger';
import { BaseScheduler } from './Scheduler';
import { getLifeCycleMeta, IApplication, IBaseSchedulerCls, IBaseServiceCls, IConfig, IContext, ILifeCycleName, IMiddleware } from '.';
import { ErrorTypeEnum } from './error';
import { getOwnPropertyEntries, mapValues, pick, tryParseIntProperty, validate } from './util';
import { BaseController, IBaseControllerCls } from './Controller';
import * as http from 'http';
import * as https from 'https';
import { CloseEvt, ErrorEvt, ReadyEvt } from './Event';
import * as fs from 'fs';
import { IBaseExtension } from './Extension';
import { getRouterMeta } from './refactor';
import * as jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import * as crypto from 'crypto';

declare module '.' {
  // eslint-disable-next-line
  interface IApplication extends Koa {
    config: IConfig;
    logger: Logger;
    service: IService;
    controllers: BaseController[];
    schedulers: BaseScheduler[];
    middlewares: IMiddleware[];

    lifeCycleHooks: Record<ILifeCycleName, ILifeCycleHook[]>;

    curl: <T>(url: string, opt?: urllib.RequestOptions | undefined) => Promise<urllib.HttpClientResponse<T>>;
    runInBackground: (callback: () => Promise<any>) => void;
    jwt: {
      sign: <T extends Record<string, any>>(payload: T, opt?: jwt.SignOptions) => string;
      verify: <T extends unknown>(token: string, opt?: jwt.VerifyOptions | undefined) => T | null;
    };
    uuid: (prefix?: string) => string;
    encrypt(input: string): string;
    randomString(length: number): string;
    md5(body: string | Buffer): string;
  }

  // eslint-disable-next-line
  interface IContext {
    validate: typeof validate;
    app: IApplication;
  }
}

export type createAppOpt = {
  config: IConfig;
  service: Record<string, IBaseServiceCls>;
  controllers: IBaseControllerCls[];
  schedulers?: IBaseSchedulerCls[];
  middlewares?: IMiddleware[];
  extensions?: IBaseExtension[];
  lifeCycleHooks?: Partial<IApplication['lifeCycleHooks']>;

  logger?: Logger;

  mixin?: Record<string, any>;
};

export const createApp = ({
  config,
  service,
  controllers,
  schedulers = [],
  middlewares = [],
  extensions = [],
  lifeCycleHooks = {},
  logger = new Logger('APP'),
  mixin,
}: createAppOpt) => {
  const app = new Koa() as IApplication;

  // mixin 要首先执行
  Object.assign(app, mixin);

  // merge base props
  // =================================

  app.config = config;
  app.logger = logger;
  app.service = mapValues(service, S => new S(app));

  app.controllers = controllers.map(C => new C(app));
  app.schedulers = schedulers.map(S => new S(app));

  app.middlewares = middlewares;

  app.lifeCycleHooks = {
    setup: lifeCycleHooks.setup?.concat() || [],
    listen: lifeCycleHooks.listen?.concat() || [],
    run: lifeCycleHooks.run?.concat() || [],
    close: lifeCycleHooks.close?.concat() || [],
  };

  // 扩展 ctx
  Object.assign(app.context, { validate, app });

  // 全局错误
  app.on('error', err => {
    let msg = err.message || err;
    if (err.stack) msg += '\n' + err.stack;

    app.logger.error(msg);

    app.emit(ErrorEvt, { error: err } as ErrorEvt);
  });

  // merge extensions
  // ==============================

  extensions.forEach(ext => {
    if (ext.app) {
      Object.entries(ext.app).forEach(([k, v]) => {
        (app as any)[k] = typeof v === 'function' ? v.bind(app) : v;
      });
    }

    if (ext.service) {
      Object.entries(ext.service).forEach(([k, S]) => {
        (app.service as any)[k] = new S(app);
      });
    }

    if (ext.middleware) ext.middleware.forEach(mid => app.middlewares.push(mid));

    if (ext.lifeCycle) {
      Object.entries(ext.lifeCycle).forEach(([_type, hook]) => {
        const type = _type as ILifeCycleName;
        app.lifeCycleHooks[type].push(hook);
      });
    }
  });

  // 要等上面 extensions 的 middlewares 也 push 进来
  app.middlewares.forEach(m => app.use(m));

  // 注解收集 lifeCycle hooks
  {
    Object.entries(app.service).forEach(([sName, sIns]) => {
      getOwnPropertyEntries(sIns).forEach(([sMethodName, sMethod]) => {
        if (typeof sMethod !== 'function') return;

        const lifeCycleName = getLifeCycleMeta(sIns, sMethodName);
        if (!lifeCycleName) return;

        app.lifeCycleHooks[lifeCycleName].push(async _app => (_app.service as any)[sName][sMethodName]());

        app.logger.info(`register lifeCycle ${lifeCycleName}: ${sName}.${sMethodName}`);
      });
    });
  }

  // setup controller
  {
    app.use(koaBody({ multipart: true }));

    // 构造 router
    const router = new Router<any, IContext>();

    app.controllers.forEach(ctrlIns => {
      getOwnPropertyEntries(ctrlIns).forEach(([pName, handler]) => {
        if (typeof handler !== 'function') return;

        const rMeta = getRouterMeta(ctrlIns, pName);
        if (!rMeta) return;

        app.logger.info(`register controller: ${rMeta.method} ${rMeta.path} -> ${ctrlIns.name}.${handler.name}`);

        const name = [ctrlIns.name, handler.name].join('.');
        const methods = Array.isArray(rMeta.method) ? rMeta.method : [rMeta.method];

        const wrapperMid: IMiddleware = async (ctx, next) => {
          try {
            return await next();
          } catch (err: any) {
            // 自定义异常
            if (Object.values(ErrorTypeEnum).includes(err.type)) {
              ctx.status = err.status;
              ctx.body = pick(err, ['message', 'type', 'code', 'status']);
              return;
            }

            // 其他异常外抛
            throw err;
          }
        };

        const ctrlMids = [
          wrapperMid,
          ...(rMeta.middlewares || []),
          async (ctx: IContext) => {
            let q: any;

            if (rMeta.query) {
              q = {
                ...ctx.params,
                ...ctx.request.query,
                ...ctx.request.body,
                ...ctx.request.files,
              };

              if (rMeta.query.tap) {
                if (typeof rMeta.query.tap === 'function') q = rMeta.query.tap(q);
                else if (rMeta.query.tap === 'tryParseIntProperty') q = tryParseIntProperty(q);
              }

              q = ctx.validate<any>(q, rMeta.query.schema);
            }

            const data = await handler.call(ctrlIns, ctx, q);
            if (data) ctx.body = data;
          },
        ];

        if (methods.includes('GET')) router.get(name, rMeta.path, ...ctrlMids);
        if (methods.includes('POST')) router.post(name, rMeta.path, ...ctrlMids);
        if (methods.includes('PUT')) router.put(name, rMeta.path, ...ctrlMids);
        if (methods.includes('DELETE')) router.delete(name, rMeta.path, ...ctrlMids);
      });
    });

    app.use(router.routes());
    app.use(router.allowedMethods());
  }

  // setup scheduler
  const schedulerStartList: (() => void)[] = app.schedulers
    .map(s => {
      const sLogger = app.logger.extend(s.name);

      if (s.timer.type === 'cron') {
        const { cron } = s.timer;
        return () => {
          new CronJob(
            cron,
            () => {
              s.invoke().catch(e => {
                sLogger.error(`${s.name} error: ${e.message || e}`);
              });
            },
            undefined,
            false, // start
            undefined, // timeZone
            undefined, // context
            !!s.immediately // runOnInit
          ).start();
        };
      }

      if (s.timer.type === 'interval') {
        const { interval } = s.timer;
        return () => {
          const invoke = () => {
            s.invoke()
              .then(() => setTimeout(invoke, interval))
              .catch(e => {
                sLogger.error(`${s.name} error: ${e.message || e}`);
                setTimeout(invoke, interval);
              });
          };

          if (s.immediately) invoke();
          else setTimeout(invoke, interval);
        };
      }
    })
    .filter(v => !!v) as any;

  // builtin utils
  // =============================
  app.curl = async <T>(url: string, opt?: urllib.RequestOptions) => {
    return urllib.request<T>(url, opt);
  };

  app.runInBackground = (callback: () => Promise<any>) => {
    const _asyncStack = new Error('').stack || '<null>';

    setTimeout(() => {
      callback().catch(err => {
        app.logger.error('[BG] %s\n--- async ---\n%s', err.message, _asyncStack);
      });
    }, 0);
  };

  app.jwt = {
    sign: <T extends Record<string, any>>(payload: T, opt: jwt.SignOptions = {}) => jwt.sign(payload, app.config.AUTH_SALT, opt),
    //
    verify: <T extends any>(token: string, opt?: jwt.VerifyOptions) => {
      try {
        return jwt.verify(token, app.config.AUTH_SALT, opt) as T;
      } catch (err) {
        if (err instanceof jwt.JsonWebTokenError) return null;
        if (err instanceof jwt.NotBeforeError) return null;
        if (err instanceof jwt.TokenExpiredError) return null;
        throw err;
      }
    },
  };

  app.uuid = (prefix = '') => {
    return prefix + uuid();
  };

  app.encrypt = (input: string) => {
    return crypto.createHmac('sha256', app.config.AUTH_SALT).update(input).digest('hex');
  };

  app.randomString = (length: number): string => {
    return crypto
      .randomBytes(Math.ceil(length / 2))
      .toString('hex')
      .slice(0, length);
  };

  app.md5 = (body: string | Buffer) => {
    return crypto.createHash('md5').update(body).digest('hex');
  };

  // export apis
  // ================================

  const run = async () => {
    app.logger.info(app.config.sequelize());

    // invoke hook:setup
    app.logger.info('[LifeCycle] setup %s', app.lifeCycleHooks.setup.length);
    await Promise.all(app.lifeCycleHooks.setup.map(h => h(app)));

    const callback = app.callback();

    const server =
      app.config.HTTPS_KEY && app.config.HTTPS_CERT
        ? https.createServer(
            {
              key: fs.readFileSync(app.config.HTTPS_KEY, 'utf-8'),
              cert: fs.readFileSync(app.config.HTTPS_CERT, 'utf-8'),
            },
            callback
          )
        : http.createServer(callback);

    const port = app.config.LOCAL_PORT;
    const hostname = app.config.HOSTNAME;

    server.listen(port, hostname);

    // invoke hook:listen
    app.logger.info('[LifeCycle] listen %s', app.lifeCycleHooks.listen.length);
    await Promise.all(app.lifeCycleHooks.listen.map(h => h(app)));

    app.logger.info(`app start at ${hostname}:${port}`);

    // scheduler 放到启动后
    schedulerStartList.forEach(s => s());

    // invoke hook:run
    app.logger.info('[LifeCycle] run %s', app.lifeCycleHooks.run.length);
    await Promise.all(app.lifeCycleHooks.run.map(h => h(app)));

    app.emit(ReadyEvt, { server } as ReadyEvt);

    // return stop functions
    return async () => {
      // invoke hook:close
      app.logger.info('[LifeCycle] close', app.lifeCycleHooks.close.length);
      await Promise.all(app.lifeCycleHooks.close.map(h => h(app)));

      return new Promise<void>((resolve, reject) => {
        // 优雅退出
        // @see https://zhuanlan.zhihu.com/p/275312155?utm_source=wechat_session&utm_medium=social&utm_oi=39191756931072
        server.close(err => {
          if (err) return reject(err);
          return resolve();
        });
      }).finally(() => app.emit(CloseEvt));
    };
  };

  return { app, run };
};
