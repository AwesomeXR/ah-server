import { ILifeCycleName, IRouterMeta } from '.';

export const MetaKey = {
  route: 'ah:design:route',
  lifeCycle: 'ah:design:lifeCycle',
};

/** 路由注解 */
export const router = (meta: IRouterMeta) => Reflect.metadata(MetaKey.route, meta);
export const getRouterMeta = (target: any, property: string): IRouterMeta | undefined =>
  Reflect.getMetadata(MetaKey.route, target, property);

/** 生命周期注解 */
export const lifeCycle = (name: ILifeCycleName) => Reflect.metadata(MetaKey.lifeCycle, name);
export const getLifeCycleMeta = (target: any, property: string): ILifeCycleName | undefined =>
  Reflect.getMetadata(MetaKey.lifeCycle, target, property);
