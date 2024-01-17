import { ILifeCycleName, ILifeCycleHook, IBaseServiceCls, IMiddleware } from '.';

export type IBaseExtension = {
  app?: Record<string, any>;
  service?: Record<string, IBaseServiceCls>;
  middleware?: IMiddleware[];
  lifeCycle?: Partial<Record<ILifeCycleName, ILifeCycleHook>>;
};
