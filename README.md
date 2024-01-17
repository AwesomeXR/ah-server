# ah-server

轻量可扩展的 web server
- 基于 koa
- 类 [Egg.js](https://eggjs.org/zh-cn/intro/) 体验
- app、service、scheduler、context 模块

# TL;DR

```ts
import { App, Service, IService, Config } from 'ah-helper';

class AService extends Service {
  foo() {
    this.service.b.bar();
  }
}
class BService extends Service {
  bar() {
    this.service.a.foo();
  }
}

class DemoApp extends App {
  service: IService = {
    a: new AService(this),
    b: new BService(this),
  };
}

const app = new DemoApp(new Config());
app.start().catch(() => process.exit(1));
```
