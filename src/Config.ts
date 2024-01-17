declare module '.' {
  interface IConfig extends BaseConfig {}
}

export class BaseConfig {
  readonly LOCAL_PORT: number = +(process.env.AH_LOCAL_PORT || process.env.LOCAL_PORT || '10001');
  readonly HOSTNAME = process.env.AH_HOSTNAME || process.env.HOSTNAME || 'localhost';

  readonly HTTPS_KEY = process.env.AH_HTTPS_KEY || process.env.HTTPS_KEY;
  readonly HTTPS_CERT = process.env.AH_HTTPS_CERT || process.env.HTTPS_CERT;
  readonly AUTH_SALT = process.env.AH_AUTH_SALT || process.env.AUTH_SALT || 'x';

  sequelize() {
    return Object.entries(this)
      .filter(([, v]) => typeof v !== 'undefined')
      .map(([n, v]) => `${n}=${v}`)
      .join(' ');
  }
}
