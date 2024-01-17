import { IApplication } from '.';
import { BaseService } from './Service';

export class BaseController extends BaseService {}

export interface IBaseController extends BaseController {}
export interface IBaseControllerCls {
  new (app: IApplication): IBaseController;
}
