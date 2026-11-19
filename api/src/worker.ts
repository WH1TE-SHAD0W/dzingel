import { createApp } from "./app";
import { d1Db } from "./d1-db";

export default {
  fetch: (req: Request, env: { DB: D1Database }) => createApp(d1Db(env.DB)).fetch(req),
};
