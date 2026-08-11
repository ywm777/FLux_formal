import { DynamicModule, Global, Logger, Module } from "@nestjs/common";
import { DataSource } from "typeorm";
import { buildDataSourceOptions } from "./data-source";
import { resolveDataDir } from "./file/paths";
import { FileDb } from "./file/file-db";
import { FileUsersRepository } from "./file/file-users.repository";
import { FileWorkflowsRepository } from "./file/file-workflows.repository";
import { FileExecutionsRepository } from "./file/file-executions.repository";
import { UsersRepository } from "./repositories/users.repository";
import { WorkflowsRepository } from "./repositories/workflows.repository";
import { ExecutionsRepository } from "./repositories/executions.repository";
import { TypeOrmUsersRepository } from "./typeorm/typeorm-users.repository";
import { TypeOrmWorkflowsRepository } from "./typeorm/typeorm-workflows.repository";
import { TypeOrmExecutionsRepository } from "./typeorm/typeorm-executions.repository";
import { AiConnectionsRepository } from "./repositories/ai-connections.repository";
import { FileAiConnectionsRepository } from "./file/file-ai-connections.repository";
import { TypeOrmAiConnectionsRepository } from "./typeorm/typeorm-ai-connections.repository";

const DATA_SOURCE = "FLUX_DATA_SOURCE";

@Global()
@Module({})
export class DatabaseModule {
  static forRoot(): DynamicModule {
    const options = buildDataSourceOptions();
    const logger = new Logger(DatabaseModule.name);

    if (!options) {
      const dataDir = resolveDataDir();
      logger.log(`使用工作区文件持久化：${dataDir}`);
      return {
        module: DatabaseModule,
        providers: [
          FileDb,
          { provide: UsersRepository, useClass: FileUsersRepository },
          { provide: WorkflowsRepository, useClass: FileWorkflowsRepository },
          { provide: ExecutionsRepository, useClass: FileExecutionsRepository },
          {
            provide: AiConnectionsRepository,
            useClass: FileAiConnectionsRepository,
          },
        ],
        exports: [
          UsersRepository,
          WorkflowsRepository,
          ExecutionsRepository,
          AiConnectionsRepository,
        ],
      };
    }

    logger.log("已配置 DATABASE_URL，使用 PostgreSQL（TypeORM）仓储");
    return {
      module: DatabaseModule,
      providers: [
        {
          provide: DATA_SOURCE,
          useFactory: async () => {
            const dataSource = new DataSource(options);
            await dataSource.initialize();
            if (!options.synchronize && await dataSource.showMigrations()) {
              await dataSource.destroy();
              throw new Error(
                "数据库结构不是当前版本；请先运行 pnpm --filter @flux/api migration:run",
              );
            }
            return dataSource;
          },
        },
        { provide: DataSource, useExisting: DATA_SOURCE },
        { provide: UsersRepository, useClass: TypeOrmUsersRepository },
        { provide: WorkflowsRepository, useClass: TypeOrmWorkflowsRepository },
        {
          provide: ExecutionsRepository,
          useClass: TypeOrmExecutionsRepository,
        },
        {
          provide: AiConnectionsRepository,
          useClass: TypeOrmAiConnectionsRepository,
        },
      ],
      exports: [
        UsersRepository,
        WorkflowsRepository,
        ExecutionsRepository,
        AiConnectionsRepository,
        DataSource,
      ],
    };
  }
}
