// eslint-disable-next-line
export enum ErrorTypeEnum {
  custom = 'custom',
}

export const createBaseBizError = (message: string, type: ErrorTypeEnum, status: number, code: string = 'unknown') => {
  return Object.assign(new Error(message), { type, status, code });
};

/** 业务错误，和系统错误区分开 */
export const createBizError = (message: string, code?: string) => {
  return createBaseBizError(message, ErrorTypeEnum.custom, 400, code);
};

export const createUnAuthError = (message: string, code?: string) => {
  return createBaseBizError(message, ErrorTypeEnum.custom, 401, code);
};

export const createForbiddenError = (message: string, code?: string) => {
  return createBaseBizError(message, ErrorTypeEnum.custom, 403, code);
};
