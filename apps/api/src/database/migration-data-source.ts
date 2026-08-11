import { DataSource } from "typeorm";
import { buildDataSourceOptions } from "./data-source";

const options = buildDataSourceOptions();
if (!options) {
  throw new Error("运行数据库迁移前必须配置 DATABASE_URL");
}

/** TypeORM CLI entrypoint. Schema synchronization remains disabled here. */
export default new DataSource({
  ...options,
  synchronize: false,
});
