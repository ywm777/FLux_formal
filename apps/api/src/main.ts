import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { resolveApiPort, resolveCorsOrigins } from "./config/runtime-config";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: resolveCorsOrigins(),
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
  });
  app.enableShutdownHooks();
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const port = resolveApiPort();
  const host = process.env.API_HOST?.trim() || "127.0.0.1";
  await app.listen(port, host);
  // eslint-disable-next-line no-console
  console.log(`Flux API 已启动: http://${host}:${port}/api`);
}

void bootstrap();
