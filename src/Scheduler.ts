import { IApplication } from '.';
import { BaseService } from './Service';

export type ISchedulerTimer = { type: 'cron'; cron: string } | { type: 'interval'; interval: number };

/** 基础调度服务 */
export abstract class BaseScheduler extends BaseService {
  immediately?: boolean;

  abstract timer: ISchedulerTimer;
  abstract invoke(): Promise<void>;
}

export interface IBaseScheduler extends BaseScheduler {}
export interface IBaseSchedulerCls {
  new (app: IApplication): IBaseScheduler;
}
