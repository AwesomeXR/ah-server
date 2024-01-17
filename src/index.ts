import 'reflect-metadata';

// for type
import * as Koa from 'koa';
import 'koa-body';

import { Schema } from 'ah-api-type';

export interface IApplication {}
export type ILifeCycleName = 'setup' | 'listen' | 'run' | 'close';
export type ILifeCycleHook = (app: IApplication) => Promise<any>;

export interface IService {}
export interface IContext extends Koa.Context {}

export type IRouterMethod = 'GET' | 'POST' | 'DELETE' | 'PUT';
export type IMiddleware = (ctx: IContext, next: () => Promise<any>) => Promise<any>;
export interface IRouterMeta {
  path: string;
  method: IRouterMethod | IRouterMethod[];
  middlewares?: IMiddleware[];
  query?: {
    tap?: ((q: any) => any) | 'tryParseIntProperty';
    schema: Schema;
  };
}

export interface IConfig {
  LOCAL_PORT: number;
}

export * from './App';
export * from './Config';
export * from './Controller';
export * from './Service';
export * from './util';
export * from './Scheduler';
export * from './error';
export * from './Event';
export * from './Extension';
export * from './refactor';
